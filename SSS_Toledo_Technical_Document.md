# SSS TOLEDO BRANCH
## Smart Monitoring, Transaction Routing & ARTA CSM Compliance System
### Comprehensive Technical Documentation

---

**Organization:** Social Security System (SSS) — Toledo Branch, Region VII  
**Document Classification:** Internal Technical Architecture & System Reference  
**Version:** 2.0 (Harmonized ARTA CSM & MSS Task Edition)  
**Date:** August 2026  

---

&nbsp;

## I. System Architecture — Local Area Network (LAN-Based)

The system operates **100% locally within the SSS Toledo Branch network (LAN / Local Wi-Fi)**. No external internet connection or cloud dependency is required for daily queuing, counter routing, clerk evaluation, or reporting. All citizen information and branch records remain securely within branch premises.

```
                     BRANCH LOCAL NETWORK (LAN / Local Wi-Fi)
                                    │
              ┌─────────────────────┼──────────────────────┐
              │                     │                      │
    ┌──────────▼──────────┐         │           ┌──────────▼──────────┐
    │   LOCAL SERVER PC   │         │           │    ADMIN PANEL      │
    │   (Brain & Database │◄────────┤           │  (Branch Head /     │
    │    Node.js Engine)  │         │           │   Admin Workstation)│
    └──────────▲──────────┘         │           └─────────────────────┘
               │                    │
    ┌──────────┴────────────────────┴─────────────────────┐
    │                                                     │
 ┌──▼────────────┐   ┌─────────────────┐   ┌─────────────▼──────┐   ┌────────────────┐
 │  E-LOGBOOK    │   │ COUNTER         │   │ PACD / E-CENTER    │   │ CITIZEN RATING │
 │  KIOSK        │   │ DASHBOARDS      │   │ DASHBOARDS         │   │ TABLETS (/rate)│
 │  (Tablet/PC)  │   │ (Counters 1–4   │   │ (Dedicated PCs)    │   │ (Desk Mounted) │
 └───────────────┘   │  + Side Desk)   │   └────────────────────┘   └────────────────┘
                     └─────────────────┘
```

### Key Architectural Principles:
1. **Zero Client Installation:** All workstations, kiosks, and rating tablets access the system through modern web browsers (Chrome, Edge, Safari, Firefox). No client-side software installation is needed.
2. **Dedicated Local Server:** Runs on any designated Windows branch PC with Node.js.
3. **Real-Time WebSocket Synchronization:** Sub-second bi-directional state updates powered by Socket.io rooms.
4. **Embedded Zero-Config Database:** Uses native Node.js SQLite with Write-Ahead Logging (WAL) for high concurrency and zero-maintenance resilience.

---

&nbsp;

## II. Technology Stack

### A. Frontend Layer (Browser-Based Client)
| Technology | Role in System |
|---|---|
| **HTML5 / Vanilla CSS3** | Custom responsive design system featuring SSS corporate navy/blue/gold palettes, glassmorphism modals, and crisp inline SVG iconography (zero external CDN or emoji dependency). |
| **Vanilla JavaScript (ES6+)** | Handles client UI state, validation, modal interactions, and WebSocket subscriptions. |
| **Socket.io Client** | Sub-second real-time event synchronization across counter pools, kiosks, desk rating tablets, and the admin monitor. |
| **Chart.js** | Renders real-time visual analytics for hourly foot traffic, transaction distributions, and CSAT performance. |

### B. Backend Layer (Server PC Engine)
| Technology | Role in System |
|---|---|
| **Node.js (v22+)** | High-performance, event-driven runtime environment running as a lightweight service. |
| **Express.js (v4.18+)** | RESTful API engine managing check-ins, counter queues, appointments, task delegations, and exports. |
| **Socket.io (v4.7+)** | Event routing server organizing connected clients into isolated communication rooms (`counter-pool`, `pacd`, `ecenter`, `portal-pool`, `admin`, `rate-{counter}`, `clerk-{id}`). |
| **ExcelJS (v4.4+)** | Advanced spreadsheet generator creating official multi-tab SSS service logs, ARTA CSM compliance sheets, and parsing daily appointment rosters. |

