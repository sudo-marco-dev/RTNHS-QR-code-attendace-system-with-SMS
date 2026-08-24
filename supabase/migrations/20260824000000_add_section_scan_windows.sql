-- Add time range columns to sections table
ALTER TABLE sections 
ADD COLUMN morning_in_start TIME DEFAULT '06:00:00',
ADD COLUMN morning_in_end TIME DEFAULT '07:30:00',
ADD COLUMN afternoon_in_start TIME DEFAULT '12:30:00',
ADD COLUMN afternoon_in_end TIME DEFAULT '13:30:00',
ADD COLUMN afternoon_out_start TIME DEFAULT '16:00:00',
ADD COLUMN afternoon_out_end TIME DEFAULT '17:00:00';
