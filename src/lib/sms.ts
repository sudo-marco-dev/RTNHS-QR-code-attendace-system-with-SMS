import Client from 'httpsms';

const SENDER_PHONE = import.meta.env.VITE_HTTPSMS_SENDER_PHONE as string;
const API_KEY = import.meta.env.VITE_HTTPSMS_API_KEY as string;

const smsClient = new Client(API_KEY);

export type SmsResult = 'sent' | 'failed' | 'no_phone';

export interface ScanSmsPayload {
  studentName: string;
  section: string;
  scanType: 'TIME IN' | 'TIME OUT';
  scannedAt: Date;
  parentPhone: string | null;
}

/**
 * Sends an SMS to the parent after a successful scan.
 * Returns 'no_phone' if the student has no parent number on record.
 * Returns 'sent' on success, 'failed' on API error.
 */
export async function sendAttendanceSms(payload: ScanSmsPayload): Promise<SmsResult> {
  console.log('[SMS] sendAttendanceSms called with:', payload)
  console.log('[SMS] API KEY present:', !!import.meta.env.VITE_HTTPSMS_API_KEY)
  console.log('[SMS] SENDER PHONE:', import.meta.env.VITE_HTTPSMS_SENDER_PHONE)

  if (!payload.parentPhone || payload.parentPhone.trim() === '') {
    return 'no_phone';
  }

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

  try {
    const response = await smsClient.messages.postSend({
      content,
      from: SENDER_PHONE,
      to: payload.parentPhone,
      encrypted: false
    });

    if (response && response.id) {
      return 'sent';
    }
    return 'failed';
  } catch (error) {
    console.error('[httpSMS] Failed to send SMS:', error);
    return 'failed';
  }
}
