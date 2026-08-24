# RTNHS QR Code Attendance System with SMS

> [!NOTE]
> **Living Document**: Moving forward, this file will be continuously modified to track every major edit, feature addition, and architectural change in the project. Any significant updates will be documented here to maintain a comprehensive history of the project's state.

## Project Overview
The **RTNHS QR Code Attendance System** is a web-based application designed to streamline student attendance tracking using QR code scanning. It also features automated SMS notifications to parents when a student's attendance is recorded. The system is built with a modern React stack and uses Supabase for backend services.

## Technology Stack
- **Frontend Framework**: React 19, Vite
- **Routing**: React Router DOM v7
- **Styling**: Tailwind CSS, class-variance-authority, clsx, tailwind-merge
- **State Management**: Zustand
- **Backend & Database**: Supabase
- **QR Code Handling**: `jsqr` (scanning), `qrcode` (generation)
- **SMS Integration**: `httpsms`
- **Other Utilities**: `date-fns` (dates), `papaparse` (CSV parsing), `jspdf` (PDF generation), `lucide-react` (icons)

## Portals & Routing Architecture

The application is divided into three distinct user portals, protected by role-based authentication (`ProtectedAdminRoute`, `ProtectedTeacherRoute`):

### 1. Admin Portal (`/admin/*`)
**Purpose**: Centralized management of school data.
**Key Features & Screens**:
- **Admin Dashboard**: The main landing page for administrators.
- **Subject Manager**: Add, edit, and remove subjects (Full CRUD).
- **Section Manager**: Manage class sections, grade levels, and 4-digit scanner PINs (Full CRUD).
- **Schedule Manager**: Configure class schedules mapping subjects to sections and teachers (Full CRUD).
- **Teacher Manager**: Onboard and manage teacher accounts with hard-deletion using Supabase Admin API (Full CRUD).
- **Student Roster Management**: Manage individual students via `StudentManager` with Edit and Delete functionality. Features bulk selection with search, sorting (A-Z/Z-A), select all, deselect all, invert selection, and bulk deletion with confirmation dialog.
- **Student Import**: Bulk import student records via drag-and-drop or file browse (CSV/XLSX) with fuzzy column matching. Import preview is fully selectable with search, sorting, select all/deselect/invert controls — only selected rows are imported. LRNs are optional.
- **Export QR**: Generates PDF/PNG QR codes for sections. Students are individually selectable for export with search, sorting, select all/deselect/invert controls. Admin privilege bypasses teacher-assignment limits.

### 2. Teacher Portal (`/teacher/*`)
**Purpose**: Tools for teachers to track and manage their classes' attendance.
**Key Features & Screens**:
- **Teacher Dashboard**: The main landing page for teachers.
- **Attendance Grid**: A detailed view of student attendance records for specific classes/schedules.
- **Schedule Cards**: Visual representation of the teacher's assigned classes.
- **Stats Panel**: Analytics and overview of attendance statistics.
- **QR Exporter**: Generate and export QR codes for students in assigned sections. Students are individually selectable for bulk PDF export with search, sorting, and selection controls.

### 3. Scanner Terminal (`/scanner`)
**Purpose**: A dedicated kiosk/terminal interface for scanning student QR codes as they enter/leave.
**Key Features & Screens**:
- **Scanner Terminal Main Screen**: The primary interface for scanning.
- **Camera Stream**: Real-time video feed for capturing QR codes via `jsqr`.
- **Audio Feedback**: Audible cues (success/error sounds) upon scanning.
- **State Controls**: Interface controls for the terminal (e.g., selecting Time In / Time Out).
- **Pin Screen**: Security mechanism, likely to lock/unlock the terminal or for manual entry.
- **SMS Integration**: Automatically triggers SMS notifications to parents via `httpsms` upon successful scans.

## Key Services & Libraries
- **`src/lib/supabase.ts`**: Supabase client initialization for database queries and authentication.
- **`src/lib/sms.ts`**: Handles the communication with the `httpsms` API for sending automated attendance texts.
- **`src/lib/exportFormatter.ts`**: Utilities for formatting data for export (CSV/PDF).
- **`src/lib/theme.ts` & `theme-store.ts`**: Global theme configuration and state.
- **`xlsx` (SheetJS)**: For parsing Excel files during batch import.

