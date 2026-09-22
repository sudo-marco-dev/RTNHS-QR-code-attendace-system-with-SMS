/*
  ESP32-CAM QR Scanner — Network Camera & Attendance Terminal
  Board: AI-Thinker ESP32-CAM (OV2640)
  
  Features:
    - Dynamic WiFi Configuration (Captive Portal via Preferences.h & DNSServer)
      * No hardcoded WiFi credentials
      * Auto-fallback to hotspot (RTNHS-Scanner-AP @ 192.168.4.1) on connection failure
      * Web portal with network scanning & persistent flash storage
    - Rolling Scanned Students History on OLED Screen
      * Displays the last 4 scanned students persistently
      * Shows total scans counter & WiFi status
      * Eliminates fragile "SCANNING..." modal loop and disappearing names
    - QR-optimized OV2640 sensor configuration (VGA 640x480, high contrast)
    - mDNS broadcast ("rtnhs-scanner.local")
    - Full CORS headers with non-blocking GET & POST handlers
    - Fast 400kHz I2C bus for SH1106 OLED display

  Arduino IDE setup:
    - Board: "AI Thinker ESP32-CAM"
    - Partition Scheme: "Huge APP (3MB No OTA/1MB SPIFFS)"
    - PSRAM: Enabled
*/

#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include <Preferences.h>
#include <DNSServer.h>

// ---- OLED Setup (SH1106 128x64 I2C) ----
#define I2C_SDA 14
#define I2C_SCL 15
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SH1106G display = Adafruit_SH1106G(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// ---- AI-Thinker ESP32-CAM Pin Map ----
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27
#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22
#define FLASH_LED_GPIO_NUM 4

// ---- Network & Server Configuration ----
const char* AP_SSID = "RTNHS-Scanner-AP";
const char* MDNS_HOSTNAME = "rtnhs-scanner";
const byte DNS_PORT = 53;
DNSServer dnsServer;
WebServer server(80);
Preferences preferences;

bool isAPMode = false;
unsigned long bootTime = 0;
bool flashOn = false;
unsigned long lastCaptureTime = 0;
unsigned long lastOledPeriodicUpdate = 0;

// ---- Scanned History Ring Buffer ----
struct ScanRecord {
  int scanId;
  String name;
  String status; // "OK", "LT", "DUP", "ERR"
};

#define MAX_HISTORY 4
ScanRecord scanHistory[MAX_HISTORY];
int historyCount = 0;
int totalScans = 0;

// Forward declarations
void updateOLED();
void startStationMode(const String& ssid, const String& password);
void startCaptivePortal();

// ---- CORS helper: adds headers to every response ----
void sendCorsHeaders() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
  server.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  server.sendHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  server.sendHeader("Access-Control-Max-Age", "86400");
}

// ---- Lightweight JSON extractor ----
String extractJsonValue(const String& json, const String& key) {
  String searchKey = "\"" + key + "\"";
  int keyIndex = json.indexOf(searchKey);
  if (keyIndex == -1) return "";
  int colonIndex = json.indexOf(':', keyIndex + searchKey.length());
  if (colonIndex == -1) return "";

  int startVal = colonIndex + 1;
  while (startVal < json.length() && (json[startVal] == ' ' || json[startVal] == '\t' || json[startVal] == '\r' || json[startVal] == '\n')) {
    startVal++;
  }
  if (startVal >= json.length()) return "";

  if (json[startVal] == '\"') {
    startVal++;
    int endQuote = json.indexOf('\"', startVal);
    if (endQuote == -1) return "";
    return json.substring(startVal, endQuote);
  } else {
    int endVal = startVal;
    while (endVal < json.length() && json[endVal] != ',' && json[endVal] != '}' && json[endVal] != '\n' && json[endVal] != '\r') {
      endVal++;
    }
    String val = json.substring(startVal, endVal);
    val.trim();
    return val;
  }
}

// ====================================================================
// ---- OLED DISPLAY RENDERING ----
// ====================================================================

// Helper: Center text horizontally
void drawCenteredText(const String& text, int y, int textSize = 1) {
  display.setTextSize(textSize);
  display.setTextColor(SH110X_WHITE, SH110X_BLACK);
  display.setTextWrap(false);
  int charWidth = 6 * textSize;
  int textWidth = text.length() * charWidth;
  int x = (SCREEN_WIDTH - textWidth) / 2;
  if (x < 0) x = 0;
  display.setCursor(x, y);
  display.print(text);
}

