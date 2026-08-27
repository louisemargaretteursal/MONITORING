# SSS TOLEDO BRANCH
## Smart Monitoring, Transaction Routing & ARTA CSM Compliance System
### Official Project Proposal & Comprehensive System Specifications

---

**Project Title:** SSS Toledo Smart Monitoring, Transaction Routing & ARTA CSM System  
**Document Type:** Official Project Proposal & Operational Specifications  
**Target Organization:** Social Security System (SSS) — Toledo Branch, Region VII  
**Prepared By:** SSS Toledo Branch Technical Innovation Team  
**Date:** August 2026  
**Status:** Operational System Implementation  

---

## I. Executive Summary

The **SSS Toledo Smart Monitoring & Transaction Routing System** is a high-efficiency, localized digital monitoring platform engineered specifically for the operational workflows of the SSS Toledo Branch. It unifies physical foot-traffic check-in, real-time counter routing, appointment roster tracking, Citizen's Charter SLA watchdog alerts, and **Harmonized ARTA Client Satisfaction Measurement (CSM)** into an integrated, paperless workflow.

Designed as an autonomous **digital operations command**, the system functions without replacing existing hardware or modifying central SSS mainframe databases. It runs entirely on the branch's local network (LAN) with zero cloud fees, zero external subscriptions, and full offline resilience.

### Core System Pillars
1. **Intelligent Self-Service Check-In (`/kiosk`):** Allows arriving members to check in within 15 seconds, capturing their queue ticket number, full name, **SSS / CRN Number (Optional)**, transaction purpose, and ARTA demographic profile.
2. **Automated Multi-Counter Routing:** Instantly categorizes and broadcasts members into dedicated queue rooms:
   - **PACD (Public Assistance and Complaints Desk):** `000's` Series (001–099)
   - **Main Counter Processing (Counters 1–4 & Side Desk):** `2000's & 3000's` Series (Shared Pool)
   - **E-Center Web Online Services:** `4000's` Series (4000–4999)
   - **Branch Appointment System (BAS) & Portal Bookings:** Pre-matched with assigned Member Service Representatives (MSRs)
3. **Dedicated Citizen Evaluation Tablets (`/rate`):** Paired with individual counter desks to capture official Net Promoter Scores (NPS 1–10), 5-point CSAT quality indices, and root-cause bottleneck suggestions immediately upon service conclusion.
4. **Official SSS Service Matrix & Audit Ledger (`/admin`):** Comprehensive record-keeping providing instant toggle between the detailed transaction audit trail and the official SSS daily tally matrix (**Accepted / Rejected / Total** counts per transaction type and counter officer).
5. **MSS Internal Task & Assignment Workflow:** Built-in task delegation module for tracking internal backlog clearances, claims processing, and E-4 record updates with automated overdue detection and accomplishment reports.
6. **Government Compliance & Disaster Recovery:** One-click generation of certified Excel reports, printable A4 ARTA CSM executive scorecards, and encrypted single-file SQLite database backups (`sss_toledo.db`).

---

## II. Problem Statement & Strategic Solutions

| Operational Challenge | Previous Branch Condition | System Solution |
|---|---|---|
| **1. Information Delay at Counters** | Members repeated names, SSS numbers, and intents verbally at the desk, slowing service. | **Pre-Loaded Kiosk Profiles:** Member details appear on the clerk’s screen before the citizen sits down. |
| **2. Appointment & Portal Invisibility** | Clerks have zero lobby arrival visibility; no advance record for portal appointments (manual check of phone/paper proof). | **Digital Kiosk Self-Check-In:** Instant `IN LOBBY` alerts for BAS bookings & real-time queue feed for portal members. |
| **3. Manual Tallying & End-of-Day Overtime** | Compiling daily SSS service matrices (A / R / Total) required manual paper ticket counts. | **Automated Service Matrix:** Instant real-time matrix generation exportable to Excel with one click. |
| **4. ARTA CSM Survey Compliance** | Paper CSM forms suffered from low response rates and cumbersome manual survey collation. | **Desk Rating Tablets (`/rate`):** 100% automated capture of NPS (1–10), CSAT, and root causes directly from citizens. |
| **5. Task Tracking & Accountability** | Administrative tasks and batch backlogs lacked centralized status tracking. | **MSS Task Management:** Integrated assignment lifecycle with deadlines, overdue alerts, and completion logs. |

---

## III. System Architecture & Network Topology

