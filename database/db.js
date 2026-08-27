// Node.js v22 has SQLite built in — no external package needed!
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_DIR  = path.join(__dirname);
const DB_PATH = path.join(DB_DIR, 'sss_toledo.db');

// Ensure database directory exists
if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode and foreign keys
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// ─── CREATE TABLES ────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS clerks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    counter TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    queue_number TEXT,
    name TEXT NOT NULL,
    sss_number TEXT,
    transaction_type TEXT NOT NULL,
    check_in_time TEXT DEFAULT (datetime('now','localtime')),
    routed_to TEXT NOT NULL,
    status TEXT DEFAULT 'waiting',
    entry_type TEXT DEFAULT 'walk-in',
    is_rerouted INTEGER DEFAULT 0,
    original_destination TEXT,
    claimed_by INTEGER,
    date TEXT DEFAULT (date('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id INTEGER NOT NULL,
    counter TEXT,
    clerk_id INTEGER,
    service_start_time TEXT,
    service_end_time TEXT,
    wait_time_minutes REAL,
    duration_minutes REAL,
    outcome TEXT,
    rating TEXT,
    remarks TEXT,
    date TEXT DEFAULT (date('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone_number TEXT,
    email TEXT,
    appointment_time TEXT NOT NULL,
    clerk_id INTEGER,
    type TEXT DEFAULT 'direct',
    arrival_status TEXT DEFAULT 'not-arrived',
    member_id INTEGER,
    date TEXT DEFAULT (date('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT NOT NULL,
    data_json TEXT NOT NULL,
    generated_at TEXT DEFAULT (datetime('now','localtime'))
  );

  CREATE TABLE IF NOT EXISTS mss_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    priority TEXT DEFAULT 'normal',
    assigned_to INTEGER REFERENCES clerks(id),
    assigned_station TEXT,
    target_date TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    started_at TEXT,
    completed_at TEXT,
    accomplishment_notes TEXT,
    created_by INTEGER REFERENCES clerks(id),
    created_at TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// ─── MIGRATIONS (add new columns to existing databases safely) ────────────────
try { db.exec('ALTER TABLE members ADD COLUMN is_rerouted INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE members ADD COLUMN original_destination TEXT'); } catch (e) {}
try { db.exec('ALTER TABLE members ADD COLUMN customer_type TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE members ADD COLUMN sex TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE members ADD COLUMN age INTEGER'); } catch(e) {}
try { db.exec('ALTER TABLE members ADD COLUMN region TEXT DEFAULT "Region VII - Central Visayas"'); } catch(e) {}
try { db.exec('ALTER TABLE members ADD COLUMN dpa_consent TEXT DEFAULT "agree"'); } catch(e) {}
try { db.exec('ALTER TABLE members ADD COLUMN contact_mobile TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE members ADD COLUMN contact_email TEXT'); } catch(e) {}

try { db.exec('ALTER TABLE transactions ADD COLUMN confirmed_transaction_type TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE transactions ADD COLUMN clerk_instructions TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE transactions ADD COLUMN feedback_reason TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE transactions ADD COLUMN nps_score INTEGER'); } catch(e) {}
try { db.exec('ALTER TABLE transactions ADD COLUMN feedback_category TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE transactions ADD COLUMN comments TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE transactions ADD COLUMN comm_consent TEXT DEFAULT "agree"'); } catch(e) {}
try { db.exec('ALTER TABLE appointments ADD COLUMN is_late INTEGER DEFAULT 0'); } catch(e) {}
try { db.exec('ALTER TABLE appointments ADD COLUMN service TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE appointments ADD COLUMN duration_mins INTEGER'); } catch(e) {}
try { db.exec('ALTER TABLE appointments ADD COLUMN booking_status TEXT'); } catch(e) {}

// ─── CLEANUP & ROLE NORMALIZATION ──────────────────────────────────────────
try {
  db.prepare("DELETE FROM clerks WHERE name IN ('PACD Officer', 'E-Center Clerk')").run();
  db.prepare("UPDATE clerks SET counter = 'Branch Staff' WHERE counter != 'Admin' AND counter != 'Administrator'").run();
  db.prepare("UPDATE transactions SET counter = 'PACD Desk' WHERE counter = 'PACD'").run();
  db.prepare("UPDATE transactions SET counter = 'E-Center Station' WHERE counter = 'E-Center'").run();
  db.prepare("UPDATE transactions SET counter = 'PACD Desk' WHERE (counter = 'Branch Staff' OR counter IS NULL) AND member_id IN (SELECT id FROM members WHERE routed_to = 'pacd')").run();
  db.prepare("UPDATE transactions SET counter = 'E-Center Station' WHERE (counter = 'Branch Staff' OR counter IS NULL) AND member_id IN (SELECT id FROM members WHERE routed_to = 'ecenter')").run();
  db.prepare("UPDATE transactions SET counter = 'Counter 1' WHERE counter = 'Branch Staff' OR counter = 'Main Counter' OR counter IS NULL").run();
} catch(e) {}

// ─── SEED DEFAULT CLERKS (if none exist) ─────────────────────────────────────
const clerkCount = db.prepare('SELECT COUNT(*) as count FROM clerks').get();
if (clerkCount.count === 0) {
  const insert = db.prepare(
    'INSERT INTO clerks (name, counter, pin_hash) VALUES (?, ?, ?)'
  );
  const defaultClerks = [
    ['Christie Sillar',   'Branch Staff', '1234'],
    ['Marga Ursal',       'Branch Staff', '1234'],
    ['Laarnie Alibong',   'Branch Staff', '1234'],
    ['Sheina Torrecampo', 'Branch Staff', '1234'],
    ['Sheila Vasquez',    'Branch Staff', '1234'],
    ['Admin',             'Admin',        'admin1234'],
  ];
  defaultClerks.forEach(c => insert.run(...c));
  console.log('✅ Default staff accounts seeded (PIN: 1234 / Admin PIN: admin1234)');
}

// ─── SEED DEFAULT MSS TASKS (if table is empty) ──────────────────────────────
const taskCount = db.prepare('SELECT COUNT(*) as count FROM mss_tasks').get();
if (taskCount.count === 0) {
  const christie = db.prepare("SELECT id FROM clerks WHERE name = 'Christie Sillar'").get();
  const marga = db.prepare("SELECT id FROM clerks WHERE name = 'Marga Ursal'").get();
  const laarnie = db.prepare("SELECT id FROM clerks WHERE name = 'Laarnie Alibong'").get();

  const insertTask = db.prepare(`
    INSERT INTO mss_tasks (title, description, category, priority, assigned_to, assigned_station, target_date, status, started_at, completed_at, accomplishment_notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const todayStr = new Date().toISOString().split('T')[0];

  if (christie) {
    insertTask.run(
      'Encode 25 E-4 Data Corrections Batch A',
      'Process verified E-4 submission records from morning walk-ins and upload supporting documents.',
      'E-4 & Member Records',
      'urgent',
      christie.id,
      'Counter 1',
      `${todayStr} 17:00`,
      'ongoing',
      `${todayStr} 09:30`,
      null,
      null
    );
  }

  if (marga) {
    insertTask.run(
      'ACOP Annual Pensioner Verification Audit',
      'Audit Toledo North cluster annual confirmation records for pending pension release.',
      'ACOP & Pensioners',
      'normal',
      marga.id,
      'Counter 2',
      `${todayStr} 16:30`,
      'pending',
      null,
      null,
      null
    );
  }

  if (laarnie) {
    insertTask.run(
      'Death & Funeral Claims Completeness Check',
      'Review death claim documentary completeness before branch head final signoff.',
      'Claims & Benefits',
      'critical',
      laarnie.id,
      'PACD Desk',
      `${todayStr} 14:00`,
      'completed',
      `${todayStr} 08:30`,
      `${todayStr} 11:15`,
      'All 8 death claim folders verified and endorsed to Branch Head.'
    );
  }

  console.log('✅ Default MSS task assignments seeded.');
}

module.exports = db;