## Change History
- *Initial project state documentation established. (August 2026)*
- **August 2026**: 
  - Made student LRN inputs optional for single entry and batch imports.
  - Upgraded Batch Import to support XLSX/XLS files alongside CSV, featuring fuzzy/flexible header column matching (e.g., `full name`, `name`, `studentname`).
  - Integrated `QrExporter` into the Admin Dashboard, enabling admins to bypass teacher assignment checks and export QR codes for any section.
  - Implemented comprehensive CRUD functionalities across the Admin Dashboard (Teachers, Subjects, Sections, Schedules, and a new `StudentManager` module).
  - Adjusted PDF QR bulk export to CR80 standard ID sizing with dynamic text wrapping and conditional LRN rendering.
  - **QR Exporter Selection Controls**: Added selectable student list for bulk QR PDF export with search, sorting (A-Z/Z-A), select all, deselect all, and invert selection. Only selected students are exported.
  - **Student Manager Bulk Deletion**: Added checkbox selection, search, sorting, and bulk delete with confirmation dialog to the Student Roster Management panel. Rows are numbered for easy tracking.
  - **Drag-and-Drop Import**: Upgraded batch student import with a stylized drag-and-drop zone (also supports click-to-browse).
  - **Selectable Import Preview**: Import preview table now features full selection controls (checkboxes, select all, deselect, invert, search, sorting). Only selected rows from the preview are inserted on confirm.
  - **Mobile-First UI/UX Overhaul**:
    - Standardized all interactive elements (buttons, inputs, selects) to `min-height: 44px` for accessible touch targets across the entire app.
    - Added `active:scale-95` micro-interaction to all buttons for tactile mobile feedback.
    - Refactored `Dialog` component to be fully responsive with `max-height` constraints and internal scrolling on small screens.
    - Converted `AdminDashboard` and `TeacherDashboard` dynamic panel containers from hardcoded inline styles to responsive Tailwind utility classes (`p-4 md:p-6`).
    - **Responsive Stats Cards**: Admin stats cards now render in a compact 3-column row on mobile (previously stacked vertically). Teacher stats cards render in a 2×2 grid on mobile (previously single column). Font sizes and padding scale responsively (`text-xl md:text-3xl`, `p-3 md:p-4`).
    - **Mobile-First Data Tables**: Replaced horizontal-scroll table layouts in `StudentManager`, `StudentImport`, `SectionManager`, and `TeacherManager` with responsive stacked layouts — on mobile, rows display as a vertical card with primary info on line 1, secondary details on line 2 with inline labels, and actions as full-width touch-friendly buttons. Desktop retains the original grid table layout via `md:grid` breakpoints.
    - **AttendanceGrid**: Updated all three tab views (Daily, Weekly, Monthly) with increased header font sizes and padding for improved readability.
    - **ScannerTerminal**: Applied `min-h-[44px]` to window-type selector buttons, manual LRN input, and submit button for full mobile usability.
  - **Scanner Terminal — Inline Debug Mode & Mobile Camera Flip (August 2026)**:
    - Replaced the popup `DebugScanModal` with an inline `[ Live Mode ] | [ Debug Mode ]` segmented toggle sharing the exact same camera stream and `jsQR` processing loop (no second stream, no popup, no dual permission requests).
    - Debug mode displays an inline feedback overlay (Raw Payload String, Student Name Match, Validation Status) and **bypasses** the Supabase `attendance_logs` insert entirely.
    - Added a **Flip Camera** button (`SwitchCamera`) that stops the active `MediaStream` tracks and re-requests `getUserMedia` toggling `facingMode` between `environment` (rear) and `user` (front).
    - Added a **Grant / Retry Camera Access** button to the camera error state, allowing recovery from denied access or a wrong camera selection.
  - **Scanner Terminal — Camera Permission Stability (August 2026)**:
    - Fixed a stale-closure bug where toggling modes changed the `onScan` callback identity, re-firing the camera effect and re-prompting for camera permission. `onScan` is now held in a ref and `scanFrame` uses stable deps.
    - Refactored `TabsContent` to keep inactive tabs mounted and hidden (`display: none`) instead of unmounting them, so camera streams survive tab switches without re-requesting `getUserMedia`.
  - **Scanner Terminal — Scan History Fix & SMS Toggle (August 2026)**:
    - Fixed empty Scan History by switching `ScanHistoryTab` to the **service-role** Supabase client (the anon JWT had no `SELECT` RLS policy on `attendance_logs`).
    - Added an **SMS Notifications** toggle switch in the right column; when OFF, `sendAttendanceSms()` and the `sms_logs` insert are skipped entirely while attendance recording continues.
  - **Scanner Terminal — Window Persistence & Time Configuration (August 2026)**:
    - Added `morning_in`, `afternoon_in`, and `afternoon_out` time range configurations to the `sections` table. Admin can configure these defaults in `SectionManager`.
    - **Scanner Terminal** now automatically suggests the appropriate window type based on the current time and the section's configured timeframes.
    - Added a robust **Hydration System**: On reload or restart, the scanner automatically finds the active window for the current day, locks the camera via an `isHydrating` guard, and uses `supabaseServiceRole` to fetch all previously scanned `attendance_logs` to rebuild the local cache (`scannedIds`).
    - Fixed a severe race condition during rapid double-scans by locking `scannedIdsRef` synchronously in memory before the async database insert completes.
    - Added a `UNIQUE(student_id, scan_window_id)` database constraint to `attendance_logs` to strictly prevent duplicate scans across multiple devices.
  - **Detailed Excel Attendance Exporter (August 2026)**:
    - Built a robust multi-sheet Excel generator using `exceljs` in `src/lib/excelExport.ts`.
    - Features a **Monthly Summary** tab that aggregates daily statuses (P, AM-L, PM-L, L, AM-A, PM-A, A).
    - Features individual **Weekly Breakdown** tabs (grouped by ISO week, Monday-Friday) that utilize complex merged headers (AM IN, PM IN, PM OUT).
    - The weekly tabs export precise `hh:mm a` timestamps for every scan, seamlessly handling missing/absent logs.
    - Exports are fully color-coded for quick visual status identification.