// ---- Scrolling IP ticker state ----
String ipScrollText = "";
unsigned long ipScrollLastUpdate = 0;
int ipScrollOffset = 0;

// Top Status Bar (Height: 0 to 9px, dividing line at Y=10)
void drawTopStatusBar() {
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE, SH110X_BLACK);
  display.setTextWrap(false);

  // Build the full IP string
  String ipText = "";
  if (isAPMode) {
    ipText = "AP:192.168.4.1";
  } else if (WiFi.status() == WL_CONNECTED) {
    IPAddress ip = WiFi.localIP();
    ipText = String(ip[0]) + "." + String(ip[1]) + "." + String(ip[2]) + "." + String(ip[3]);
  } else {
    ipText = "NO WIFI";
  }

  // Right: Total Scans count badge
  String countBadge = "[#" + String(totalScans) + "]";
  int badgeWidth = countBadge.length() * 6;
  int badgeX = SCREEN_WIDTH - badgeWidth;

  // Available pixel width for IP (leave 1 char gap before badge)
  int availableWidth = badgeX - 6; // 6px gap
  int ipPixelWidth = ipText.length() * 6;

  display.setCursor(0, 0);

  if (ipPixelWidth <= availableWidth) {
    // Fits — just print it
    display.print(ipText);
    ipScrollText = ""; // reset scroll state
  } else {
    // Doesn't fit — horizontal scroll ticker
    // Pad with spaces for smooth wrap-around
    String padded = ipText + "   " + ipText;
    int maxOffset = ipText.length() + 3; // length of one cycle

    // Update scroll position every 300ms
    unsigned long now = millis();
    if (ipScrollText != ipText) {
      // IP changed, reset scroll
      ipScrollText = ipText;
      ipScrollOffset = 0;
      ipScrollLastUpdate = now;
    }
    if (now - ipScrollLastUpdate >= 300) {
      ipScrollLastUpdate = now;
      ipScrollOffset = (ipScrollOffset + 1) % maxOffset;
    }

    // Calculate how many chars fit in available width
    int maxChars = availableWidth / 6;
    if (maxChars < 1) maxChars = 1;

    String visible = padded.substring(ipScrollOffset, ipScrollOffset + maxChars);
    display.print(visible);
  }

  // Draw badge on the right
  display.setCursor(badgeX, 0);
  display.print(countBadge);

  // Thin dividing line
  display.drawLine(0, 10, SCREEN_WIDTH - 1, 10, SH110X_WHITE);
}

// Draw AP Setup Screen on OLED
void drawAPScreen() {
  display.clearDisplay();
  drawTopStatusBar();

  drawCenteredText(">> SETUP WIFI <<", 14, 1);
  display.setCursor(0, 26);
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE, SH110X_BLACK);
  display.println("1. Connect device to:");
  display.println("   RTNHS-Scanner-AP");
  display.println("2. Open browser to:");
  display.println("   192.168.4.1");
  display.display();
}

// Draw Main Scanner View: Rolling Scanned History List
void drawHistoryScreen() {
  display.clearDisplay();
  drawTopStatusBar();

  if (historyCount == 0) {
    // Idle / Ready screen
    drawCenteredText("READY TO SCAN", 20, 1);
    drawCenteredText("Point QR at Camera", 34, 1);
    drawCenteredText("Scans appear here", 48, 1);
  } else {
    // Render list of recent scans (up to 4 lines)
    // Line 1: latest scan with arrow indicator
    for (int i = 0; i < historyCount && i < MAX_HISTORY; i++) {
      int y = 14 + (i * 12); // Lines at Y = 14, 26, 38, 50

      display.setCursor(0, y);
      display.setTextSize(1);
      display.setTextWrap(false);

      if (i == 0) {
        // Latest scan: show arrow indicator
        display.setTextColor(SH110X_WHITE, SH110X_BLACK);
        display.print(">");
      } else {
        display.setTextColor(SH110X_WHITE, SH110X_BLACK);
        display.print(" ");
      }

      // Format line: Name (truncated to fit) + status badge
      // Max chars per line = 21. Format: "> 18.NAME       [OK]"
      String name = scanHistory[i].name;
      String status = scanHistory[i].status;

      // Available width for name: 21 - 2(prefix) - 1(space) - status.length()
      int maxNameLen = 21 - 2 - 1 - status.length();
      if (maxNameLen < 5) maxNameLen = 5;

      if (name.length() > maxNameLen) {
        name = name.substring(0, maxNameLen);
      }

      display.print(name);

      // Align status badge to right margin
      int statusX = SCREEN_WIDTH - (status.length() * 6);
      display.setCursor(statusX, y);
      display.print(status);
    }
  }

  display.display();
}

