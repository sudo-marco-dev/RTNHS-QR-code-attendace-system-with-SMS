const TEXTBEE_API_KEY = (import.meta.env.VITE_TEXTBEE_API_KEY || '') as string;
const TEXTBEE_DEVICE_ID = (import.meta.env.VITE_TEXTBEE_DEVICE_ID || '') as string;

export type SmsResult = 'queued' | 'sent' | 'delivered' | 'failed' | 'no_phone' | 'quota_exceeded';

export interface ScanSmsPayload {
  studentName: string;
  section: string;
  scanType: 'TIME IN' | 'TIME OUT';
  scannedAt: Date;
  parentPhone: string | null;
  onStatusUpdate?: (status: SmsResult) => void;
}

export interface TextBeeQuotaInfo {
  processedSmsToday: number;
  dailyLimit: number;
  processedSmsLastMonth: number;
  monthlyLimit: number;
  planName: string;
  isActive: boolean;
}

export interface DirectSmsResult {
  status: SmsResult;
  batchId?: string;
  errorMessage?: string;
}

/**
 * Fetches live daily & monthly SMS quota usage from TextBee.dev billing API.
 */
export async function fetchTextBeeQuota(): Promise<TextBeeQuotaInfo | null> {
  if (!TEXTBEE_API_KEY) return null;

  try {
    const res = await fetch('https://api.textbee.dev/api/v1/billing/current-subscription', {
      headers: {
        'x-api-key': TEXTBEE_API_KEY.trim(),
        'Accept': 'application/json',
      },
    });

    if (!res.ok) return null;
    const data = await res.json();

    return {
      processedSmsToday: data?.usage?.processedSmsToday ?? 0,
      dailyLimit: data?.usage?.dailyLimit ?? data?.plan?.dailyLimit ?? 50,
      processedSmsLastMonth: data?.usage?.processedSmsLastMonth ?? 0,
      monthlyLimit: data?.usage?.monthlyLimit ?? data?.plan?.monthlyLimit ?? 300,
      planName: data?.plan?.name ?? 'free',
      isActive: Boolean(data?.isActive),
    };
  } catch (err) {
    console.warn('[TextBee] Failed to fetch quota usage:', err);
    return null;
  }
}

/**
 * Polls TextBee device messages endpoint to verify whether a queued SMS batch
 * was actually dispatched ('sent') and confirmed ('delivered') by the carrier.
 */
export async function pollTextBeeDeliveryStatus(
  smsBatchId: string,
  onStatusUpdate?: (status: SmsResult) => void,
  maxAttempts = 8,
  intervalMs = 2000
): Promise<SmsResult> {
  if (!TEXTBEE_API_KEY || !TEXTBEE_DEVICE_ID || !smsBatchId) {
    return 'queued';
  }

  let latestState: SmsResult = 'queued';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));

    try {
      const res = await fetch(
        `https://api.textbee.dev/api/v1/gateway/devices/${TEXTBEE_DEVICE_ID.trim()}/messages?limit=10`,
        {
          headers: {
            'x-api-key': TEXTBEE_API_KEY.trim(),
            'Accept': 'application/json',
          },
        }
      );

      if (!res.ok) continue;
      const json = await res.json();
      const messages: any[] = json?.data || [];
      const match = messages.find((m) => m.smsBatch === smsBatchId);

      if (!match) continue;

      const rawStatus = String(match.status || '').toLowerCase();

      if (rawStatus === 'delivered') {
        latestState = 'delivered';
        onStatusUpdate?.('delivered');
        return 'delivered';
      }

      if (rawStatus === 'failed') {
        latestState = 'failed';
        onStatusUpdate?.('failed');
        return 'failed';
      }

      if (rawStatus === 'sent' && latestState !== 'sent') {
        latestState = 'sent';
        onStatusUpdate?.('sent');
      }
    } catch (err) {
      console.warn('[TextBee] Delivery poll attempt failed:', err);
    }
  }

  return latestState;
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
 * Direct SMS dispatch using TextBee API.
 */
export async function sendDirectSms(
  phone: string | null | undefined,
  content: string,
  onStatusUpdate?: (status: SmsResult) => void
): Promise<DirectSmsResult> {
  const formattedPhone = formatPhilippinePhoneNumber(phone);

  if (!formattedPhone) {
    return { status: 'no_phone', errorMessage: 'Invalid or missing phone number' };
  }

  if (!TEXTBEE_API_KEY) {
    return { status: 'failed', errorMessage: 'Missing VITE_TEXTBEE_API_KEY' };
  }

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

    if (response.status === 429 || (data?.message && String(data.message).toLowerCase().includes('limit'))) {
      onStatusUpdate?.('quota_exceeded');
      return { status: 'quota_exceeded', errorMessage: data?.message || 'Daily SMS quota reached' };
    }

    if (response.ok) {
      const smsBatchId = data?.data?.smsBatchId;
      onStatusUpdate?.('queued');

      if (smsBatchId && TEXTBEE_DEVICE_ID) {
        const finalStatus = await pollTextBeeDeliveryStatus(smsBatchId, onStatusUpdate);
        return { status: finalStatus, batchId: smsBatchId };
      }

      return { status: 'queued', batchId: smsBatchId };
    }

    const err = data?.message || data?.error || `HTTP ${response.status}`;
    return { status: 'failed', errorMessage: err };
  } catch (error: any) {
    return { status: 'failed', errorMessage: error?.message || 'Network error' };
  }
}

/**
 * Sends an SMS to the parent after a successful scan using TextBee.dev API,
 * and polls the device to confirm actual carrier delivery.
 */
export async function sendAttendanceSms(payload: ScanSmsPayload): Promise<SmsResult> {
  console.log('[SMS] sendAttendanceSms called with:', payload);

  const formattedPhone = formatPhilippinePhoneNumber(payload.parentPhone);
  if (!formattedPhone) {
    console.warn('[SMS] No valid phone number provided for student:', payload.studentName);
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

  const res = await sendDirectSms(formattedPhone, content, payload.onStatusUpdate);
  return res.status;
}
