const TEXTBEE_API_KEY = (import.meta.env.VITE_TEXTBEE_API_KEY || '') as string;
const TEXTBEE_DEVICE_ID = (import.meta.env.VITE_TEXTBEE_DEVICE_ID || '') as string;

export type SmsResult = 'sent' | 'failed' | 'no_phone';

export interface ScanSmsPayload {
  studentName: string;
  section: string;
  scanType: 'TIME IN' | 'TIME OUT';
  scannedAt: Date;
  parentPhone: string | null;
}

/**
 * Normalizes a Philippine phone number to E.164 format (+639XXXXXXXXX).
 * Handles common input quirks and Excel artifacts:
 * - 09XXXXXXXXX (11 digits local) -> +639XXXXXXXXX
 * - 9XXXXXXXXX (10 digits, when Excel/Sheets strips leading 0) -> +639XXXXXXXXX
 * - +639XXXXXXXXX (already valid E.164) -> +639XXXXXXXXX
 * - 639XXXXXXXXX (missing '+') -> +639XXXXXXXXX
 * - +09XXXXXXXXX (accidental '+0' prefix) -> +639XXXXXXXXX
 * - Strips all spaces, dashes, dots, and parentheses
 */
export function formatPhilippinePhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;

  // Remove whitespace, dashes, periods, parentheses
  let cleaned = trimmed.replace(/[\s\-\(\)\.]/g, '');

  // Strip leading '+0' if entered like '+09123456789'
  if (cleaned.startsWith('+0')) {
    cleaned = cleaned.slice(1);
  } else if (cleaned.startsWith('0063')) {
    cleaned = '+63' + cleaned.slice(4);
  }

  // Fix +6309... -> +639...
  if (cleaned.startsWith('+6309')) {
    cleaned = '+63' + cleaned.slice(5);
  }

  // Already standard +639XXXXXXXXX (13 chars: +63 + 10 digits)
  if (/^\+639\d{9}$/.test(cleaned)) {
    return cleaned;
  }

  // Starts with 639XXXXXXXXX (missing +)
  if (/^639\d{9}$/.test(cleaned)) {
    return '+' + cleaned;
  }

  // Local 11-digit mobile starting with 09 (e.g. 09058354233)
  if (/^09\d{9}$/.test(cleaned)) {
    return '+63' + cleaned.slice(1);
  }

  // 10-digit mobile where Excel stripped leading zero (e.g. 9058354233)
  if (/^9\d{9}$/.test(cleaned)) {
    return '+63' + cleaned;
  }

  // Return cleaned with '+' if it already starts with '+'
  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  return cleaned;
}

/**
 * Sends an SMS to the parent after a successful scan using TextBee.dev API.
 * Returns 'no_phone' if the student has no parent number on record.
 * Returns 'sent' on success, 'failed' on API error.
 */
export async function sendAttendanceSms(payload: ScanSmsPayload): Promise<SmsResult> {
  console.log('[SMS] sendAttendanceSms called with:', payload);
  console.log('[SMS] TextBee API KEY present:', !!TEXTBEE_API_KEY);
  console.log('[SMS] TextBee DEVICE ID:', TEXTBEE_DEVICE_ID || '(default online device)');

  const formattedPhone = formatPhilippinePhoneNumber(payload.parentPhone);

  if (!formattedPhone) {
    console.warn('[SMS] No valid phone number provided for student:', payload.studentName);
    return 'no_phone';
  }

  if (!TEXTBEE_API_KEY) {
    console.error('[TextBee] Missing VITE_TEXTBEE_API_KEY environment variable.');
    return 'failed';
  }

  console.log('[SMS] Target formatted phone:', formattedPhone, '(original:', payload.parentPhone, ')');

  const time = payload.scannedAt.toLocaleTimeString('en-PH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const date = payload.scannedAt.toLocaleDateString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Keep under 160 chars to avoid double SMS credit usage
  const content =
    `[RTNHS Attendance] ${payload.studentName} has ${payload.scanType} ` +
    `at ${time}. Date: ${date} | ${payload.section}`;

  const endpoint = TEXTBEE_DEVICE_ID
    ? `https://api.textbee.dev/api/v1/gateway/devices/${TEXTBEE_DEVICE_ID.trim()}/send-sms`
    : `https://api.textbee.dev/api/v1/gateway/send-sms`;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': TEXTBEE_API_KEY.trim(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipients: [formattedPhone],
        message: content,
      }),
    });

    const data = await response.json().catch(() => null);

    if (response.ok) {
      console.log('[TextBee] Successfully queued/sent SMS:', data);
      return 'sent';
    }

    console.error('[TextBee] API returned error:', response.status, data);
    return 'failed';
  } catch (error) {
    console.error('[TextBee] Failed to send SMS:', error);
    return 'failed';
  }
}