// Master OLED redraw
void updateOLED() {
  if (isAPMode) {
    drawAPScreen();
  } else {
    drawHistoryScreen();
  }
}

// ====================================================================
// ---- CAPTIVE PORTAL & WEB SERVER HANDLERS ----
// ====================================================================

// Captive Portal HTML Page
void handlePortalRoot() {
  // Scan available networks
  int n = WiFi.scanNetworks();
  String options = "";
  for (int i = 0; i < n; i++) {
    String ssid = WiFi.SSID(i);
    int rssi = WiFi.RSSI(i);
    if (ssid.length() > 0) {
      options += "<option value=\"" + ssid + "\">" + ssid + " (" + String(rssi) + " dBm)</option>";
    }
  }

  String html = "<!DOCTYPE html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
  html += "<title>RTNHS Scanner WiFi Setup</title>";
  html += "<style>";
  html += "body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 20px; margin: 0; }";
  html += ".card { max-width: 400px; margin: 20px auto; background: #1e293b; padding: 24px; border-radius: 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }";
  html += "h2 { margin-top: 0; font-size: 20px; color: #38bdf8; text-align: center; }";
  html += "p { font-size: 13px; color: #94a3b8; text-align: center; margin-bottom: 24px; }";
  html += "label { font-size: 12px; font-weight: 600; color: #cbd5e1; display: block; margin-bottom: 6px; }";
  html += "select, input[type='text'], input[type='password'] { width: 100%; box-sizing: border-box; padding: 12px; margin-bottom: 18px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: #fff; font-size: 14px; }";
  html += "button { width: 100%; padding: 14px; background: #0284c7; color: #fff; font-weight: bold; border: none; border-radius: 8px; font-size: 15px; cursor: pointer; }";
  html += "button:active { background: #0369a1; }";
  html += ".footer { text-align: center; font-size: 11px; color: #64748b; margin-top: 20px; }";
  html += "</style></head><body>";
  html += "<div class=\"card\">";
  html += "<h2>RTNHS QR Scanner</h2>";
  html += "<p>Select your local school or home WiFi network to connect the scanner module.</p>";
  html += "<form method=\"POST\" action=\"/save\">";
  html += "<label for=\"ssid\">Select WiFi Network (" + String(n) + " found)</label>";
  html += "<select name=\"ssid\" id=\"ssid\">" + options + "</select>";
  html += "<label for=\"manual_ssid\">Or Enter Manual SSID</label>";
  html += "<input type=\"text\" name=\"manual_ssid\" placeholder=\"Hidden network name...\">";
  html += "<label for=\"password\">WiFi Password</label>";
  html += "<input type=\"password\" name=\"password\" placeholder=\"Enter password...\">";
  html += "<button type=\"submit\">Save & Connect</button>";
  html += "</form>";
  html += "<div class=\"footer\">ESP32-CAM Attendance Module</div>";
  html += "</div></body></html>";

  server.send(200, "text/html", html);
}

// Save credentials & restart
void handlePortalSave() {
  String ssid = server.arg("manual_ssid");
  ssid.trim();
  if (ssid.length() == 0) {
    ssid = server.arg("ssid");
    ssid.trim();
  }
  String password = server.arg("password");
  password.trim();

  if (ssid.length() == 0) {
    server.send(400, "text/plain", "SSID cannot be empty");
    return;
  }

  // Save to Preferences flash
  preferences.begin("scanner-wifi", false);
  preferences.putString("ssid", ssid);
  preferences.putString("pass", password);
  preferences.end();

  String html = "<!DOCTYPE html><html><head><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">";
  html += "<style>body{background:#0f172a;color:#fff;font-family:sans-serif;padding:30px;text-align:center;}</style></head><body>";
  html += "<h2 style=\"color:#38bdf8;\">Credentials Saved!</h2>";
  html += "<p>Connecting to <b>" + ssid + "</b>...</p>";
  html += "<p style=\"color:#94a3b8;\">The ESP32-CAM is restarting. Watch the OLED screen for connection status.</p>";
  html += "</body></html>";
  server.send(200, "text/html", html);

  delay(1500);
  ESP.restart();
}