```
                     BRANCH LOCAL NETWORK (LAN / Local Wi-Fi)
                                    │
              ┌─────────────────────┼──────────────────────┐
              │                     │                      │
    ┌──────────▼──────────┐         │           ┌──────────▼──────────┐
    │   LOCAL SERVER PC   │         │           │    ADMIN PANEL      │
    │   (Node.js 22 Engine│◄────────┤           │  (Branch Head /     │
    │    SQLite3 Storage) │         │           │   Admin Monitor)    │
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

- **Offline Independence:** Runs 100% on the branch local network (LAN). Internet outages do not affect queue operations.
- **Embedded Database:** Native SQLite with Write-Ahead Logging (WAL) ensures instant concurrent transactions with zero server configuration.
- **Microsecond WebSocket Synchronization:** Powered by Socket.io room broadcasting.

---

## IV. Core System Interfaces & Station Roles

### 1. E-Logbook Kiosk (`/kiosk`)
- **Self-Service Check-In Modes:** Walk-In, Direct Appointment (BAS), and My.SSS Portal Appointment.
- **R.A. 10173 Data Privacy Compliance:** Explicit consent notice gate ("I Agree" unlocks form fields).
- **Demographic Profiling:** Captures Customer Type (Employed, Voluntary, Pensioner, OFW, Kasambahay, Employer, etc.), Sex, and Age for ARTA reporting.
- **Queue Number Deduplication:** Blocks accidental duplicate ticket entries.

### 2. Service Counter Dashboards (`/clerk`, `/pacd`, `/ecenter`)
- **Shared Queue Pool:** Priority-sorted queue feed with real-time wait duration indicators.
- **Transaction Processing Controls:** Instant claim, service duration timer, transaction type confirmation, and outcome logging (*Accepted / Finished*, *Rejected*, *For Verification*, *For Appointment*).
- **Correction & Re-Routing:** One-click re-routing for ticket misclassifications and post-service department referrals.
- **Tablet Trigger:** Automatically pushes evaluation prompts to the paired Citizen Rating Tablet (`/rate`).

### 3. Citizen Rating Tablet (`/rate`)
- **Interactive Evaluation Interface:** Standalone tablet mounted at each counter facing the member.
- **Harmonized ARTA 3-Step Evaluation:**
  - Net Promoter Score (NPS 1–10)
  - 5-Star / 5-Scale CSAT Quality Rating (*Very Satisfied*, *Satisfied*, *Neutral*, *Unsatisfied*)
  - Sentiment & Bottleneck Reason Selectors (*Dugay ang Sistema*, *Taas ang Linya*, *Libog Requirements*, *Dali ug Maayo*)
- **Auto-Reset:** Automatically cycles back to standby screen after 5 seconds.

### 4. Branch Operations Command & Admin Panel (`/admin`)
- **Live Counter Matrix:** Real-time visibility of active desks, serving status, and queue depth.
- **Citizen's Charter SLA Watchdog:** Live alerts for members waiting longer than 15.0 minutes.
- **Harmonized ARTA CSM Analytics Hub:**
  - Real-time NPS calculation (`% Promoters - % Detractors`)
  - Demographic distribution graphs (Customer Types, Sex, Age Groups)
  - Bottleneck root-cause frequency tracking
  - Official Printable A4 Government Report with executive signatures
  - Certified ARTA Excel Export (`.xlsx`)
- **Master Audit Log & SSS Service Matrix:**
  - Detailed transactional audit ledger with search and filters.
  - Official SSS Daily Service Matrix tally (Accepted / Rejected / Total per clerk and transaction type).
- **MSS Task & Assignment Management:** Centralized tracking of internal office assignments, deadlines, priority levels, and accomplishment records.
- **Staff Accounts & Disaster Recovery:** 4-digit PIN management, role assignments, and one-click database snapshot backups (`sss_toledo.db`).

---

## V. Hardware & Infrastructure Requirements

The system utilizes the branch's **existing hardware infrastructure**, requiring zero new server acquisitions:

| Equipment | Requirement | Purpose |
|---|---|---|
| **Server Host PC** | Existing Windows Branch PC with Node.js | Hosts backend service and local SQLite database |
| **Kiosk Device** | Touchscreen Tablet or PC at entrance | Citizen self-service entry |
| **Clerk Workstations** | Existing Counter PCs with Chrome / Edge | Officer transaction processing |
| **Rating Tablets** | 7"–10" Android / iOS / Windows tablets | Desk-mounted citizen feedback collection |
| **Network** | Existing branch LAN router or Wi-Fi | Local communication backbone (No internet needed) |
| **Power Protection** | Standard Uninterruptible Power Supply (UPS) | Protects server PC against brief power drops |

---

## VI. Project Impact & Expected Outcomes

1. **Service Efficiency:** Reduces counter transaction start times by eliminating redundant verbal information capture.
2. **100% ARTA CSM Compliance:** Replaces burdensome physical paper surveys with automated, digital citizen feedback and compliant executive reports.
3. **Administrative Time Savings:** Eliminates 1–2 hours of daily manual tallying for branch end-of-day reports.
4. **Data Security & Privacy:** Guarantees full compliance with the Philippine Data Privacy Act of 2012 (R.A. No. 10173) by retaining all records locally within branch custody.

---

*SSS Toledo Branch — Smart Monitoring, Routing & ARTA CSM System Proposal | August 2026*
