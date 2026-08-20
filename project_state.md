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
- **Student Roster Management**: Manage individual students via `StudentManager` with Edit and Delete functionality.
- **Student Import**: Bulk import student records via CSV or XLSX with fuzzy column matching. LRNs are optional.
- **Export QR**: Generates PDF/PNG QR codes for all sections (Admin privilege bypasses teacher-assignment limits).

### 2. Teacher Portal (`/teacher/*`)
**Purpose**: Tools for teachers to track and manage their classes' attendance.
**Key Features & Screens**:
- **Teacher Dashboard**: The main landing page for teachers.
- **Attendance Grid**: A detailed view of student attendance records for specific classes/schedules.
- **Schedule Cards**: Visual representation of the teacher's assigned classes.
- **Stats Panel**: Analytics and overview of attendance statistics.
- **QR Exporter**: Generate and export QR codes for students in assigned sections.

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