// Remote reset WiFi endpoint (allows resetting saved network)
void handleResetWifi() {
  sendCorsHeaders();
  preferences.begin("scanner-wifi", false);
  preferences.clear();
  preferences.end();

  server.send(200, "application/json", "{\"status\":\"ok\",\"action\":\"wifi_cleared_restarting\"}");
  delay(1000);
  ESP.restart();
}

// ---- /status — JSON health check & current state ----
void handleStatus() {
  sendCorsHeaders();
  unsigned long uptimeSeconds = (millis() - bootTime) / 1000;

  String json = "{";
  json += "\"status\":\"ok\",";
  json += "\"device\":\"esp32-cam\",";
  json += "\"mode\":\"" + String(isAPMode ? "ap" : "sta") + "\",";
  json += "\"hostname\":\"" + String(MDNS_HOSTNAME) + "\",";
  json += "\"ip\":\"" + (isAPMode ? WiFi.softAPIP().toString() : WiFi.localIP().toString()) + "\",";
  json += "\"uptime\":" + String(uptimeSeconds) + ",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"flash\":" + String(flashOn ? "true" : "false") + ",";
  json += "\"totalScans\":" + String(totalScans) + ",";
  json += "\"historyCount\":" + String(historyCount) + ",";
  json += "\"lastStudent\":\"" + (historyCount > 0 ? scanHistory[0].name : "") + "\"";
  json += "}";
  server.send(200, "application/json", json);
}

// ---- /capture — returns a single JPEG frame ----
void handleCapture() {
  sendCorsHeaders();
  lastCaptureTime = millis();

  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Camera capture failed");
    server.send(500, "text/plain", "Capture failed");
    return;
  }

  WiFiClient client = server.client();
  String header = "HTTP/1.1 200 OK\r\n";
  header += "Content-Type: image/jpeg\r\n";
  header += "Content-Length: " + String(fb->len) + "\r\n";
  header += "Access-Control-Allow-Origin: *\r\n";
  header += "Cache-Control: no-cache, no-store, must-revalidate\r\n";
  header += "Connection: close\r\n\r\n";
  client.write(header.c_str(), header.length());
  client.write(fb->buf, fb->len);

  esp_camera_fb_return(fb);
}

// ---- /flash — toggle the onboard LED ----
void handleFlash() {
  sendCorsHeaders();
  flashOn = !flashOn;
  digitalWrite(FLASH_LED_GPIO_NUM, flashOn ? HIGH : LOW);
  String json = "{\"flash\":" + String(flashOn ? "true" : "false") + "}";
  server.send(200, "application/json", json);
}

