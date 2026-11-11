-- Migration: Normalize existing Philippine parent phone numbers to E.164 (+639XXXXXXXXX)

-- 1. Remove spaces, hyphens, periods, and parentheses
UPDATE students
SET parent_phone = REGEXP_REPLACE(parent_phone, '[\s\-\(\)\.]', '', 'g')
WHERE parent_phone IS NOT NULL AND parent_phone <> '';

-- 2. Clean leading '+0' e.g. '+09XXXXXXXXX' -> '09XXXXXXXXX'
UPDATE students
SET parent_phone = SUBSTRING(parent_phone FROM 2)
WHERE parent_phone ~ '^\+09[0-9]{9}$';

-- 3. Clean '0063' -> '+63'
UPDATE students
SET parent_phone = '+63' || SUBSTRING(parent_phone FROM 5)
WHERE parent_phone ~ '^00639[0-9]{9}$';

-- 4. Clean '+6309...' -> '+639...'
UPDATE students
SET parent_phone = '+63' || SUBSTRING(parent_phone FROM 6)
WHERE parent_phone ~ '^\+6309[0-9]{9}$';

-- 5. Fix numbers where Excel stripped leading zero: 10 digits starting with '9' -> '+639XXXXXXXXX'
UPDATE students
SET parent_phone = '+63' || parent_phone
WHERE parent_phone ~ '^9[0-9]{9}$';

-- 6. Fix standard 11-digit local format: '09XXXXXXXXX' -> '+639XXXXXXXXX'
UPDATE students
SET parent_phone = '+63' || SUBSTRING(parent_phone FROM 2)
WHERE parent_phone ~ '^09[0-9]{9}$';

-- 7. Fix numbers starting with '639XXXXXXXXX' without '+' -> '+639XXXXXXXXX'
UPDATE students
SET parent_phone = '+' || parent_phone
WHERE parent_phone ~ '^639[0-9]{9}$';