### C. Database Layer (Embedded Storage)
| Technology | Role in System |
|---|---|
| **Native Node.js SQLite (`node:sqlite` / `DatabaseSync`)** | Single-file database (`database/sss_toledo.db`) operating with **Write-Ahead Logging (WAL)** enabled for fast concurrent read/write throughput and ACID transaction safety. |

---

&nbsp;

## III. Database Schema & Data Dictionaries

### 1. Table: `members`
Stores all citizens registered through the E-Logbook Kiosk or counter walk-ups.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique member transaction ID |
| `queue_number` | TEXT | NULLABLE | Paper ticket number (e.g., `005`, `2031`, `4012`) |
| `name` | TEXT | NOT NULL | Member's full name |
| `sss_number` | TEXT | NULLABLE | SSS / CRN Number (10 digits / CRN format) |
| `transaction_type` | TEXT | NOT NULL | Primary service intent selected at kiosk |
| `entry_type` | TEXT | NOT NULL | `walk-in`, `direct-appointment`, `portal-appointment` |
| `routed_to` | TEXT | NOT NULL | Initial destination room (`counter-pool`, `pacd`, `ecenter`, `portal-pool`) |
| `status` | TEXT | DEFAULT 'waiting' | `waiting`, `serving`, `finished`, `transferred`, `paused` |
| `check_in_time` | DATETIME | DEFAULT CURRENT_TIMESTAMP | Exact arrival timestamp |
| `customer_type` | TEXT | NULLABLE | ARTA category (Employed, Voluntary, OFW, Kasambahay, etc.) |
| `sex` | TEXT | NULLABLE | `Male`, `Female` |
| `age` | INTEGER | NULLABLE | Citizen age |
| `dpa_consent` | TEXT | DEFAULT 'agree' | Data Privacy Act compliance flag |

### 2. Table: `transactions`
Lifecycle and resolution metrics for each assisted member.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Unique transaction record ID |
| `member_id` | INTEGER | FOREIGN KEY (`members.id`) | Linked citizen check-in |
| `clerk_id` | INTEGER | FOREIGN KEY (`clerks.id`) | Assigned officer ID |
| `clerk_name` | TEXT | NOT NULL | Name of handling officer |
| `counter` | TEXT | NOT NULL | Station name (`Counter 1` – `Counter 4`, `Side Counter`, `PACD`, `E-Center`) |
| `service_start_time`| DATETIME| DEFAULT CURRENT_TIMESTAMP | Time member was called / service began |
| `service_end_time` | DATETIME | NULLABLE | Time transaction was concluded |
| `wait_duration_minutes` | REAL | NULLABLE | Calculated: `service_start_time - check_in_time` |
| `duration_minutes` | REAL | NULLABLE | Calculated: `service_end_time - service_start_time` |
| `outcome` | TEXT | NULLABLE | `finished` (Accepted), `rejected`, `for-verification`, `for-appointment` |
| `confirmed_transaction_type` | TEXT | NULLABLE | Final transaction code verified by clerk |
| `rating` | TEXT | NULLABLE | `5` (Very Satisfied), `4` (Satisfied), `3` (Neutral), `1` (Unsatisfied) |
| `nps_score` | INTEGER | NULLABLE | Net Promoter Score scale (1–10) |
| `feedback_category` | TEXT | NULLABLE | `positive`, `suggestions`, `none` |
| `remarks` | TEXT | NULLABLE | Bottleneck tags or custom service notes |

