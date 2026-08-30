-- Add verification photo URL column to attendance_logs
-- Stores the Supabase Storage URL of the face photo captured
-- at the time of QR scan for anti-fraud verification
ALTER TABLE attendance_logs 
ADD COLUMN verification_photo_url TEXT;
