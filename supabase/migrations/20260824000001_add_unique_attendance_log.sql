-- Add a UNIQUE constraint to ensure a student can only be logged once per scan window
ALTER TABLE attendance_logs 
ADD CONSTRAINT unique_student_scan_window 
UNIQUE (student_id, scan_window_id);