// ---- /scan-result or /scan — records scan outcome to persistent rolling OLED history ----
void handleScanResult() {
  sendCorsHeaders();

  String status = "";
  String name   = "";
  String id     = "";
  String code   = "";
  String msg    = "";

  // Check URL query parameters or POST form fields
  if (server.hasArg("status")) status = server.arg("status");
  if (server.hasArg("name"))   name   = server.arg("name");
  if (server.hasArg("id"))     id     = server.arg("id");
  if (server.hasArg("code"))   code   = server.arg("code");
  if (server.hasArg("msg"))    msg    = server.arg("msg");

  // Fallback to JSON payload if provided in body
  if (server.hasArg("plain")) {
    String body = server.arg("plain");
    if (status.length() == 0) status = extractJsonValue(body, "status");
    if (name.length() == 0)   name   = extractJsonValue(body, "name");
    if (id.length() == 0)     id     = extractJsonValue(body, "id");
    if (code.length() == 0)   code   = extractJsonValue(body, "code");
    if (msg.length() == 0)    msg    = extractJsonValue(body, "msg");
  }

  name.trim();
  id.trim();
  code.trim();
  msg.trim();

  // Reset/Clear command: resets OLED history
  if (status == "clear" || status == "reset") {
    historyCount = 0;
    totalScans = 0;
    updateOLED();
    server.send(200, "application/json", "{\"status\":\"ok\",\"action\":\"cleared\"}");
    return;
  }

  // Determine short badge string: OK, LT, DUP, ERR
  String shortBadge = "OK";
  String lowerStatus = status;
  lowerStatus.toLowerCase();

  if (lowerStatus == "duplicate" || lowerStatus == "dup") {
    shortBadge = "DUP";
  } else if (lowerStatus == "error" || lowerStatus == "fail" || lowerStatus == "invalid") {
    shortBadge = "ERR";
  } else if (code.length() > 0) {
    shortBadge = code;
  } else if (lowerStatus == "late") {
    shortBadge = "LT";
  }

  if (name.length() > 0) {
    totalScans++;

    // Shift existing records down in ring buffer
    for (int i = MAX_HISTORY - 1; i > 0; i--) {
      scanHistory[i] = scanHistory[i - 1];
    }

    // Insert new entry at top
    scanHistory[0].scanId = totalScans;
    scanHistory[0].name = name;
    scanHistory[0].status = shortBadge;

    if (historyCount < MAX_HISTORY) {
      historyCount++;
    }

    Serial.printf("[SCAN-HISTORY] #%d: %s [%s]\n", totalScans, name.c_str(), shortBadge.c_str());
    updateOLED();
  }

  String response = "{\"status\":\"ok\",\"total\":" + String(totalScans) + ",\"last\":\"" + name + "\"}";
  server.send(200, "application/json", response);
}

// Handle CORS preflight OPTIONS
void handleOptions() {
  sendCorsHeaders();
  server.send(204, "text/plain", "");
}

// ====================================================================
// ---- CAMERA INITIALIZATION ----
// ====================================================================

void setupCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer   = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  // VGA (640x480) with quality 12 provides 10-15 FPS, low motion blur, and fast transfer
  config.frame_size = FRAMESIZE_VGA;
  config.jpeg_quality = 12;
  config.fb_count = psramFound() ? 2 : 1;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x\n", err);
    return;
  }

  // Optimize OV2640 sensor for crisp QR code detection
  sensor_t *s = esp_camera_sensor_get();
  if (s) {
    s->set_contrast(s, 2);       // Boost contrast for sharp black/white modules
    s->set_sharpness(s, 2);      // Edge enhancement
    s->set_brightness(s, 0);     // Normal brightness
    s->set_saturation(s, -2);    // Low saturation reduces color noise
    s->set_gainceiling(s, GAINCEILING_4X);
    s->set_whitebal(s, 1);       // Enable auto white balance
    s->set_awb_gain(s, 1);
    s->set_wb_mode(s, 0);
    s->set_exposure_ctrl(s, 1);  // Auto exposure
    s->set_aec2(s, 1);           // Enhanced DSP auto exposure
    s->set_gain_ctrl(s, 1);      // Auto gain
    s->set_bpc(s, 1);            // Black pixel correction
    s->set_wpc(s, 1);            // White pixel correction
    s->set_lenc(s, 1);           // Lens correction
  }
}

// ====================================================================
// ---- WIFI CONNECTION & HOTSPOT SETUP ----
// ====================================================================

// Start Access Point & Captive Portal
void startCaptivePortal() {
  isAPMode = true;
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(AP_SSID);

  Serial.println("\n--- WiFi Connection Failed / No Credentials ---");
  Serial.printf("Started Hotspot: %s\n", AP_SSID);
  Serial.print("Access Portal at: http://");
  Serial.println(WiFi.softAPIP());

  // Start DNS Server on port 53, redirecting all requests to AP IP
  dnsServer.start(DNS_PORT, "*", WiFi.softAPIP());

  // Register Captive Portal routes
  server.on("/", HTTP_GET, handlePortalRoot);
  server.on("/save", HTTP_POST, handlePortalSave);
  server.on("/generate_204", HTTP_GET, handlePortalRoot);        // Android captive portal check
  server.on("/hotspot-detect.html", HTTP_GET, handlePortalRoot); // Apple captive portal check
  server.on("/ncsi.txt", HTTP_GET, handlePortalRoot);            // Windows captive portal check
  server.onNotFound(handlePortalRoot);                           // Catch-all redirect to portal

  server.begin();
  updateOLED();
}

