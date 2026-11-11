-- Migration: Enhance sms_logs table for broadcast messaging and delivery tracking
ALTER TABLE public.sms_logs
ADD COLUMN IF NOT EXISTS sms_type TEXT DEFAULT 'attendance',
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS batch_id TEXT;

CREATE INDEX IF NOT EXISTS idx_sms_logs_status ON public.sms_logs(status);
CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON public.sms_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_sms_type ON public.sms_logs(sms_type);
