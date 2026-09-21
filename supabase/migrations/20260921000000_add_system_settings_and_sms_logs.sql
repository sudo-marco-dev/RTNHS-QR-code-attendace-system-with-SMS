-- Migration: Add system_settings table and sms_logs table
-- Allows global configuration (e.g. toggling SMS notifications on/off) and logs sent SMS messages.

-- 1. System Settings Table
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS for system_settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Allow public read access to system_settings (for scanner kiosks and teachers)
DROP POLICY IF EXISTS "Allow public read access to system_settings" ON public.system_settings;
CREATE POLICY "Allow public read access to system_settings"
    ON public.system_settings FOR SELECT
    USING (true);

-- Allow admins full management of system_settings
DROP POLICY IF EXISTS "Allow admins to manage system_settings" ON public.system_settings;
CREATE POLICY "Allow admins to manage system_settings"
    ON public.system_settings FOR ALL
    USING (public.is_admin());

-- Allow service role full access
DROP POLICY IF EXISTS "Allow service role full access to system_settings" ON public.system_settings;
CREATE POLICY "Allow service role full access to system_settings"
    ON public.system_settings FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');

-- Insert default setting for SMS: enabled = true
INSERT INTO public.system_settings (key, value, description)
VALUES ('sms_enabled', 'true'::jsonb, 'Global toggle for automated attendance SMS notifications')
ON CONFLICT (key) DO NOTHING;

-- 2. SMS Logs Table
CREATE TABLE IF NOT EXISTS public.sms_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_log_id UUID REFERENCES public.attendance_logs(id) ON DELETE SET NULL,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    parent_phone TEXT,
    message_content TEXT NOT NULL,
    status TEXT NOT NULL, -- 'sent', 'failed', 'no_phone'
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Enable RLS for sms_logs
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

-- Allow admins full access to sms_logs
DROP POLICY IF EXISTS "Allow admins full access to sms_logs" ON public.sms_logs;
CREATE POLICY "Allow admins full access to sms_logs"
    ON public.sms_logs FOR ALL
    USING (public.is_admin());

-- Allow scanner / public / service role to insert sms_logs
DROP POLICY IF EXISTS "Allow scanners to insert sms_logs" ON public.sms_logs;
CREATE POLICY "Allow scanners to insert sms_logs"
    ON public.sms_logs FOR INSERT
    WITH CHECK (true);