// Start Station Mode
void startStationMode(const String& ssid, const String& password) {
  isAPMode = false;
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), password.c_str());

  Serial.printf("Connecting to saved WiFi: %s", ssid.c_str());

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE, SH110X_BLACK);
  display.setCursor(0, 0);
  display.println(">> RTNHS QR Scanner");
  display.print(">> WiFi: ");
  display.println(ssid);
  display.print("Connecting");
  display.display();

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) { // ~15 seconds timeout
    delay(500);
    Serial.print(".");
    display.print(".");
    display.display();
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected successfully!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());

    display.println("\n>> Connected!");
    display.print("   IP: ");
    display.println(WiFi.localIP());
    display.display();
    delay(800);

    // Start mDNS
    if (MDNS.begin(MDNS_HOSTNAME)) {
      Serial.printf("mDNS started: http://%s.local\n", MDNS_HOSTNAME);
      MDNS.addService("http", "tcp", 80);
    }

    // Register Scanner API Endpoints
    server.on("/status",      HTTP_GET,     handleStatus);
    server.on("/status",      HTTP_OPTIONS, handleOptions);
    server.on("/capture",     HTTP_GET,     handleCapture);
    server.on("/capture",     HTTP_OPTIONS, handleOptions);
    server.on("/flash",       HTTP_GET,     handleFlash);
    server.on("/flash",       HTTP_OPTIONS, handleOptions);
    server.on("/scan-result", HTTP_GET,     handleScanResult);
    server.on("/scan-result", HTTP_POST,    handleScanResult);
    server.on("/scan-result", HTTP_OPTIONS, handleOptions);
    server.on("/scan",        HTTP_GET,     handleScanResult);
    server.on("/scan",        HTTP_POST,    handleScanResult);
    server.on("/scan",        HTTP_OPTIONS, handleOptions);
    server.on("/reset-wifi",  HTTP_GET,     handleResetWifi);

    server.begin();
    updateOLED();
  } else {
    // Timeout: enter captive portal mode
    startCaptivePortal();
  }
}

// ====================================================================
// ---- SETUP & LOOP ----
// ====================================================================

void setup() {
  Serial.begin(115200);
  Serial.println("\n\n=== RTNHS Scanner Terminal Starting ===");
  bootTime = millis();

  // Initialize I2C and SH1106 OLED
  Wire.begin(I2C_SDA, I2C_SCL);
  Wire.setClock(400000); // 400kHz fast I2C clock
  delay(100);

  if (!display.begin(0x3C, true)) {
    Serial.println("SH1106 OLED allocation failed");
  } else {
    display.clearDisplay();
    display.setTextSize(1);
    display.setTextColor(SH110X_WHITE, SH110X_BLACK);
    display.setCursor(0, 0);
    display.println(">> RTNHS QR Scanner");
    display.println(">> Hardware Booting...");
    display.display();
  }

  pinMode(FLASH_LED_GPIO_NUM, OUTPUT);
  digitalWrite(FLASH_LED_GPIO_NUM, LOW);

  // Initialize Camera
  setupCamera();

  // Check saved WiFi credentials
  preferences.begin("scanner-wifi", true); // read-only
  String savedSSID = preferences.getString("ssid", "");
  String savedPass = preferences.getString("pass", "");
  preferences.end();

  if (savedSSID.length() > 0) {
    startStationMode(savedSSID, savedPass);
  } else {
    // No credentials saved -> open Hotspot & Captive Portal
    startCaptivePortal();
  }
}

void loop() {
  if (isAPMode) {
    dnsServer.processNextRequest();
    server.handleClient();
  } else {
    server.handleClient();

    // Periodic OLED refresh — faster when IP scroll ticker is active
    unsigned long now = millis();
    unsigned long refreshInterval = (ipScrollText.length() > 0) ? 350 : 4000;
    if (now - lastOledPeriodicUpdate >= refreshInterval) {
      lastOledPeriodicUpdate = now;
      updateOLED();
    }
  }
}
