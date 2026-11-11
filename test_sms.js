import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadEnv() {
  try {
    const envPath = path.join(__dirname, '.env.local');
    const content = fs.readFileSync(envPath, 'utf-8');
    content.split(/\r?\n/).forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) return;
      
      const match = trimmedLine.match(/^([^=]+)=(.*)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim();
      }
    });
  } catch (error) {
    console.error('Could not load .env.local file');
  }
}

loadEnv();

function formatPhilippinePhoneNumber(phone) {
  if (!phone) return phone;
  let cleaned = String(phone).trim().replace(/[\s\-\(\)\.]/g, '');
  if (cleaned.startsWith('+0')) cleaned = cleaned.slice(1);
  if (cleaned.startsWith('0063')) cleaned = '+63' + cleaned.slice(4);
  if (cleaned.startsWith('+6309')) cleaned = '+63' + cleaned.slice(5);
  if (/^\+639\d{9}$/.test(cleaned)) return cleaned;
  if (/^639\d{9}$/.test(cleaned)) return '+' + cleaned;
  if (/^09\d{9}$/.test(cleaned)) return '+63' + cleaned.slice(1);
  if (/^9\d{9}$/.test(cleaned)) return '+63' + cleaned;
  return cleaned;
}

const API_KEY = process.env.VITE_TEXTBEE_API_KEY;
const DEVICE_ID = process.env.VITE_TEXTBEE_DEVICE_ID;

async function sendTestMessage(to) {
  if (!API_KEY) {
    console.error('Error: Missing VITE_TEXTBEE_API_KEY in .env.local');
    return;
  }

  if (!to) {
    console.error('Usage: node test_sms.js <destination_phone_number>');
    console.error('Example: node test_sms.js 09123456789 or +639123456789');
    return;
  }

  const formattedTo = formatPhilippinePhoneNumber(to);
  const endpoint = DEVICE_ID
    ? `https://api.textbee.dev/api/v1/gateway/devices/${DEVICE_ID.trim()}/send-sms`
    : `https://api.textbee.dev/api/v1/gateway/send-sms`;

  console.log(`Sending test message via TextBee.dev to ${formattedTo} (original: ${to})...`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY.trim(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        recipients: [formattedTo],
        message: '[RTNHS Attendance] Test message from RTNHS QR Code Attendance System via TextBee.'
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Message sent successfully via TextBee!');
      console.log('Response:', data);
    } else {
      console.error('❌ Failed to send message.');
      console.error('Status:', response.status);
      console.error('Error:', data);
    }
  } catch (error) {
    console.error('❌ An error occurred:', error.message);
  }
}

const destPhone = process.argv[2];
sendTestMessage(destPhone);
