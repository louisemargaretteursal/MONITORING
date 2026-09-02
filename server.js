const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Multer for Excel uploads (stored in memory)
const upload = multer({ storage: multer.memoryStorage() });

// ─── DATABASE ─────────────────────────────────────────────────────────────────
const db = require('./database/db');

// ─── ACTIVE STATIONS PRESENCE REGISTRY ───────────────────────────────────────
const activeStations = new Map();

// ─── ROUTES ───────────────────────────────────────────────────────────────────
const membersRouter = require('./routes/members')(io);
const transactionsRouter = require('./routes/transactions')(io, activeStations);
const appointmentsRouter = require('./routes/appointments')(io, upload);
const clerksRouter = require('./routes/clerks')(io, activeStations);
const reportsRouter = require('./routes/reports')();
const tasksRouter = require('./routes/tasks')(io);

app.use('/api/members', membersRouter);
app.use('/api/transactions', transactionsRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/clerks', clerksRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/tasks', tasksRouter);

// ─── ADMIN AUTH ENDPOINT ──────────────────────────────────────────────────────
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ success: false, error: 'Password is required.' });
  try {
    const admin = db.prepare(
      "SELECT id, name, pin_hash FROM clerks WHERE counter = 'Admin' AND is_active = 1 LIMIT 1"
    ).get();
    if (!admin) return res.status(404).json({ success: false, error: 'Admin account not configured.' });
    if (admin.pin_hash === password) {
      return res.json({ success: true, name: admin.name });
    }
    return res.status(401).json({ success: false, error: 'Incorrect password. Access denied.' });
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Server error.' });
  }
});