### 3. Table: `appointments`
Daily appointment rosters imported from the SSS Online Booking portal.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Appointment identifier |
| `name` | TEXT | NOT NULL | Citizen name |
| `phone` | TEXT | NULLABLE | Contact telephone |
| `email` | TEXT | NULLABLE | Email address |
| `appointment_time`| TEXT | NOT NULL | Scheduled slot (e.g., `09:30 AM`) |
| `counter` | TEXT | NULLABLE | Target desk |
| `clerk_name` | TEXT | NULLABLE | Assigned counter personnel |
| `arrival_status` | TEXT | DEFAULT 'not-arrived' | `not-arrived`, `in-lobby`, `done`, `no-show` |
| `member_id` | INTEGER | NULLABLE | Linked member record upon arrival |

### 4. Table: `clerks`
Staff and administrator user accounts.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Account ID |
| `name` | TEXT | NOT NULL | Employee full name |
| `counter` | TEXT | NOT NULL | Default station role (`Branch Staff` / `Admin`) |
| `pin` | TEXT | NOT NULL | 4-digit security PIN |
| `is_active` | INTEGER | DEFAULT 1 | 1 = Active, 0 = Inactive |

### 5. Table: `tasks`
Branch MSS internal assignments, task delegation, and accomplishments tracking.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT | Task ID |
| `title` | TEXT | NOT NULL | Assignment title |
| `description` | TEXT | NULLABLE | Detailed instructions or batch references |
| `category` | TEXT | NOT NULL | `E-4 & Member Records`, `Claims & Benefits`, `Loans & Contributions`, `General Admin` |
| `assignee_id` | INTEGER | FOREIGN KEY (`clerks.id`) | Assigned staff member |
| `assigned_by` | TEXT | NOT NULL | Manager / Assigning officer |
| `priority` | TEXT | DEFAULT 'normal' | `low`, `normal`, `high`, `urgent` |
| `status` | TEXT | DEFAULT 'pending' | `pending`, `ongoing`, `completed`, `overdue` |
| `due_date` | DATETIME | NOT NULL | Target completion deadline |
| `completed_at` | DATETIME | NULLABLE | Timestamp of accomplishment |
| `accomplishment_notes` | TEXT | NULLABLE | Resolution remarks entered by staff |

---

&nbsp;

## IV. Subsystems & Operational Workflows

### 1. E-Logbook Kiosk (`/kiosk`)
- **Self-Service Check-In:** Touchscreen entry point with 3 check-in paths:
  1. **Walk-In:** Paper Queue Ticket Number, Full Name, **SSS / CRN Number (Optional)**, Transaction Purpose, Customer Type (ARTA Demographics), Sex, and Age.
  2. **Branch Direct Appointment (BAS):** Instant verification against imported daily rosters by Name or Phone.
  3. **My.SSS Portal Appointment:** Self-check-in for scheduled online citizens.
- **R.A. 10173 Data Privacy Notice:** Mandatory certification & agreement gate ("I Agree" unlocks form; "I Disagree" blocks access and routes to PACD).
- **Automated Queue Series Routing:**
  - `000's` (001–099) → PACD (Public Assistance and Complaints Desk)
  - `2000's & 3000's` → Main Service Counters (Counters 1–4 & Side Desk)
  - `4000's` → E-Center (Electronic Web Online Assistance)
- **Duplicate Protection:** Prevents duplicate queue tickets on the same calendar day.

### 2. Counter Workstations (`/clerk`, `/pacd`, `/ecenter`)
- **Real-Time Priority Queue:** Renders live queues ordered by ticket number and arrival time.
- **Appointment Indicators:** Highlights scheduled citizens with arrival status badges (`IN LOBBY`, `ARRIVED`).
- **Interactive Lifecycle Controls:** Call Member → Begin Service → Confirm Transaction Type → Select Resolution (*Finished / Accepted*, *Rejected*, *For Verification*, *For Appointment*).
- **Re-Route & Department Referrals:** Enables one-click counter re-routing (e.g., ticket misclassification by security) or post-transaction referral to E-Center/PACD.
- **Active Counter Pairing with Citizen Rating Tablets (`/rate`):** Concluding a transaction sends an automated signal to the counter's rating tablet, prompting the member for immediate feedback.

