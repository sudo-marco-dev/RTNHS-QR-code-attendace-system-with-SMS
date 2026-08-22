# RTNHS QR Code Attendance System with SMS

A web-based attendance system for **Rio Tuba National High School** that lets teachers take student attendance by **scanning QR codes** and automatically **notifies parents by SMS** when a student is marked present or late.

This guide is written for **beginners** — you don't need to know how to code to use the system. If you only read one thing, read **"The Three Portals"** below to understand where each type of user logs in.

---

## Table of Contents

1. [What This System Does](#what-this-system-does)
2. [The Three Portals](#the-three-portals)
3. [Getting Started (Developers)](#getting-started-developers)
4. [Admin Portal — Managing Everything](#1-admin-portal--managing-everything)
5. [Teacher Portal — Checking Your Classes](#2-teacher-portal--checking-your-classes)
6. [Scanner Terminal — Taking Attendance](#3-scanner-terminal--taking-attendance)
7. [The Scanner Terminal In Depth](#the-scanner-terminal-in-depth)
8. [Common Questions & Troubleshooting](#common-questions--troubleshooting)
9. [Project State](#project-state)

---

## What This System Does

At its core, there are **three jobs**:

| Job | Where it happens | Who does it |
|-----|------------------|-------------|
| Set up students, teachers, sections, subjects, schedules | **Admin Portal** | School administrators |
| Review attendance and export QR codes | **Teacher Portal** | Teachers |
| Scan students in as they arrive/leave | **Scanner Terminal** | Scanner operators (staff at a kiosk) |

**The flow in plain English:**

1. An **administrator** adds students and assigns them to **sections** (classrooms). Each section gets a **4-digit PIN**.
2. The system generates a **QR code** for every student.
3. A **teacher** prints the QR codes and hands them to students.
4. At the door, a **scanner operator** opens the Scanner Terminal, selects the section, and scans each student's QR code.
5. The system records the attendance and **sends an SMS to the parent's phone**.
6. Teachers and admins can review all the attendance later.

---

## The Three Portals

There are **three separate screens** (called "portals") in this app. Each one is used by a different type of person, and each requires its own way to get in.

### 1. Admin Portal — `https://your-app.com/admin`
- **Log in with** an email and password of an **admin account**.
- **Used for**: the "behind-the-scenes" setup — students, teachers, sections, subjects, schedules.
- **Route**: `/admin`

### 2. Teacher Portal — `https://your-app.com/teacher`
- **Log in with** an email and password of a **teacher account**.
- **Used for**: viewing attendance for the classes assigned to you, and exporting QR codes to print.
- **Route**: `/teacher`

### 3. Scanner Terminal — `https://your-app.com/scanner`
- **No email/password needed.** The scanner is a public kiosk screen.
- Instead, the operator unlocks it with **a section's 4-digit PIN** (set up by the admin).
- **Used for**: actually taking attendance at the door by scanning QR codes.
- **Route**: `/scanner`

> **Note on the Scanner Terminal:** The scanner records attendance using the school's **service-role** access because it is a kiosk with no logged-in user. This means **the scanner code is trusted** — treat the scanner station as a protected physical device.

---

## Getting Started (Developers)

### Requirements

- **Node.js 18+** (includes `npm`)
- A **Supabase** project (free tier is fine) with the schema from `supabase/migrations/`
- (Optional but recommended) an **httpsms** account for SMS

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Create a `.env.local` file in the root of the project and fill it in. Do **not** commit this file — it already shows in `.gitignore`.

```env
# Supabase
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
VITE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # scanner + history use this

# SMS (httpsms)
VITE_HTTPSMS_API_KEY=your-httpsms-api-key
VITE_HTTPSMS_DEVICE_IDS=your-device-id
VITE_HTTPSMS_FROM=your-sender-number
```

### 3. Run the app locally

```bash
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

> **Camera note:** `getUserMedia` (the camera) only works on a **secure context** — i.e. `https://` or `localhost`. If you test on a phone over Wi-Fi, use HTTPS or a tunnel. In the `package.json` there is an `@vitejs/plugin-basic-ssl` dependency that lets you run Vite with a basic SSL cert if you need it.

### 4. Build for production

```bash
npm run build
```

This runs TypeScript checks and creates a production-ready `dist/` folder. The project is configured to deploy to **Vercel** (`vercel.json` is present).

### 5. Run lint

```bash
npm run lint
```

---

## 1. Admin Portal — Managing Everything

The admin portal is where all the setup happens. The drawer/sidebar on the left lists every management screen.

### Sections (Classrooms)

Sections are the "classrooms" of the school. Each section:

- Has a **Name** (e.g. `Grade 7 - Sampaguita`), **Grade Level**, and a unique **4-digit Scanner PIN**.
- The **Scanner PIN** is what scanner operators type to open the scanner for your section.

**How to add a section:**
1. Go to **Sections**.
2. Click **Add Section**.
3. Enter the name, grade level, and choose a 4-digit PIN.
4. Save.

### Subjects

Subjects are the courses (e.g. Mathematics, English, Science). Adding them is a simple list — just a **Name** and **Code** (e.g. `MAT`, `ENG`).

### Teachers

Teachers are the people who will log into the Teacher Portal. An admin:

- Creates a teacher account (name, email, password, role = teacher).
- Assigns the teacher to **sections** and **subjects** via the **Schedule Manager**.
- Can **delete** teachers if needed (hard delete via Supabase admin API).

### Schedules

Schedules connect everything together: they map **Subject + Section + Teacher + Time Slot + Days of the Week**. A teacher only sees attendance and QR codes for the sections they are scheduled to.

**To create a schedule:**
1. Go to **Schedule**.
2. Pick the **Teacher**, **Section**, **Subject**, **Time Slot**, and the **Days**.
3. Save.

### Student Roster

Every student belongs to a section. On the roster screen you can:

- **Add** a single student (full name; LRN is optional).
- **Edit** a student.
- **Delete** one or many students at once (checkboxes → bulk delete).
- **Search** and **sort** the list (A–Z / Z–A).
- See each student's status as scanned (`✓`) or not (`—`).

### Import Students (Bulk)

To add many students at once:

1. Go to the **Student Import** screen.
2. **Drag and drop** a CSV or Excel (`.xlsx` / `.xls`) file, or click to browse.
3. The system matches columns flexibly (so `Full Name`, `Name`, `Student Name` all work).
4. **Preview** shows you what will be imported. You can **search, sort, select all / none / invert** — only the rows you keep selected get imported.
5. Click Confirm.

### Export QR Codes

Each student gets a QR code. To print them:

1. Go to **Export QR**.
2. Select a **section**.
3. Pick which students to export (search/sort/select-all controls are available).
4. Export as a **PDF** (IDs are sized to CR80 standard card size) or **PNG**.

> Admins can export QR codes for *any* section. Teachers can only export for their assigned sections.

---

## 2. Teacher Portal — Checking Your Classes

Teachers log in with their email/password and only see the sections assigned to them through schedules.

### Dashboard

The dashboard shows your schedule as **cards** for each class, plus a **Stats Panel** with an overview of attendance.

### Attendance Grid

Open a class to see the attendance grid in three views:

- **Daily** — see today's attendance for the class.
- **Weekly** — a week at a glance.
- **Monthly** — the full month.

Each student shows their status (**PRESENT**, **LATE**, or **ABSENT**) with color coding.

### Export QR Codes

Using the QR Export tool, teachers can generate QR code PDFs/PNGs for **their assigned students** — useful for handing out to students or printing classroom QR sheets.

---

## 3. Scanner Terminal — Taking Attendance

The Scanner Terminal is the main "action" screen. It does **not** need a login — it runs on the kiosk.

### Step-by-step: Scanner Operator

1. **Open the Scanner Terminal** — go to `/scanner`, or click **"Open Scanner Terminal"** on the login screen.
2. **Unlock with a Section PIN** — Type the 4-digit PIN of the section. (If you don't know it, ask the admin — it's set in the Sections screen.)
3. **Choose or open a Scan Window** — If no window is open yet, pick the time slot:
   - `Morning IN`
   - `Afternoon IN`
   - `Afternoon OUT`
   - Marking a window **completed** automatically advances to the next one in order.
4. **Open the window** — use the **State Controls** on the right (Open / Late / Close).
5. **Scan** — Point the camera at a student's QR code. The system will:
   - Play a **success sound** and show the student's name + status on a feedback card.
   - Record the attendance in the database.
   - Send an **SMS to the parent** (if SMS is enabled — see below).
6. Watch the **stats** (Scanned / Remaining / Total) and the **roster** ticking off `✓` as students scan in.

### The Scanner Terminal In Depth

The scanner screen is split into a **left column** (camera + feedback) and a **right column** (controls + info).

#### Live Mode vs Debug Mode

At the top of the camera area there is a segmented control:

| Option | What it does |
|--------|--------------|
| **Live Mode** | Normal operation. Scans **record attendance** to the database and send SMS. |
| **Debug Mode** | Testing mode. Scans **do NOT record anything** to the database. Instead, an inline panel shows you: the **Raw Payload String**, the **Student Name Match**, and a **Validation Status** (Valid / Invalid). |

**Both modes use the exact same camera stream** — toggling does not restart the camera, does not pop up a window, and does not ask for camera permission again. This is intentional (see [Camera permissions](#why-doesnt-the-camera-ask-again)).

**How to test a scan without recording it:**
1. Tap **Debug Mode**.
2. Scan a QR code (or type it in the Manual Entry box).
3. Read the inline result. Nothing was written to the database.

#### Flip Camera (mobile)

On a phone, there is a **Flip Camera** button (the camera icon at the top-right of the video). Tapping it:

- Stops the current camera.
- Switches between the **rear** (`environment`) and **front** (`user`) camera.
- If the stream isn't detected on one camera (e.g. wrong lens), use this to switch.

#### Grant / Retry Camera Access

If the camera fails (permission denied, wrong camera), the video area shows a **"Camera Unavailable"** message with a **Grant / Retry Camera Access** button. Tap it to re-request camera permission and try again.

#### SMS Notifications Toggle

Next to **Manual Entry** there is an **SMS Notifications** switch:

- **ON** — every scan sends a parent SMS (the default).
- **OFF** — attendance is still recorded, but **no SMS is sent** and no `sms_logs` entry is created.

Use this when you want to scan without messaging parents (for example, during a drill or to avoid SMS costs).

#### Manual Entry

If a student's QR code won't scan, use **Manual Entry**:

1. Type all or part of the student's **name** or their **LRN**.
2. Pick the student from the dropdown, or press **Submit**.
3. The scan is processed just like a camera scan.

#### Scan History

The **Scan History** tab shows today's recorded attendance for the current section — time, student, LRN, window type, and status. It refreshes automatically every minute.

> **Note:** History only appears when you're in **Live Mode** and scans are actually being recorded. Debug-mode scans never appear because they're not written to the database.

---

## Common Questions & Troubleshooting

### Why doesn't the camera ask for permission again when I switch tabs?

Browser security treats re-requesting the camera as a new permission prompt. To avoid annoying prompts, the scanner:

- Keeps the camera stream **alive** while you switch between **Live Scanner** and **Scan History** (the tabs hide instead of unmount the video).
- Keeps the scan logic stable when you toggle **Live/Debug** so the camera isn't restarted.

If your browser ever does re-ask, just click **Allow** — and if you pick the wrong camera, use the **Flip Camera** button or the **Grant / Retry** button.

### Why is the Scan History empty?

History is only filled by **Live Mode** scans. If you only scanned in **Debug Mode**, nothing was saved, so history stays empty — that's expected. Also make sure you're viewing the correct **section** on the terminal.

### I scanned but no SMS arrived.

Check:

1. The **SMS Notifications** toggle is **ON**.
2. The student has a **parent phone number** on record (the admin can check/edit this in the roster). If there's no number, the system shows "No parent phone number on record."
3. The **httpsms** API key / device are configured correctly in `.env.local`.

If a scan fails to save (e.g. no internet), it goes into the **offline queue** and a badge in the header shows "X Pending". The system auto-retries every 30 seconds.

### How do I re-open a completed window?

Warning: re-opening a completed window allows more scans under it. The system asks you to **confirm** before re-opening, so you don't accidentally scan into the wrong window.

### The app won't build.

Make sure you have the environment variables set, and that you ran `npm install`. If TypeScript errors appear, check the files named in the error messages — the most common issue is a missing import.

### I want to change the theme.

Use the **Theme Toggle** (sun/moon) in the top-right of the login page. The app supports light/dark themes.

---

## Project State

For a detailed, always-updated log of every feature and change, see **[`project_state.md`](project_state.md)** — it is the "living document" for this project.

---

## License

Private project for RTNHS. See the repository owner for usage terms.