// ─── PAGE ROUTES ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/kiosk', (req, res) => res.sendFile(path.join(__dirname, 'public', 'kiosk', 'index.html')));
app.get('/clerk', (req, res) => res.sendFile(path.join(__dirname, 'public', 'clerk', 'index.html')));
app.get('/pacd', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pacd', 'index.html')));
app.get('/ecenter', (req, res) => res.sendFile(path.join(__dirname, 'public', 'ecenter', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html')));
app.get('/rate', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rate', 'index.html')));
app.get('/feedback', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rate', 'index.html')));

// ─── SOCKET.IO ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`🔌 Device connected: ${socket.id}`);

  socket.on('join:room', (room) => {
    socket.join(room);
    console.log(`   → Joined room: ${room}`);
  });

  // When a clerk/officer signs into any station
  socket.on('station:login', (data) => {
    if (data && data.station) {
      activeStations.set(data.station, {
        station: data.station,
        clerkId: data.clerkId || null,
        clerkName: data.clerkName || 'Officer on Duty',
        socketId: socket.id,
        loginTime: new Date().toISOString()
      });
      socket.station = data.station;
      console.log(`   🏢 Station Online: ${data.station} manned by ${data.clerkName}`);
      io.to('admin').emit('stations:presence', Array.from(activeStations.values()));
    }
  });

  // When a clerk/officer logs out
  socket.on('station:logout', (data) => {
    if (data && data.station) {
      activeStations.delete(data.station);
      console.log(`   🏢 Station Offline: ${data.station}`);
      io.to('admin').emit('stations:presence', Array.from(activeStations.values()));
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Device disconnected: ${socket.id}`);
    if (socket.station && activeStations.has(socket.station)) {
      const existing = activeStations.get(socket.station);
      if (existing && existing.socketId === socket.id) {
        activeStations.delete(socket.station);
        io.to('admin').emit('stations:presence', Array.from(activeStations.values()));
      }
    }
  });
});

app.get('/api/transactions/stations/presence', (req, res) => {
  res.json(Array.from(activeStations.values()));
});

// Export io and activeStations so routes can use it
app.set('io', io);
app.set('activeStations', activeStations);

// ─── NO-SHOW ALERT JOB (runs every minute) ────────────────────────────────────
setInterval(() => {
  const now = new Date();
  const today = (db.getTodayDate ? db.getTodayDate(now) : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now));
  const threshold = new Date(now.getTime() - 15 * 60 * 1000); // 15 min ago
  const thresholdStr = threshold.toTimeString().slice(0, 5); // HH:MM

  const potentialNoShows = db.prepare(`
    SELECT a.*, c.name as clerk_name, c.counter
    FROM appointments a
    LEFT JOIN clerks c ON a.clerk_id = c.id
    WHERE a.date = ?
      AND a.arrival_status = 'not-arrived'
      AND a.type = 'direct'
      AND a.appointment_time <= ?
  `).all(today, thresholdStr);

  if (potentialNoShows.length > 0) {
    io.to('admin').emit('noshow:alert', potentialNoShows);
  }
}, 60 * 1000);

// ─── 5:30 PM END-OF-DAY AUTO-CLOSEOUT (For Verification / On-Hold Members) ───
// Auto-marks all unreturned for-verification members as served at 5:30 PM
function autoCloseUnreturnedMembers() {
  const today = (db.getTodayDate ? db.getTodayDate() : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()));
  const nowStr = (db.getNowDateTime ? db.getNowDateTime() : new Date().toLocaleString('en-CA'));

  try {
    // 1. Find all members still 'on-hold' from today
    const heldMembers = db.prepare(`
      SELECT m.*, t.id as tx_id, t.service_start_time, t.counter as tx_counter, t.clerk_id as tx_clerk_id
      FROM members m
      LEFT JOIN transactions t ON t.member_id = m.id AND t.service_end_time IS NULL
      WHERE m.date = ? AND m.status = 'on-hold'
    `).all(today);

    let closedCount = 0;

    for (const m of heldMembers) {
      // Realistic consultation duration (default 10.0 min for the initial evaluation)
      let durationMins = 10.0;
      if (m.service_start_time) {
        const start = new Date(m.service_start_time);
        const rawMins = (new Date() - start) / 60000;
        // Cap duration to 15 mins so ARTA stats aren't distorted by unreturned hold time
        durationMins = Math.min(15.0, Math.max(3.0, rawMins)).toFixed(1);
      }

      if (m.tx_id) {
        // Conclude existing open transaction
        db.prepare(`
          UPDATE transactions
          SET service_end_time = ?,
              duration_minutes = ?,
              outcome = 'for-verification',
              confirmed_transaction_type = COALESCE(confirmed_transaction_type, ?),
              clerk_instructions = COALESCE(clerk_instructions, 'For Verification (Member served — did not return same day)')
          WHERE id = ?
        `).run(nowStr, durationMins, m.transaction_type || 'General Transaction', m.tx_id);
      } else {
        // Create concluded transaction record if none existed
        db.prepare(`
          INSERT INTO transactions (
            member_id, counter, clerk_id, service_start_time, service_end_time,
            duration_minutes, wait_time_minutes, outcome, confirmed_transaction_type, clerk_instructions, date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'for-verification', ?, 'For Verification (Member served — did not return same day)', ?)
        `).run(
          m.id, m.tx_counter || 'Counter 1', m.claimed_by || m.tx_clerk_id || null,
          m.check_in_time || nowStr, nowStr, durationMins, 5.0,
          m.transaction_type || 'General Transaction', today
        );
      }

      // Mark member status as 'done' so they leave Returning Members queue
      db.prepare("UPDATE members SET status = 'done' WHERE id = ?").run(m.id);

      // Auto-mark any linked BAS appointment as done
      db.prepare("UPDATE appointments SET arrival_status = 'done' WHERE member_id = ? AND arrival_status = 'in-lobby'").run(m.id);

      closedCount++;
    }

    if (closedCount > 0) {
      console.log(`🔒 [EOD 5:30 PM] Auto-closed ${closedCount} on-hold/for-verification member(s) as served for ${today}.`);
      io.emit('appointments:refresh');
      io.to('admin').emit('member:updated');
      io.to('counter-pool').emit('member:updated');
    }
  } catch (err) {
    console.error('Error during 5:30 PM auto-closeout:', err);
  }
}

// ─── 7:00 PM END-OF-DAY AUTO-PURGE (Unserved Waiting Members) ───────────────
// Auto-expires unserved members left in the pool after 7:00 PM so queues start clean
function autoExpireUnservedMembers() {
  const today = (db.getTodayDate ? db.getTodayDate() : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()));
  try {
    const unserved = db.prepare(`
      SELECT id FROM members
      WHERE status IN ('waiting', 'on-hold')
        AND date <= ?
    `).all(today);

    if (unserved.length > 0) {
      db.prepare(`
        UPDATE members
        SET status = 'unserved'
        WHERE status IN ('waiting', 'on-hold')
          AND date <= ?
      `).run(today);

      db.prepare(`
        UPDATE appointments
        SET arrival_status = 'no-show'
        WHERE date <= ? AND arrival_status IN ('not-arrived', 'in-lobby')
      `).run(today);

      console.log(`🌙 [7:00 PM Closeout] Auto-expired ${unserved.length} unserved member(s) from the queue pool.`);
      io.emit('member:updated');
      io.emit('appointments:refresh');
      io.to('pacd').emit('member:updated');
      io.to('counter-pool').emit('member:updated');
      io.to('ecenter').emit('member:updated');
      io.to('admin').emit('member:updated');
    }
  } catch (err) {
    console.error('Error during 7:00 PM auto-expire:', err);
  }
}

// ─── SCHEDULED DAILY JOBS ───────────────────────────────────────────────────
// Runs every minute to check for 5:30 PM and 7:00 PM closeout and daily reporting
setInterval(() => {
  const now = new Date();
  const manilaHour = parseInt(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', hour: 'numeric', hour12: false }).format(now), 10);
  const manilaMin = parseInt(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', minute: 'numeric' }).format(now), 10);

  // 5:30 PM (17:30) — Auto-close unreturned for-verification members & generate report
  if (manilaHour === 17 && manilaMin === 30) {
    autoCloseUnreturnedMembers();
    generateDailyReport();
  }

  // 7:00 PM (19:00) — Auto-expire unserved waiting members from the pool
  if (manilaHour === 19 && manilaMin === 0) {
    autoExpireUnservedMembers();
  }
}, 60 * 1000);

// API endpoint for manual or test trigger of EOD closeout
app.post('/api/transactions/eod-closeout', (req, res) => {
  autoCloseUnreturnedMembers();
  autoExpireUnservedMembers();
  res.json({ success: true, message: 'End-of-Day closeout & unserved pool purge executed.' });
});

function generateDailyReport() {
  const today = (db.getTodayDate ? db.getTodayDate() : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()));
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_served,
      AVG(wait_time_minutes) as avg_wait,
      AVG(duration_minutes) as avg_duration,
      SUM(CASE WHEN outcome = 'finished' THEN 1 ELSE 0 END) as finished,
      SUM(CASE WHEN outcome = 'rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN outcome = 'for-appointment' THEN 1 ELSE 0 END) as for_appointment,
      SUM(CASE WHEN outcome = 'for-verification' THEN 1 ELSE 0 END) as for_verification,
      SUM(CASE WHEN rating = 'happy' THEN 1 ELSE 0 END) as happy,
      SUM(CASE WHEN rating = 'neutral' THEN 1 ELSE 0 END) as neutral,
      SUM(CASE WHEN rating = 'sad' THEN 1 ELSE 0 END) as sad
    FROM transactions WHERE date = ?
  `).get(today);

  db.prepare(`
    INSERT INTO reports (date, type, data_json)
    VALUES (?, 'daily', ?)
  `).run(today, JSON.stringify(stats));

  io.to('admin').emit('report:generated', { type: 'daily', date: today });
  console.log(`📊 Daily report generated for ${today}`);
}

// ─── START SERVER ─────────────────────────────────────────────────────────────
const PORT = 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     SSS TOLEDO MONITORING SYSTEM — RUNNING ✅        ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║  Local:    http://localhost:${PORT}                     ║`);
  console.log(`║  Network:  http://[your-ip]:${PORT}                     ║`);
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log('║  /kiosk    → E-Logbook Kiosk                         ║');
  console.log('║  /clerk    → Clerk Dashboard                         ║');
  console.log('║  /pacd     → PACD Dashboard                          ║');
  console.log('║  /ecenter  → E-Center Dashboard                      ║');
  console.log('║  /admin    → Admin Panel                             ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
});