### 3. Citizen Rating Tablet (`/rate`)
- **Standalone Desk Display:** Positioned on counter glass facing the member.
- **Harmonized ARTA CSM Evaluation:**
  - **Question 1 (NPS 1–10):** *Gaano ka-posible na irekomenda mo ang SSS Toledo?* (0–10 scale: Promoters 9–10, Passives 7–8, Detractors 1–6).
  - **Question 2 (5-Point CSAT):** Rating badges (*Very Satisfied*, *Satisfied*, *Neutral*, *Unsatisfied*).
  - **Question 3 (Sentiment & Root Causes):** Positive Feedback vs. Suggestions (e.g., *Dugay ang Sistema*, *Taas ang Linya*, *Libog Requirements*, *Dali ug Maayo*).
- **Auto-Standby Reset:** Automatically returns to welcoming standby screen after 5 seconds.

### 4. Branch Operations Command & Admin Panel (`/admin`)
- **Live Counter Matrix:** Real-time visual cards of every desk showing current online status, active serving member, and queue length.
- **Citizen's Charter SLA Watchdog:** Automated alert triggers for members waiting >15.0 minutes.
- **ARTA CSM Analytics Hub:**
  - Live Net Promoter Score (NPS) calculation: `% Promoters - % Detractors`.
  - Customer demographic distribution (Employed, Voluntary, Pensioners, OFW, etc.).
  - Sex and Age group breakdown.
  - Root-cause bottleneck frequency monitor.
  - Quarterly audit selector (Q1, Q2, Q3, Q4, Custom range).
  - **Official A4 Government Report Print Preview:** Printable ARTA CSM summary sheet with compliance ratings and official signature sections.
- **Master Audit Log & SSS Service Matrix:**
  - Instant toggle between **Detailed Transaction Ledger** and **SSS Service Matrix (A / R / Total)** categorized by transaction type and clerk.
- **MSS Task Management:** Full delegation lifecycle with overdue detection, priority filtering, and accomplishment logs.
- **Disaster Recovery & Database Backup:** Single-click encrypted download of `sss_toledo.db`.

---

&nbsp;

## V. Official Export & Report Engine

All export endpoints generate standard government-compliant `.xlsx` and printable formats:

1. **Daily Master SSS Service Log (`/api/reports/export/excel?all=1`):** Complete auditable record of all branch transactions.
2. **Official SSS Service Matrix (`/api/transactions/matrix/export/excel`):** Accepted (A), Rejected (R), and Total counts per clerk and service category.
3. **Harmonized ARTA CSM Report (`/api/reports/export/arta-csm/excel`):** NPS scorecard, demographic profiles, and CSAT breakdown formatted for CSC / ARTA submission.
4. **MSS Tasks Accomplishment Report (`/api/tasks/export/excel`):** Staff task execution record with completion timestamps and resolution notes.
5. **Database Disaster Snapshot (`/api/reports/backup/db`):** Complete raw SQLite backup for off-site disaster recovery.

---

&nbsp;

## VI. Hardware & Local Deployment Specifications

| Component | Minimum Specification | Recommended |
|---|---|---|
| **Server Host PC** | Dual-core CPU, 4 GB RAM, 64 GB Storage, Windows 10/11 | Dedicated office PC connected to branch UPS |
| **Kiosk Device** | 10"–15" Touchscreen Tablet / All-in-One PC with modern web browser | Mounted near entrance with kiosk browser lock |
| **Counter Terminals** | Any existing Windows PC with Chrome / Edge | Existing branch clerk workstations |
| **Rating Tablets** | 7"–10" Android / iOS / Windows tablet running `/rate` | Counter desk mounted facing citizen |
| **Network Infrastructure** | 100/1000 Mbps Ethernet Switch or 2.4/5GHz Branch Wi-Fi | Local LAN router (No internet required) |

---

*SSS Toledo Branch — Smart Monitoring, Routing & ARTA CSM System Documentation | August 2026*
