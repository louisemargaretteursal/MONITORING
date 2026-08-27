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
  const today = now.toISOString().split('T')[0];
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

// ─── DAILY REPORT JOB (runs at 5:00 PM) ─────────────────────────────────────
setInterval(() => {
  const now = new Date();
  if (now.getHours() === 17 && now.getMinutes() === 0) {
    generateDailyReport();
  }
}, 60 * 1000);

function generateDailyReport() {
  const today = new Date().toISOString().split('T')[0];
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_served,
      AVG(wait_time_minutes) as avg_wait,
      AVG(duration_minutes) as avg_duration,
      SUM(CASE WHEN outcome = 'finished' THEN 1 ELSE 0 END) as finished,
      SUM(CASE WHEN outcome = 'rejected' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN outcome = 'for-appointment' THEN 1 ELSE 0 END) as for_appointment,
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
