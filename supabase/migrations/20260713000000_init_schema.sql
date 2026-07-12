-- Create custom types for ENUMs
CREATE TYPE role_type AS ENUM ('admin', 'teacher');
CREATE TYPE window_type_enum AS ENUM ('morning_in', 'afternoon_in', 'afternoon_out');
CREATE TYPE window_status_enum AS ENUM ('open', 'late', 'closed');
CREATE TYPE attendance_status_enum AS ENUM ('PRESENT', 'LATE', 'ABSENT');

-- Profiles Table
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role role_type NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Sections Table
CREATE TABLE sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    grade_level TEXT NOT NULL,
    scanner_pin TEXT UNIQUE NOT NULL CHECK (scanner_pin ~ '^[0-9]{4}$'),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Students Table
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    lrn TEXT UNIQUE NOT NULL,
    qr_code TEXT UNIQUE NOT NULL,
    parent_phone TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Subjects Table
CREATE TABLE subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Teacher Assignments Table
CREATE TABLE teacher_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    time_slot TEXT NOT NULL,
    days_of_week TEXT[] NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Scan Windows Table
CREATE TABLE scan_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    opened_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    window_type window_type_enum NOT NULL,
    status window_status_enum NOT NULL DEFAULT 'open',
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at TIMESTAMPTZ,
    late_opened_at TIMESTAMPTZ,
    late_closed_at TIMESTAMPTZ
);

-- Attendance Logs Table
CREATE TABLE attendance_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    scan_window_id UUID NOT NULL REFERENCES scan_windows(id) ON DELETE CASCADE,
    status attendance_status_enum NOT NULL,
    scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    offline_sync BOOLEAN DEFAULT false NOT NULL
);

--------------------------------------------------------------------------------
-- ROW LEVEL SECURITY (RLS)
--------------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;

-- Helpers

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 1. Profiles
CREATE POLICY "Admins have full access to profiles"
    ON profiles FOR ALL
    USING (public.is_admin());

CREATE POLICY "Users can read their own profile"
    ON profiles FOR SELECT
    USING (id = auth.uid());

-- 2. Sections
CREATE POLICY "Admins have full access to sections"
    ON sections FOR ALL
    USING (public.is_admin());

CREATE POLICY "Teachers can read assigned sections"
    ON sections FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM teacher_assignments 
            WHERE teacher_assignments.section_id = sections.id 
            AND teacher_assignments.teacher_id = auth.uid()
        )
    );

CREATE POLICY "Scanners can read section if session claims match (anon/custom)"
    ON sections FOR SELECT
    USING (true); -- Currently public read or restricted via edge function (placeholder for actual implementation)

-- 3. Students
CREATE POLICY "Admins have full access to students"
    ON students FOR ALL
    USING (public.is_admin());

CREATE POLICY "Teachers can read students in assigned sections"
    ON students FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM teacher_assignments 
            WHERE teacher_assignments.section_id = students.section_id 
            AND teacher_assignments.teacher_id = auth.uid()
        )
    );

CREATE POLICY "Scanners can read students (public for scan validation)"
    ON students FOR SELECT
    USING (true); -- Placeholder: should restrict via section_id claim in Edge Function/JWT

-- 4. Subjects
CREATE POLICY "Admins have full access to subjects"
    ON subjects FOR ALL
    USING (public.is_admin());

CREATE POLICY "Teachers can read subjects"
    ON subjects FOR SELECT
    USING (true);

-- 5. Teacher Assignments
CREATE POLICY "Admins have full access to teacher_assignments"
    ON teacher_assignments FOR ALL
    USING (public.is_admin());

CREATE POLICY "Teachers can read their own assignments"
    ON teacher_assignments FOR SELECT
    USING (teacher_id = auth.uid());

-- 6. Scan Windows
CREATE POLICY "Admins have full access to scan_windows"
    ON scan_windows FOR ALL
    USING (public.is_admin());

CREATE POLICY "Teachers can manage scan windows for their assigned sections"
    ON scan_windows FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM teacher_assignments 
            WHERE teacher_assignments.section_id = scan_windows.section_id 
            AND teacher_assignments.teacher_id = auth.uid()
        )
    );

CREATE POLICY "Scanners can read scan_windows"
    ON scan_windows FOR SELECT
    USING (true); -- Required to validate if a window is open before logging attendance

CREATE POLICY "Scanners can insert scan_windows"
    ON scan_windows FOR INSERT
    WITH CHECK (true); -- Scanner station opens the window (no auth session)

CREATE POLICY "Scanners can update scan_windows"
    ON scan_windows FOR UPDATE
    USING (true)
    WITH CHECK (true); -- Scanner station updates status (late/closed)

-- 7. Attendance Logs
CREATE POLICY "Admins have full access to attendance_logs"
    ON attendance_logs FOR ALL
    USING (public.is_admin());

CREATE POLICY "Teachers can read attendance logs for assigned sections"
    ON attendance_logs FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM teacher_assignments ta
            JOIN scan_windows sw ON sw.section_id = ta.section_id
            WHERE sw.id = attendance_logs.scan_window_id 
            AND ta.teacher_id = auth.uid()
        )
    );

CREATE POLICY "Scanners can insert attendance_logs"
    ON attendance_logs FOR INSERT
    WITH CHECK (true); -- Allowed globally for now (or via anon key + edge function limits)
