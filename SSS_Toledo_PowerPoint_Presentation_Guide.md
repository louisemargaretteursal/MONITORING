# SOCIAL SECURITY SYSTEM — TOLEDO BRANCH
## Smart Frontline Monitoring, Transaction Routing & ARTA CSM Compliance System
### Official PowerPoint Presentation Slide Deck & Speaker Script Guide

---

**Project Title:** SSS Toledo Smart Frontline Monitoring, Routing & ARTA CSM System  
**Presentation Target:** SSS Toledo Branch Head, MSS Section Supervisors, & Regional Evaluation Panel  
**Agency Context:** Social Security System (SSS) — Toledo Branch, Central Visayas Division, Region VII  
**Governing Mandates:** R.A. 11032 (Ease of Doing Business & Citizen's Charter), R.A. 11199 (Social Security Act of 2018), R.A. 10173 (Data Privacy Act)  
**Date:** August 2026  

---

# 📋 AGENDA & PRESENTATION TASKING OVERVIEW

| Item # | Agenda Item | Presenter Role | Institutional SSS Focus |
|:---:|:---|:---:|:---|
| **01** | **Case Situation & Introduction of Group Members** | **Coach 1** | Toledo Branch demographic profile, coverage area (Western Cebu), daily foot traffic, and project innovation team |
| **02** | **Presentation of the Problem** | **Coach 2** | Frontline bottlenecks, manual physical logbooks, paper ticket mismatch, BAS appointment invisibility, and manual Daily Service Matrix tallies |
| **03** | **Project Proposal Overview** | **OJT 1** | Proposed Localized Digital Monitoring Platform, comparison with failed cloud/generic systems, and non-intrusive operational design |
| **04** | **Project Process & Methodology** | **OJT 2** | End-to-end routing flow: E-Logbook Kiosk ➔ Queue Series Broadcast (000's, 2000's & 3000's, 4000's) ➔ MSR Workstations ➔ Desk Rating Tablet (`/rate`) ➔ Branch Head Executive Admin Panel |
| **05** | **Project Benefits & Requirements** | **OJT 3** | Citizen's Charter SLA compliance (< 15 mins wait), 100% ARTA CSM capture, automated SSS Daily Service Matrix (A / R / Total), and zero capital expense (LAN-based) |
| **06** | **Recommendations & Conclusion** | **Coach 2** | Actionable branch deployment roadmap, daily SQLite snapshot disaster recovery, and executive call to action |

---

&nbsp;

---

# 📌 SECTION 01: Case Situation & Introduction of Group Members
**Presenter:** Coach 1 (Project Sponsor / Team Lead)  
**Target Duration:** 2 – 3 Minutes  

---

### 🖥️ Slide 1.1: Title Slide (Official SSS Cover)
- **Slide Title:** SSS Toledo Branch: Smart Frontline Monitoring, Transaction Routing & ARTA CSM Compliance System
- **Subtitle:** Modernizing Frontline Service Delivery, Citizen's Charter SLA Compliance, and Harmonized CSM Analytics
- **Presented to:** SSS Toledo Branch Management & Evaluation Committee
- **Presented by:** SSS Toledo Branch Technical Innovation Team
- **Date & Location:** August 2026 | Social Security System — Toledo Branch, Region VII

> 🗣️ **Speaker Script (Coach 1):**
> *"Good morning to our esteemed Branch Head, Member Services Section (MSS) Supervisors, Administrative Section Heads, colleagues, and members of the panel. Today, we are proud to present our innovation project: the **SSS Toledo Smart Frontline Monitoring, Transaction Routing, and ARTA CSM Compliance System**. This platform was engineered specifically for SSS Toledo to modernize our frontline counter operations, ensure strict compliance with the SSS Citizen's Charter, and eliminate hours of manual reporting."*

---

### 🖥️ Slide 1.2: Toledo Branch Frontline Context
- **Header:** SSS Toledo Branch Operational Profile & Service Coverage
- **Key Bullet Points:**
  - **Strategic Western Cebu Frontline Hub:** Caters to members across Toledo City, Balamban, Pinamungajan, Asturias, Aloguinsan, and neighboring industrial corridors (mining, shipbuilding, agriculture, MSMEs).
  - **High-Volume Multi-Sector Stakeholders:** Daily frontline influx of Employed Members, Self-Employed / Voluntary Members, Non-Working Spouses, OFWs, Kasambahays, Senior Citizen Pensioners, and Employer Representatives.
  - **Core Frontline Divisions:**
    - **PACD (Public Assistance and Complaints Desk):** Inquiries, priority assistance (Seniors, PWD, Pregnant), initial screening.
    - **Main Counter Processing (Counters 1–4 & Side Desk):** Benefit Claims (Retirement, Sickness, Maternity, Disability, Funeral), Member Data Amendments (Form E-4), Salary/Calamity Loans, and Contribution Inquiries.
    - **E-Center (Electronic Center):** Guided web portal access for My.SSS registrations, Payment Reference Number (PRN) generation, benefit applications, and online filing.
  - **Compliance Directives:** Governed by **R.A. 11032 (Ease of Doing Business Act)**, **R.A. 11199 (Social Security Act of 2018)**, and the **SSS Citizen's Charter** establishing service turnaround time benchmarks.

---

### 🖥️ Slide 1.3: Introduction of Group Members & Tasking Matrix
- **Header:** Project Innovation Team & Presenter Tasking
- **Presenter Roles:**
  - **Coach 1:** Operational Case Situation & Frontline Context
  - **Coach 2:** Frontline Bottleneck Analysis & Strategic Recommendations
  - **OJT 1:** Project Proposal Overview & Technological Justification
  - **OJT 2:** System Process Architecture, Series Routing & ARTA CSM Workflow
  - **OJT 3:** Operational Outcomes, SSS Service Matrix, & Zero-Cost LAN Infrastructure
- **Visual Suggestion:** SSS Toledo organizational chart showing Section assignments and innovation roles.

> 🗣️ **Speaker Script (Coach 1):**
> *"Our branch handles hundreds of member transactions every working day. From complex death and disability claims to urgent E-4 data changes, our frontline staff strive to deliver fast, compassionate service. However, physical paper logbooks and manual reporting have long created an operational bottleneck. Let me now turn over the presentation to Coach 2 to present the specific frontline problems we set out to resolve."*

---

&nbsp;

---

# 📌 SECTION 02: Presentation of the Problem
**Presenter:** Coach 2 (Frontline Operations Specialist)  
**Target Duration:** 3 – 4 Minutes  

---

### 🖥️ Slide 2.1: The Frontline Operational Problem
- **Slide Title:** Key Challenges in Traditional SSS Frontline Operations
- **Subtitle:** Identified Friction Points in Member Servicing & Reporting
- **Major Bottlenecks:**
  1. **Information Redundancy at Counter Windows:**
     - Members manually write their SS Number, Name, and Intent in paper logbooks at the entrance.
     - Upon being called to Counter 1–4, members must **verbally repeat** their details to the Member Service Representative (MSR), adding 2–3 minutes of redundant interview time per transaction.
  2. **Invisibility of Appointed Members & Zero Advance Record for Portal Bookings:**
     - For **Branch Appointment System (BAS)** bookings, counter MSRs have no real-time way of knowing who among the scheduled members is already physically waiting in the lobby versus who has not arrived.
     - For **My.SSS Portal Appointments**, the branch has **no advance roster or record at all**. Staff must manually inspect physical paper stubs or smartphone booking screenshots presented by members, leaving clerks completely blind to arriving portal members until they physically reach a counter.
  3. **End-of-Day Overtime for Daily Service Matrix Tallies:**
     - Compiling the official **SSS Daily Service Matrix** (**Accepted [A]**, **Rejected [R]**, and **Total Transacted**) across all benefit types and counters requires manual tick-mark counting from physical paper stubs, taking 1 to 2 hours of supervisor overtime every evening.
  4. **Low Completion & High Burden of Paper ARTA CSM Surveys:**
     - Paper-based survey slips frequently suffer from low response rates, damaged forms, or incomplete answers, making quarterly ARTA/CSC compliance reporting difficult to consolidate.
  5. **Uncentralized MSS Backlog Task Tracking:**
     - Off-counter administrative tasks (such as manual E-4 backlogs, employer adjustments, batch death claim verifications) lacked a unified digital tracking ledger with automated deadline monitoring.

---

### 🖥️ Slide 2.2: Operational Comparison (Traditional Manual vs. Automated System)

| Operational Workflow | Traditional Manual Practice | SSS Toledo Smart System Impact |
|---|---|---|
| **Member Entry & Logbook** | Physical pen-and-paper logbook at entrance | **Self-Service Kiosk (`/kiosk`)** with instant DPA consent |
| **Counter Data Pre-Loading** | 100% verbal questioning at counter | **Pre-Loaded Profile** transmitted to clerk before member sits |
| **BAS & My.SSS Portal Appointments** | **No lobby arrival visibility; zero advance record for portal appointments** *(staff manually check phone/paper proof)* | **Kiosk self-check-in & live "In-Lobby" alerts** *(turns invisible waiting into transparent queue streams)* |
| **SSS Daily Service Matrix** | Manual paper tick-tally counting (1–2 hrs) | **Automated Real-Time Matrix (A / R / Total)** exportable to Excel |
| **Harmonized ARTA CSM** | Paper survey drop-boxes (Low response) | **Desk Rating Tablet (`/rate`)** capturing NPS (1–10) & 5★ CSAT |
| **MSS Assignment Tracking** | Sticky notes and verbal delegation | **Digital MSS Task Ledger** with automated overdue detection |

> 🗣️ **Speaker Script (Coach 2):**
> *"As shown in this operational comparison, our frontline Member Services Section faces major blind spots every day. In particular, for appointment bookings, clerks cannot see who has actually arrived in the lobby. For My.SSS portal appointments, our branch doesn't even have a prior masterlist—we only know a member has an appointment when they show a paper printout or a phone screenshot at the counter. With our new system, appointed members simply check in at the kiosk, immediately alerting the assigned MSR or portal queue that they are waiting in the lobby. Here is OJT 1 to introduce our proposed solution."*

---

&nbsp;

---

# 📌 SECTION 03: Project Proposal Overview
**Presenter:** OJT 1 (Technical & Systems Analyst)  
**Target Duration:** 3 – 4 Minutes  

---

### 🖥️ Slide 3.1: The Proposed Solution
- **Slide Title:** SSS Toledo Smart Frontline Monitoring & Transaction Routing System
- **Subtitle:** An Autonomous, LAN-Based Operations Command for SSS Toledo Branch
- **Core Pillars of the Proposed Platform:**
  1. **Entrance E-Logbook Kiosk (`/kiosk`):** 15-second self-service registration capturing Queue Ticket Number, Full Name, **SSS / CRN Number (Optional)**, Service Category, and ARTA Demographics with full R.A. 10173 Data Privacy consent.
  2. **Smart Prefix Auto-Routing Engine:** Instantly routes tickets into dedicated WebSocket streams:
     - **`000's`** ➔ PACD (Public Assistance and Complaints Desk)
     - **`2000's & 3000's`** ➔ Main Service Counters 1–4 & Side Desk (Shared Pool)
     - **`4000's`** ➔ E-Center Electronic Web Services
  3. **Desk-Mounted Citizen Rating Tablet (`/rate`):** Automated 3-step ARTA CSM evaluation (NPS 1–10, 5-point CSAT, and root-cause bottleneck tags) activated upon counter transaction conclusion.
  4. **Branch Operations Command (`/admin`):** Real-time desk monitoring, SLA watchdog alerts (> 15 mins), MSS task delegations, and one-click export of the official SSS Service Matrix and ARTA CSM reports.

---

### 🖥️ Slide 3.2: Review of Previous Attempts & Technological Rationale
- **Header:** Why External Cloud or Generic Systems Failed vs. Why Our System Succeeds
- **Key Architectural Decisions:**
  - **1. Zero Cloud Dependency (100% Local Area Network):**
    - *Previous Limitation:* Cloud systems depend on reliable internet, involve high monthly fees, and pose external data residency concerns.
    - *Our Innovation:* Operates **entirely inside the branch local network (LAN)**. If the internet goes down, queuing and counter routing continue uninterrupted.
  - **2. No Expensive Hardware Replacement:**
    - *Previous Limitation:* Turnkey queue management systems require replacing existing physical ticket dispensers and purchasing proprietary terminals.
    - *Our Innovation:* Works as a **non-intrusive "digital shadow"** linking existing physical tickets to standard browser windows on existing branch PCs.
  - **3. Native Embedded Database (SQLite WAL Mode):**
    - High-throughput, zero-maintenance database residing directly on the branch server PC with single-file backup (`sss_toledo.db`).

> 🗣️ **Speaker Script (OJT 1):**
> *"Thank you, Coach 2. The foundation of our proposed solution is practical feasibility. SSS Toledo does not need to procure multimillion-peso external queuing hardware or cloud subscriptions. By leveraging open web standards, native Node.js SQLite storage, and local WebSocket broadcasting, we created a lightweight, lightning-fast operational platform that runs locally on our existing branch PCs. Now, OJT 2 will detail the exact process and technical methodology."*

---

&nbsp;

---

# 📌 SECTION 04: Project Process & Methodology
**Presenter:** OJT 2 (Process & Development Specialist)  
**Target Duration:** 4 – 5 Minutes  

---

### 🖥️ Slide 4.1: End-to-End Frontline Process Architecture
- **Slide Title:** Step-by-Step Member Lifecycle Workflow
- **Visual Architecture Diagram:**

```
 [ STEP 1: MEMBER ENTRY ]      [ STEP 2: PREFIX AUTO-ROUTING ]    [ STEP 3: MSR COUNTER SERVICE ]    [ STEP 4: CITIZEN RATING ]
   E-Logbook Kiosk (/kiosk)       Socket.io Room Distribution      MSR Dashboard (/clerk)             Desk Tablet (/rate)
 ┌─────────────────────────┐    ┌──────────────────────────────┐ ┌────────────────────────────────┐ ┌─────────────────────────┐
 │ • DPA Consent Gating    │───►│ • 000's       ► PACD Desk    │─► • Pre-Loaded Member Details    │─► • NPS Rating (1–10)     │
 │ • Paper Queue Ticket #  │    │ • 2000s/3000s ► Counters 1-4 │ │ • Timed Service Duration       │ │ • 5-Star CSAT Evaluation│
 │ • SSS / CRN Number      │    │ • 4000's      ► E-Center     │ │ • Outcome: Accepted (A) /      │ │ • Bottleneck Tag Chips  │
 │ • ARTA Demographics     │    │ • BAS Appts   ► Assigned MSR │ │            Rejected (R)        │ │ • Auto-Standby (5 secs) │
 └─────────────────────────┘    └──────────────────────────────┘ └────────────────────────────────┘ └─────────────────────────┘
                                                                                 │
                                                                                 ▼
                                                                     [ STEP 5: EXECUTIVE COMMAND ]
                                                                      Branch Head Admin (/admin)
                                                                     ┌────────────────────────────┐
                                                                     │ • Live Counter Status Grid │
                                                                     │ • SLA Watchdog (>15m Alert)│
                                                                     │ • SSS Service Matrix (A/R) │
                                                                     │ • ARTA CSM Printable Sheet │
                                                                     │ • MSS Task & Backup Ledger │
                                                                     └────────────────────────────┘
```

---

### 🖥️ Slide 4.2: Specialized Subsystem Modules

1. **E-Logbook Kiosk (`/kiosk`):**
   - Touchscreen check-in with bilingual prompts (English / Cebuano).
   - Validates official SSS Toledo ticket ranges (**`000's`**, **`2000's & 3000's`**, and **`4000's`**), instantly displaying a helpful guidance dialog for mis-typed tickets.
   - Captures demographic classifications: Employed, Voluntary, Self-Employed, Pensioner, OFW, Kasambahay, Employer, Sex, and Age.
2. **Member Service Representative (MSR) Workstations (`/clerk`, `/pacd`, `/ecenter`):**
   - Single-click claim from queue; automated transaction duration timer.
   - Official outcome logging: **Finished / Accepted (A)**, **Rejected (R)**, **For Verification**, **For Appointment**.
   - Instant re-routing for ticket corrections and department referral slips.
3. **Desk-Mounted Citizen Rating Tablet (`/rate`):**
   - Paired wirelessly with each counter window; prompts the member upon transaction completion.
   - Evaluates Net Promoter Score (NPS 1–10) and CSAT quality, capturing root causes (*Dugay ang Sistema*, *Taas ang Linya*, *Libog Requirements*, *Dali ug Maayo*).
4. **Operations Command & Executive Analytics (`/admin`):**
   - Real-time desk monitoring matrix and Citizen's Charter SLA alerts.
   - SSS Daily Service Matrix toggle with instant Excel workbook export.
   - MSS internal assignment tracking and one-click database snapshot archiving (`sss_toledo.db`).

> 🗣️ **Speaker Script (OJT 2):**
> *"As illustrated in our process flow, every touchpoint is connected in real-time. When a citizen enters their paper ticket at the kiosk, Socket.io broadcasts their arrival in under one second. Counter MSRs see the member's name and SS Number before they sit down, cutting out verbal questioning. Concluding a transaction instantly triggers the desk tablet for ARTA feedback, while consolidating the numbers into the Branch Manager's Service Matrix. Next, OJT 3 will present the tangible benefits and infrastructure setup."*

---

&nbsp;

---

# 📌 SECTION 05: Project Benefits & Requirements
**Presenter:** OJT 3 (Operational Performance & IT Specialist)  
**Target Duration:** 3 – 4 Minutes  

---

### 🖥️ Slide 5.1: Quantifiable Operational Benefits

| Frontline Benefit Area | Target Outcome / Impact | Performance Indicator |
|---|---|---|
| **1. Counter Service Velocity** | Pre-loaded SS numbers and names eliminate verbal repetition at desks. | **15–20% faster** start-of-transaction speed |
| **2. Citizen's Charter SLA Compliance** | Automated watchdog flags members waiting > 15.0 minutes in lobby. | **100% adherence** to R.A. 11032 standards |
| **3. Administrative Time Savings** | Automated SSS Service Matrix eliminates manual paper ticket counting. | **1 to 2 hours saved daily** per supervisor |
| **4. ARTA CSM Survey Compliance** | Desk tablets capture citizen feedback immediately post-service. | **95%+ survey completion rate** with zero paper cost |
| **5. Appointment Lobby Transparency** | Kiosk check-in alerts MSRs and brings full visibility to portal arrivals. | **Zero unmonitored portal arrivals** & no scheduling collisions |
| **6. MSS Task Accountability** | Centralized delegation ledger monitors backlog deadlines. | **100% visibility** on E-4/Claims processing tasks |

---

### 🖥️ Slide 5.2: Resource & Infrastructure Matrix (Zero Capital Expense)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                          INFRASTRUCTURE & RESOURCE SPECS                               │
├──────────────────────────┬──────────────────────────────────────────┬──────────────────┤
│ COMPONENT                │ SPECIFICATION REQUIREMENT                │ PROCUREMENT COST │
├──────────────────────────┼──────────────────────────────────────────┼──────────────────┤
│ 1. Server Host PC        │ Existing Branch Windows PC (Always-On)   │ ₱0 (Existing)    │
│ 2. Local Network (LAN)   │ Existing Branch Router / Local Wi-Fi AP  │ ₱0 (Existing)    │
│ 3. MSR Workstations      │ Existing Counter 1–4, PACD, E-Center PCs │ ₱0 (Existing)    │
│ 4. Entrance Kiosk        │ 1x Touchscreen Tablet or PC at Entrance  │ ₱0 (Existing)    │
│ 5. Citizen Rating Tablet │ 7"–10" Tablet mounted at active counters │ Minimal / Branch │
│ 6. UPS (Power Backup)    │ Standard Battery Backup for Server PC    │ Optional (₱2.5k) │
├──────────────────────────┴──────────────────────────────────────────┴──────────────────┤
│ TOTAL ESTIMATED CAPITAL EXPENDITURE: ₱0.00 (Zero New Hardware Procurement Required)   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Data Privacy & Security Guarantee:** Built in compliance with **R.A. 10173 (Data Privacy Act of 2012)**. All member records, ratings, and logs remain strictly within the physical custody of SSS Toledo on local branch storage.

> 🗣️ **Speaker Script (OJT 3):**
> *"The defining feature of this project is its outstanding return on investment: zero software license fees, zero cloud subscriptions, and zero new server purchases required. By leveraging our branch's existing LAN network and desk PCs, SSS Toledo immediately gains automated SSS Service Matrix reports, full ARTA CSM compliance, and faster frontline transactions. Let me now return the podium to Coach 2 for our recommendations and closing summary."*

---

&nbsp;

---

# 📌 SECTION 06: Recommendations & Conclusion
**Presenter:** Coach 2 (Frontline Operations Specialist)  
**Target Duration:** 2 – 3 Minutes  

---

### 🖥️ Slide 6.1: Strategic Recommendations for Branch Rollout
- **Slide Title:** Actionable Implementation Plan for SSS Toledo Branch
- **Key Implementation Steps:**
  1. **Formalize Branch Pilot Operations:**
     - Configure browser shortcuts for MSR workstations (`/clerk`, `/pacd`, `/ecenter`) and the Branch Head Admin console (`/admin`).
  2. **Deploy Entrance Kiosk & Desk Rating Tablets:**
     - Set up the entrance kiosk on a touchscreen tablet running in dedicated kiosk mode.
     - Mount the Citizen Rating Tablet (`/rate`) at active processing counters.
  3. **Adopt Automated SSS Service Matrix & ARTA Reporting:**
     - Transition from manual tick-mark tallying to one-click Excel service matrix exports (`/api/transactions/matrix/export/excel`) and printable ARTA CSM scorecards.
  4. **Institute Daily Database Snapshot Backups:**
     - Execute the 1-click database backup (`/api/reports/backup/db`) every day at 5:00 PM to save `sss_toledo.db` onto an external branch flash drive.
  5. **Incorporate MSS Task Tracking in Weekly Meetings:**
     - Utilize the MSS Assignment module during weekly section reviews to monitor batch claims, E-4 backlogs, and deadline accomplishments.

---

### 🖥️ Slide 6.2: Conclusion & Summary
- **Slide Title:** Delivering Modern, Transparent & Compassionate SSS Service
- **Core Summary Takeaways:**
  - **Faster Service Delivery:** Reduces start-of-transaction counter time by pre-loading member details.
  - **100% ARTA CSM Compliance:** Replaces paper surveys with automated, digital citizen evaluations.
  - **Staff Empowerment:** Reclaims 1–2 hours of daily supervisor overtime by automating the SSS Service Matrix.
  - **Secure & Cost-Free:** 100% LAN-based, full offline resilience, and zero cloud subscription overhead.

---

### 🖥️ Slide 6.3: Q&A / Closing Slide
- **Header:** Daghang Salamat ug Maayong Adlaw! / Maraming Salamat po!
- **Call to Action:** *"We are now ready for your questions, feedback, and guidance."*
- **Contact Details:** SSS Toledo Branch Technical Innovation Team • Region VII

> 🗣️ **Speaker Script (Coach 2):**
> *"In closing, the SSS Toledo Smart Frontline Monitoring System represents practical innovation at its best. It honors our members' time, empowers our counter personnel, and delivers accurate, auditable data for branch management—all without spending a single peso on external cloud services. We thank our Branch Leadership and panel for your support. We are now open for your questions and guidance. Daghang salamat po!"*

---

&nbsp;

---

# 💡 LIVE DEMONSTRATION WORKFLOW FOR PANEL PRESENTATION

To deliver maximum impact during Slide 4.2 (OJT 2's Methodology presentation), follow this **2-minute live demo sequence**:

1. **Step A (Kiosk Check-In):** Open `/kiosk`. Enter a sample ticket (e.g., `2031`), Name (*Juan dela Cruz*), SS Number, select *Retirement Benefit*, and click **Confirm & Check In**.
2. **Step B (Clerk Real-Time Queue):** Switch to `/clerk` (Counter 1). Show that Ticket `2031` appeared instantly without browser refresh.
3. **Step C (Counter Service & Rating):** Click **Claim Member**, select Outcome as **Finished / Accepted (A)**, and conclude. Show that the paired `/rate` tablet screen immediately activates with the 1–10 NPS and CSAT rating prompt.
4. **Step D (Admin Service Matrix):** Open `/admin`. Show that Counter 1's tally immediately increased on the **SSS Service Matrix (A / R / Total)** and the ARTA CSM analytics scorecard updated live.
