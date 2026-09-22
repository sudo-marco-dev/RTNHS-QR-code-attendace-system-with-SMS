# RTNHS QR Code Attendance System — Client Handover Guide

> **Rio Tuba National High School — Automated QR Code Attendance System with SMS Notifications**
>
> Version: 1.0 | Date: September 2026 | Platform: Web (Vite + React) + ESP32-CAM Hardware

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Prerequisites & Requirements](#3-prerequisites--requirements)
4. [Complete Setup from Scratch](#4-complete-setup-from-scratch)
5. [Daily Operations Guide](#5-daily-operations-guide)
6. [Admin Dashboard Guide](#6-admin-dashboard-guide)
7. [Teacher Dashboard Guide](#7-teacher-dashboard-guide)
8. [Scanner Terminal Guide](#8-scanner-terminal-guide)
9. [Troubleshooting & Debugging Reference](#9-troubleshooting--debugging-reference)
10. [Database Schema Reference](#10-database-schema-reference)
11. [Security Notes](#11-security-notes)
12. [Maintenance & Backup](#12-maintenance--backup)

---

## 1. System Overview

The RTNHS Attendance System is a complete school attendance solution with three main components:

| Component | Description | Access |
|---|---|---|
| **Admin Dashboard** | Full management of sections, students, teachers, subjects, schedules, QR codes, attendance exports, photo verification, and system settings | `/admin` (requires admin login) |
| **Teacher Dashboard** | View attendance statistics, attendance grid, class schedules, and export QR codes for assigned sections | `/teacher` (requires teacher login) |
| **Scanner Terminal** | Dedicated QR scanning station with ESP32-CAM integration, face verification photo capture, offline queue, and OLED screen feedback | `/scanner` (PIN-based, no login required) |
| **ESP32-CAM Module** | Hardware QR reader with OLED display showing scan history, WiFi auto-config captive portal, mDNS discovery | Physical device, connects via WiFi |
| **SMS Notifications** | Automated parent SMS alerts via httpSMS when a student scans in/out | Configurable globally from Admin Settings |

### How It Works

```
Student scans QR --> ESP32-CAM captures frame --> Web app decodes QR -->
--> Validates student --> Records attendance in Supabase -->
--> Sends SMS to parent --> Updates ESP32 OLED screen
```

---

## 2. Architecture Diagram

```
+-----------------------------------------------------+
|                    INTERNET                          |
|  +----------+  +-----------+  +------------------+  |
|  |  Vercel  |  | Supabase  |  |    httpSMS API   |  |
|  | (Web App)|  | (Database |  | (SMS Gateway)    |  |
|  |          |  |  Storage  |  |                  |  |
|  |          |  |  Auth)    |  |                  |  |
|  +----+-----+  +-----+-----+  +--------+---------+  |
+-------+---------------+------------------+----------+
        |               |                  |
   +----+--------------+------------------+----+
   |           LOCAL SCHOOL NETWORK            |
   |                                           |
   |  +---------+     +------------------+     |
   |  | Browser |<--->|  ESP32-CAM       |     |
   |  | (Phone/ |     |  +------------+  |     |
   |  | Tablet) |     |  | OLED Screen|  |     |
   |  |         |     |  | OV2640 Cam |  |     |
   |  +---------+     |  +------------+  |     |
   |                  +------------------+     |
   +-------------------------------------------+
```

---

## 3. Prerequisites & Requirements

### Software Requirements

| Tool | Version | Purpose |
|---|---|---|
| **Node.js** | 18+ (LTS recommended) | Web app runtime |
| **npm** | 9+ | Package manager |
| **Git** | Latest | Version control |
| **Arduino IDE** | 2.x | ESP32 firmware upload |
| **Web Browser** | Chrome/Edge (latest) | Running the app |

### Online Accounts Required

| Service | Purpose | Cost |
|---|---|---|
| **Supabase** | Database, Auth, Storage, Realtime | Free tier sufficient |
| **Vercel** | Web app hosting | Free tier sufficient |
| **httpSMS** | SMS gateway via Android phone | Free (uses your phone's SIM) |

### Hardware Requirements

| Item | Specification | Quantity |
|---|---|---|
| **ESP32-CAM** | AI-Thinker board (OV2640) | 1 per station |
| **SH1106 OLED** | 128x64 I2C (0x3C address) | 1 per station |
| **USB-to-Serial adapter** | FTDI/CP2102 (for flashing) | 1 |
| **5V Power Supply** | Stable 5V 2A (USB or barrel) | 1 per station |
| **Phone/Tablet** | Any modern smartphone or tablet | 1 per station (runs web UI) |
| **Android Phone** | For httpSMS gateway (sends SMS) | 1 total |

### Wiring: ESP32-CAM to SH1106 OLED

| OLED Pin | ESP32-CAM Pin |
|---|---|
| VCC | 3.3V |
| GND | GND |
| SCK (SCL) | GPIO 15 |
| SDA | GPIO 14 |

---

## 4. Complete Setup from Scratch

### 4.1 Supabase Database Setup

1. **Create a Supabase project** at https://supabase.com
2. Go to **SQL Editor** and run the following migration files **in order**:

| # | File | Purpose |
|---|---|---|
| 1 | `supabase/migrations/20260713000000_init_schema.sql` | Core tables, RLS policies, ENUMs |
| 2 | `supabase/migrations/20260824000000_add_section_scan_windows.sql` | Section time schedules |
| 3 | `supabase/migrations/20260824000001_add_unique_attendance_log.sql` | Unique constraint per scan window |
| 4 | `supabase/migrations/20260830000000_add_verification_photo.sql` | Photo verification column |
| 5 | `supabase/migrations/20260921000000_add_system_settings_and_sms_logs.sql` | System settings + SMS logs |

3. **Create the admin user:**
   - Go to **Authentication > Users > Add User**
   - Enter email (e.g. `admin@rtnhs.edu.ph`) and a strong password
   - After creation, copy the user's UUID from the Users table
   - Go to **SQL Editor** and run:
     ```sql
     INSERT INTO profiles (id, full_name, role, email)
     VALUES ('PASTE-UUID-HERE', 'Admin Name', 'admin', 'admin@rtnhs.edu.ph');
     ```

4. **Create Storage bucket** for face verification photos:
   - Go to **Storage > New Bucket**
   - Name: `verification-photos`
   - Set to **Public** (so URLs are accessible)
   - No file size limits needed (photos are compressed to ~15KB)

5. **Enable Realtime** for the `system_settings` table:
   - Go to **Database > Tables > system_settings > Realtime** toggle > ON

6. **Collect your credentials** from **Settings > API**:
   - Project URL = `VITE_SUPABASE_URL`
   - Anon (public) key = `VITE_SUPABASE_ANON_KEY`
   - Service role key = `VITE_SUPABASE_SERVICE_ROLE_KEY`

### 4.2 Environment Configuration

Create a `.env.local` file in the project root:

```env
# Supabase
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# httpSMS (SMS Gateway)
VITE_HTTPSMS_API_KEY=your-httpsms-api-key
VITE_HTTPSMS_SENDER_PHONE=+639XXXXXXXXX
```

> **WARNING:** The `VITE_SUPABASE_SERVICE_ROLE_KEY` has full database access. Never expose it in public repos. It is used client-side for scanner attendance inserts (bypassing RLS for PIN-authenticated kiosks).

### 4.3 Web Application Setup

```bash
# 1. Clone the repository
git clone <repository-url>
cd RTNHS-QR-code-attendace-system-with-SMS

# 2. Install dependencies
npm install

# 3. Start development server
npm run dev

# 4. Open in browser
#    http://localhost:5173
#    Also accessible on LAN: http://YOUR-IP:5173
```

**Available scripts:**

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server (LAN-accessible via `--host 0.0.0.0`) |
| `npm run build` | Production build to `dist/` folder |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run oxlint linter |

### 4.4 ESP32-CAM Hardware Setup

#### Arduino IDE Board Setup

1. Open **Arduino IDE** > **File > Preferences**
2. Add this board URL:
   ```
   https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
   ```
3. **Tools > Board > Board Manager** > Install `esp32` by Espressif
4. Select board: **AI Thinker ESP32-CAM**
5. Set **Partition Scheme**: `Huge APP (3MB No OTA / 1MB SPIFFS)`
6. Enable **PSRAM**: `Enabled`

#### Required Arduino Libraries

Install via **Library Manager** (Sketch > Include Library > Manage Libraries):

| Library | Purpose |
|---|---|
| `Adafruit SH110X` | OLED display driver |
| `Adafruit GFX Library` | Graphics primitives |
| `Wire` (built-in) | I2C communication |

#### Flashing the Firmware

1. Connect ESP32-CAM to USB-Serial adapter:
   - `GND` to `GND`
   - `5V` to `5V`
   - `U0T` to `RXD`
   - `U0R` to `TXD`
   - **`IO0` to `GND`** (required for flash mode only)
2. Open `ESPCAM/ESPCAM.ino` in Arduino IDE
3. Click **Upload**
4. After upload completes, **disconnect IO0 from GND** and press RST button
5. The OLED should show "RTNHS QR Scanner" then "Hardware Booting..."

#### First-Time WiFi Configuration

On first boot (no saved WiFi credentials):

1. The ESP32 creates a hotspot: **`RTNHS-Scanner-AP`** (no password)
2. Connect your phone/laptop to this hotspot
3. A captive portal opens automatically (or navigate to `192.168.4.1`)
4. Select your school WiFi network from the dropdown
5. Enter the WiFi password and click **Save & Connect**
6. The ESP32 restarts and connects to your network
7. The OLED displays the full IP address (e.g., `192.168.1.152`)

### 4.5 SMS (httpSMS) Setup

The system uses httpSMS (https://httpsms.com) - an SMS gateway that sends messages through your actual Android phone. This means **no SMS API costs**, just your normal carrier/SIM charges.

#### Setup Steps

1. **Create an account** at httpsms.com
2. **Install the httpSMS Android app** on the gateway phone from Google Play Store
3. **Log in** to the app and keep it running in the background
4. From the httpSMS web dashboard, get your:
   - **API Key** = `VITE_HTTPSMS_API_KEY`
   - **Sender phone number** (your SIM number in `+63...` format) = `VITE_HTTPSMS_SENDER_PHONE`
5. Add these to your `.env.local` file

#### SMS Message Format

```
[RTNHS Attendance] Juan Dela Cruz has TIME IN at 07:15 AM. Date: Sep 22, 2026 | Grade 7 - Section A
```

Messages are kept under 160 characters to avoid double SMS charges.

#### Disabling SMS

- **Globally:** Admin Dashboard > System Settings > Toggle "SMS Notifications" OFF
- **Per-session:** Scanner Terminal > Settings gear > Toggle "SMS Alerts" OFF
- When SMS is globally disabled, a yellow "SMS Blocked (Admin Testing Mode)" banner appears on the scanner

### 4.6 Deployment to Vercel

1. Push the code to a GitHub/GitLab repository
2. Go to vercel.com > **Import Project**
3. Connect your repository
4. Set **Framework Preset**: Vite
5. Add all environment variables from `.env.local` to Vercel's **Settings > Environment Variables**
6. Click **Deploy**

The `vercel.json` file is already configured for SPA routing:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

---

## 5. Daily Operations Guide

### 5.1 Morning Routine

1. **Power on** the ESP32-CAM scanner module
2. Wait for the OLED to show the IP address (confirms WiFi connection)
3. **Open the Scanner Terminal** on the phone/tablet:
   - Navigate to `https://your-app.vercel.app/scanner`
   - Enter the **4-digit section PIN** (set in Admin > Sections & PINs)
4. The scanner connects to the ESP32-CAM automatically (via mDNS or saved IP)
5. Open **Settings (gear icon)** > **Session Control** > **Open Window** for "Morning IN"

### 5.2 Running a Scan Session

The scan session has three states:

```
OPEN   -->  Students scanned = PRESENT
  |
  v
LATE   -->  Students scanned = LATE
  |
  v
CLOSED -->  Unscanned students = ABSENT (auto batch)
```

**Workflow:**

1. **Open Window** - Begin scanning. QR codes decode to "PRESENT"
2. When the on-time period ends, click **Close > Mark Late** - Students now scan as "LATE"
3. When ready to end, click **Close Window (Batch Absent)** - All unscanned students are automatically marked "ABSENT"
4. The system auto-suggests the next window type (Morning IN > Afternoon IN > Afternoon OUT)

**During scanning:**

| Event | Visual Feedback | Audio | OLED Display |
|---|---|---|---|
| Valid scan | Green card with student name | Success chime | Name + "OK" |
| Duplicate scan | Amber card "DUPLICATE" | Double-beep | Name + "DUP" |
| Unknown QR | Red card "ERROR" | Error tone | "Unknown QR" + "ERR" |
| Late scan | Amber card with "LATE" | Success chime | Name + "LT" |

### 5.3 End of Day

1. Ensure all three windows have been closed (Morning IN, Afternoon IN, Afternoon OUT)
2. Attendance data is already saved in Supabase - no manual export needed
3. To export: Admin Dashboard > **Export Attendance** > Select date range > Download Excel

### Three Scan Windows Per Day

| Window | Default Schedule | Purpose |
|---|---|---|
| **Morning IN** | 6:00 AM - 7:30 AM | Morning arrival |
| **Afternoon IN** | 12:30 PM - 1:30 PM | Afternoon arrival |
| **Afternoon OUT** | 4:00 PM - 5:00 PM | End-of-day departure |

> Schedules can be customized per section in **Admin > Sections & PINs** (edit a section's time settings).

---

## 6. Admin Dashboard Guide

**Login:** Navigate to `/login` > Sign in with admin email/password > Auto-redirects to `/admin`

### Admin Modules

| Module | Path | What It Does |
|---|---|---|
| **Sections & PINs** | `/admin/sections` | Create/edit sections, set grade level, set 4-digit scanner PIN, configure scan window schedules |
| **Import Students** | `/admin/students/import` | Bulk import students from CSV/Excel. Required columns: `full_name`, `lrn`, `section` |
| **Manage Students** | `/admin/students/manage` | View, edit, delete students. Edit parent phone numbers, LRNs, and QR codes |
| **Teachers** | `/admin/teachers` | Create teacher accounts (Supabase Auth users with `teacher` role), manage profiles |
| **Subjects** | `/admin/subjects` | Create/edit subject names and codes |
| **Schedules** | `/admin/schedules` | Assign teachers to subjects + sections with time slots and days of week |
| **Export QR** | `/admin/qr-export` | Generate and download printable QR code sheets (PDF) per section |
| **Export Attendance** | `/admin/attendance-export` | Export attendance records to Excel with date range and section filters |
| **Photo Verification** | `/admin/photo-verify` | Review face verification photos captured at scan time (anti-proxy detection) |
| **System Settings** | `/admin/settings` | Global SMS toggle, system-wide configuration |

### Creating a New Section (Step-by-Step)

1. Go to **Sections & PINs**
2. Click **Add Section**
3. Fill in:
   - **Section Name**: e.g., "Mabini"
   - **Grade Level**: e.g., "Grade 7"
   - **Scanner PIN**: 4-digit unique PIN (e.g., "1234")
4. Save - The section is ready for student enrollment

### Importing Students

1. Prepare a CSV file with columns: `full_name`, `lrn` (Learner Reference Number)
2. Go to **Import Students** > Select the target section
3. Upload the CSV > Review parsed data > Confirm import
4. QR codes are auto-generated from LRNs

### Creating Teacher Accounts

1. Go to **Teachers** > **Add Teacher**
2. Enter: Full Name, Email, Password
3. The system creates a Supabase Auth user + `profiles` row with `role = 'teacher'`
4. Share the credentials with the teacher

---

## 7. Teacher Dashboard Guide

**Login:** Navigate to `/login` > Sign in with teacher email/password > Auto-redirects to `/teacher`

Teachers can:

- View **attendance statistics** (present/late/absent rates) for their assigned sections
- See the full **attendance grid** (student x date matrix)
- View their **class schedule** assignments
- **Export QR codes** for their assigned sections

> Teachers can only see data for sections they are assigned to (enforced by Row Level Security).

---

## 8. Scanner Terminal Guide

### Accessing the Scanner

1. On the login page, click **"Open Scanner Terminal"** (no login required)
2. Or navigate directly to `/scanner`
3. Enter the 4-digit PIN for the section

### Scanner Controls

| Control | Location | Function |
|---|---|---|
| **Gear (Settings)** | Top-right gear icon | Open terminal settings (scan window, ESP32, toggles) |
| **Lock icon** | Top-right (amber icon) | Re-lock settings (requires PIN to reopen) |
| **Fullscreen icon** | Top-right expand icon | Toggle browser fullscreen mode |
| **Manual Entry** | Bottom bar | Type an LRN manually if QR won't scan |
| **History** | Bottom bar | View recent scan history for current session |
| **Split/Swap toolbar** | Right edge (vertical toolbar) | Toggle Split Screen / PiP view + Swap cameras |

### Dual Camera Views

The scanner supports two camera modes when ESP32-CAM is connected:

| Mode | Description |
|---|---|
| **Picture-in-Picture (PiP)** | One camera fullscreen, other as a draggable mini-window |
| **Split Screen** | Both cameras side-by-side (top/bottom on mobile, left/right on desktop) |

- **ESP32-CAM**: Captures QR codes (the QR scanning source)
- **Phone Camera**: Captures face verification photos (uploaded to Supabase Storage)

### Offline Mode

If the internet connection drops during scanning:
- Scans are queued locally in the browser (localStorage)
- A orange **"X Pending"** badge appears
- Queued entries auto-flush every 30 seconds when connection is restored
- No data is lost

---

## 9. Troubleshooting & Debugging Reference

### Web Application Errors

| Error | Meaning | Fix |
|---|---|---|
| `Missing Supabase environment variables` | `.env.local` file is missing or keys are empty | Create `.env.local` with all required `VITE_SUPABASE_*` keys |
| `Permission Error: Your account lacks proper permissions` | Logged-in user has no matching row in `profiles` table | Insert a `profiles` row with the correct `id` (UUID) and `role` |
| `Failed to fetch role data` | Network error or RLS policy blocking profile read | Check internet, verify RLS policies on `profiles` table |
| `Invalid login credentials` | Wrong email or password in Supabase Auth | Reset password in Supabase Auth dashboard |
| `Invalid PIN. Please try again.` | Scanner PIN doesn't match any section in `sections` table | Check Admin > Sections & PINs for the correct PIN |
| `No active scan window. Please open a window first.` | Tried to scan but no window is open | Go to Settings > Session Control > Open Window |
| `Student not found in this section` | QR code/LRN doesn't match any student in the authenticated section | Verify the student is enrolled in the correct section |
| `Already scanned in this window` | Student's QR was already scanned in the current window | This is expected duplicate prevention - no action needed |
| Page shows blank white screen | JavaScript error or missing env vars | Open browser console (F12) and check for errors |
| `Loading...` stuck forever | Auth context waiting for Supabase response | Check internet connection and Supabase project status |

### ESP32-CAM Errors

| Error / Symptom | Meaning | Fix |
|---|---|---|
| **OLED shows "NO WIFI"** | ESP32 failed to connect to saved WiFi | Check WiFi password. Press RST to retry. If persistent, reset WiFi (see below) |
| **OLED shows "AP: 192.168.4.1"** | No WiFi credentials saved, captive portal is active | Connect to `RTNHS-Scanner-AP` hotspot and configure WiFi |
| **"Stream Disconnected" on web** | Web app can't reach ESP32's `/capture` endpoint | Verify ESP32 IP. Check WiFi. Try Retry button. Ensure both devices are on the same network |
| **"Connection timed out" in ESP32 Settings** | ESP32 didn't respond within 3 seconds | Verify the IP/hostname. ESP32 might be rebooting or on a different subnet |
| **"Connection lost after multiple retries"** | 3 consecutive health checks failed | ESP32 may have lost WiFi or power. Check physical connection. Press RST |
| **Camera capture failed (Serial)** | OV2640 camera module initialization failed | Check camera ribbon cable connection. Power cycle the ESP32 |
| **Blurry QR scans / slow decode** | Camera settings not optimal or low light | Toggle Flash LED in settings. Ensure adequate lighting |
| **mDNS (`rtnhs-scanner.local`) doesn't work** | mDNS not supported on the client device (common on Android) | Use the IP address directly instead (shown on OLED) |
| **OLED shows garbled text or is blank** | I2C wiring issue or wrong I2C address | Verify SDA=GPIO14, SCL=GPIO15, address=0x3C. Check solder joints |
| **ESP32 keeps restarting** | Power supply issue (brownout) or firmware crash | Use a stable 5V 2A power supply. Check Serial Monitor at 115200 baud for crash logs |
| **IP address shows only last octet on OLED** | Old firmware without full IP display | Re-flash with the latest `ESPCAM.ino` which shows full IP with scrolling |

#### How to Reset ESP32 WiFi Credentials

**Method 1 - Web endpoint (if accessible):**
```
http://ESP32-IP/reset-wifi
```
This clears saved credentials and restarts into captive portal mode.

**Method 2 - Re-flash firmware:**
If you can't reach the ESP32's web server, re-flash the firmware. On the next boot, it will enter captive portal mode since the flash storage is cleared during upload.

### SMS Errors

| Error | Meaning | Fix |
|---|---|---|
| `[SMS] Blocked by global admin system settings` | SMS is disabled globally in Admin > System Settings | Enable "SMS Notifications" in Admin > System Settings |
| `SMS Failed` (red badge on scanner) | httpSMS API returned an error | Check httpSMS Android app is running. Check API key. Check phone has signal |
| `No Parent Phone` | Student has no `parent_phone` in the database | Edit the student in Admin > Manage Students and add a phone number |
| `[httpSMS] Failed to send SMS: ...` (console) | API request failed - network or auth issue | Verify `VITE_HTTPSMS_API_KEY` is correct. Check the httpSMS dashboard for errors |
| SMS not received but status shows "sent" | httpSMS queued the message but phone hasn't sent it yet | Open httpSMS app on the gateway phone. Check for pending messages |
| SMS received twice for one scan | Message exceeded 160 characters and was split | Student name + section name may be too long. Check message content in sms_logs |

### Database / Supabase Errors

| Error | Meaning | Fix |
|---|---|---|
| `unique_student_scan_window` constraint violation | Attempting to insert a duplicate attendance log | This is normal - the app handles this via the `scannedIds` check. If it happens, the entry was already recorded |
| `violates foreign key constraint on "section_id"` | Trying to add a student to a non-existent section | Create the section first in Admin > Sections & PINs |
| `scanner_pin must match ^[0-9]{4}$` | Scanner PIN is not exactly 4 digits | Use only 4-digit numeric PINs (e.g., "1234") |
| `row-level security policy` violation | User lacks permission for the operation | Check the user's role. Admins should be in `profiles` with `role = 'admin'` |
| `Could not find column 'verification_photo_url'` | Migration `20260830000000` hasn't been run | Run the migration in Supabase SQL Editor |
| `Could not find table 'system_settings'` | Migration `20260921000000` hasn't been run | Run the migration in Supabase SQL Editor |
| `relation "attendance_logs" does not exist` | Initial schema migration hasn't been run | Run all migrations in order starting from `20260713000000` |

### Camera / Browser Errors

| Error | Meaning | Fix |
|---|---|---|
| `Camera access requires HTTPS or localhost` | Browser blocks camera on insecure origins | Use HTTPS (deploy to Vercel) or access via `localhost` |
| `Camera access denied` / `NotAllowedError` | User denied camera permission | Go to browser settings > Site permissions > Allow camera |
| `NotFoundError` / `OverconstrainedError` | Requested camera (front/rear) not available | Try flipping the camera. Some devices only have one camera |
| Face verification photo not uploading | Supabase Storage bucket doesn't exist or is misconfigured | Create `verification-photos` bucket in Supabase Storage (set to Public) |
| QR code not scanning (device camera mode) | Camera is out of focus or too close/far | Hold QR code 15-25cm from camera. Ensure good lighting |

### Build & Development Errors

| Error | Meaning | Fix |
|---|---|---|
| `vite: command not found` | Dependencies not installed | Run `npm install` |
| `EACCES: permission denied` | File permissions issue (Linux/Mac) | Use `sudo` or fix directory ownership |
| `Port 5173 is already in use` | Another dev server is running | Kill the other process or use: `npm run dev -- --port 5174` |
| TypeScript compilation errors | Type mismatches in code | Run `npx tsc --noEmit` to see all errors |
| `Module not found: 'httpsms'` | Missing dependency | Run `npm install httpsms` |

### Console Log Prefixes

When debugging via browser console (F12), look for these prefixed log messages:

| Prefix | Source | Example |
|---|---|---|
| `[SCANNER]` | Main scan processing logic | `[SCANNER] Student fetched: {name: "Juan"}` |
| `[SMS]` | SMS sending pipeline | `[SMS] Scan success, sending SMS for student: Juan` |
| `[PHOTO]` | Face verification photo capture/upload | `[PHOTO] Upload failed: bucket not found` |
| `[ESP32-OLED]` | OLED notification to ESP32 | `[ESP32-OLED] Failed to notify screen: NetworkError` |
| `[ESP32]` | ESP32 health check (in ESP32Settings) | `[ESP32] Health check failed (2/3)` |

---

## 10. Database Schema Reference

### Tables

| Table | Purpose | Key Columns |
|---|---|---|
| `profiles` | User accounts (admin/teacher) | `id` (UUID, FK to auth.users), `role`, `full_name`, `email` |
| `sections` | School sections | `name`, `grade_level`, `scanner_pin` (unique 4-digit), time schedule columns |
| `students` | Student records | `full_name`, `lrn` (unique), `qr_code` (unique), `parent_phone`, `section_id` |
| `subjects` | Academic subjects | `name`, `code` |
| `teacher_assignments` | Teacher-section-subject mapping | `teacher_id`, `subject_id`, `section_id`, `time_slot`, `days_of_week` |
| `scan_windows` | Attendance scan sessions | `section_id`, `window_type`, `status` (open/late/closed), timestamps |
| `attendance_logs` | Individual attendance records | `student_id`, `scan_window_id`, `status` (PRESENT/LATE/ABSENT), `verification_photo_url` |
| `system_settings` | Global config (key-value) | `key`, `value` (JSONB), `description` |
| `sms_logs` | Sent SMS audit trail | `attendance_log_id`, `student_id`, `parent_phone`, `message_content`, `status` |

### ENUMs

| Type | Values |
|---|---|
| `role_type` | `admin`, `teacher` |
| `window_type_enum` | `morning_in`, `afternoon_in`, `afternoon_out` |
| `window_status_enum` | `open`, `late`, `closed` |
| `attendance_status_enum` | `PRESENT`, `LATE`, `ABSENT` |

### Section Time Schedule Columns

| Column | Default | Description |
|---|---|---|
| `morning_in_start` | 06:00:00 | Morning IN window opens |
| `morning_in_end` | 07:30:00 | Morning IN window closes |
| `afternoon_in_start` | 12:30:00 | Afternoon IN window opens |
| `afternoon_in_end` | 13:30:00 | Afternoon IN window closes |
| `afternoon_out_start` | 16:00:00 | Afternoon OUT window opens |
| `afternoon_out_end` | 17:00:00 | Afternoon OUT window closes |

---

## 11. Security Notes

### Row Level Security (RLS)

All tables have RLS enabled. Key policies:

| Role | Access |
|---|---|
| **Admin** | Full CRUD on all tables |
| **Teacher** | Read-only on assigned sections, students, and attendance logs |
| **Scanner (anon)** | Read sections/students/scan_windows. Insert attendance_logs and sms_logs. Create/update scan_windows |

### Service Role Key Warning

The `VITE_SUPABASE_SERVICE_ROLE_KEY` is used on the client-side scanner terminal to bypass RLS for attendance inserts. This is a known trade-off for PIN-authenticated kiosk mode:

- **Risk:** Anyone with the key can insert arbitrary attendance logs
- **Mitigation:** The scanner PIN restricts physical access. The `unique_student_scan_window` constraint prevents duplicates
- **Future improvement:** Move attendance inserts to a Supabase Edge Function with PIN validation server-side

### PIN Security

- Each section has a unique 4-digit PIN
- PINs are stored in the `sections` table (readable by anyone with anon key)
- The PIN is primarily a **physical access gate**, not a cryptographic security measure
- Terminal settings can be PIN-locked (configured in Scanner > Settings > "Require PIN for Settings")

---

## 12. Maintenance & Backup

### Database Backup

Supabase provides automatic daily backups on paid plans. For free tier:

1. Go to **Supabase Dashboard > Database > Backups**
2. Or export data manually: **Admin > Export Attendance** for attendance data
3. For full DB dump, use the Supabase CLI:
   ```bash
   supabase db dump -p YOUR_DB_PASSWORD > backup.sql
   ```

### Updating the Web App

```bash
# Pull latest changes
git pull origin main

# Install any new dependencies
npm install

# Test locally
npm run dev

# Deploy to production
# (Vercel auto-deploys on git push if connected)
git push origin main
```

### Updating ESP32 Firmware

1. Open the updated `ESPCAM/ESPCAM.ino` in Arduino IDE
2. Connect ESP32-CAM via USB-Serial (with IO0 to GND for flash mode)
3. Upload > Disconnect IO0 > Press RST
4. The ESP32 will reconnect to the saved WiFi automatically

### Resetting the System for a New School Year

1. **Export all attendance data** from Admin > Export Attendance
2. **Clear attendance logs:**
   ```sql
   -- Run in Supabase SQL Editor
   TRUNCATE attendance_logs CASCADE;
   TRUNCATE scan_windows CASCADE;
   TRUNCATE sms_logs;
   ```
3. **Update student records** (or re-import via CSV)
4. **Generate new QR codes** if LRNs changed (Admin > Export QR)

### Monitoring

- Check **Supabase Dashboard > Logs** for database errors
- Check **httpSMS Dashboard** for SMS delivery status
- Check ESP32 **Serial Monitor** (115200 baud) for hardware diagnostics
- Browser **Console** (F12) shows `[SCANNER]`, `[SMS]`, `[PHOTO]`, `[ESP32-OLED]` prefixed logs

---

## Quick Reference Card

| Action | How |
|---|---|
| **Open Scanner** | Go to `/scanner` then enter 4-digit section PIN |
| **Start scanning** | Settings gear > Session Control > Open Window |
| **Mark late** | Settings gear > Close > Mark Late |
| **End session** | Settings gear > Close Window (Batch Absent) |
| **Admin login** | Go to `/login` then enter admin email/password |
| **Create section** | Admin > Sections & PINs > Add Section |
| **Import students** | Admin > Import Students > Upload CSV |
| **Print QR codes** | Admin > Export QR > Select section > Download PDF |
| **Export attendance** | Admin > Export Attendance > Select date range > Download Excel |
| **Toggle SMS** | Admin > System Settings > SMS Notifications toggle |
| **ESP32 WiFi reset** | Navigate to `http://ESP32-IP/reset-wifi` |
| **Check ESP32 status** | Navigate to `http://ESP32-IP/status` (returns JSON) |
| **Debug mode** | Scanner Settings gear > Toggle "Debug Mode" ON (no DB writes) |

---

> **Document Version:** 1.0 | **Last Updated:** September 22, 2026
>
> For technical issues beyond this guide, refer to the project source code or contact the development team.
