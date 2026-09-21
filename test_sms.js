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

const API_KEY = process.env.VITE_HTTPSMS_API_KEY;
const SENDER_PHONE = process.env.VITE_HTTPSMS_SENDER_PHONE;

async function sendTestMessage(to) {
  if (!API_KEY || !SENDER_PHONE) {
    console.error('Error: Missing API Key or Sender Phone in .env.local');
    return;
  }

  if (!to) {
    console.error('Usage: node test_sms.js <destination_phone_number>');
    console.error('Example: node test_sms.js +639123456789');
    return;
  }

  console.log(`Sending test message to ${to} from ${SENDER_PHONE}...`);

  try {
    const response = await fetch('https://api.httpsms.com/v1/messages/send', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: 'This is a test message from the RTNHS QR Code Attendance System.',
        from: SENDER_PHONE,
        to: to
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Message sent successfully!');
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
