const express = require('express');
const db = require('../database/db');

module.exports = (io, activeStations) => {
  const router = express.Router();

  // GET all clerks (admin view — includes inactive)
  router.get('/', (req, res) => {
    const all = req.query.all === 'true';
    const clerks = all
      ? db.prepare('SELECT id, name, counter, is_active FROM clerks ORDER BY id ASC').all()
      : db.prepare('SELECT id, name, counter, is_active FROM clerks WHERE is_active = 1').all();
    res.json(clerks);
  });

  // POST login (PIN verification with dynamic counter selection & station occupancy lock)
  router.post('/login', (req, res) => {
    const { clerk_id, pin, selected_counter, station } = req.body;
    const clerk = db.prepare('SELECT * FROM clerks WHERE id = ? AND is_active = 1').get(clerk_id);

    if (!clerk) return res.status(404).json({ error: 'Clerk not found.' });
    if (clerk.pin_hash !== pin) return res.status(401).json({ error: 'Incorrect password.' });

    const activeStation = station || selected_counter || clerk.counter || 'Counter 1';

    // Single Station Occupancy Check
    if (activeStations && activeStations.has(activeStation)) {
      const existing = activeStations.get(activeStation);
      if (existing && existing.clerkId && existing.clerkId !== parseInt(clerk_id, 10)) {
        return res.status(409).json({
          error: `${activeStation} is currently occupied by ${existing.clerkName}. Please choose an available counter or ask them to log out.`
        });
      }
    }

    res.json({
      success: true,
      clerk: { id: clerk.id, name: clerk.name, counter: activeStation, active_station: activeStation }
    });
  });

  // POST switch active counter for current session
  router.post('/switch-counter', (req, res) => {
    const { clerk_id, counter } = req.body;
    if (!clerk_id || !counter) return res.status(400).json({ error: 'Clerk ID and counter are required.' });
    const clerk = db.prepare('SELECT id, name FROM clerks WHERE id = ? AND is_active = 1').get(clerk_id);
    if (!clerk) return res.status(404).json({ error: 'Clerk not found.' });

    res.json({
      success: true,
      clerk: { id: clerk.id, name: clerk.name, counter }
    });
  });

  // GET clerk profile + today's stats
  router.get('/:id/profile', (req, res) => {
    const { id } = req.params;
    const clerk = db.prepare('SELECT id, name, counter, is_active, created_at FROM clerks WHERE id = ?').get(id);
    if (!clerk) return res.status(404).json({ error: 'Clerk not found.' });

    const today = new Date().toISOString().split('T')[0];
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_served,
        ROUND(AVG(duration_minutes), 2) as avg_duration,
        ROUND(AVG(wait_time_minutes), 2) as avg_wait,
        SUM(CASE WHEN outcome = 'finished' THEN 1 ELSE 0 END) as finished,
        SUM(CASE WHEN outcome = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN outcome = 'for-appointment' THEN 1 ELSE 0 END) as for_appointment,
        SUM(CASE WHEN rating = 'happy'   THEN 1 ELSE 0 END) as happy,
        SUM(CASE WHEN rating = 'neutral' THEN 1 ELSE 0 END) as neutral,
        SUM(CASE WHEN rating = 'sad'     THEN 1 ELSE 0 END) as sad
      FROM transactions
      WHERE clerk_id = ? AND date = ?
    `).get(id, today);

    res.json({ clerk, stats: stats || {} });
  });

  // POST add a new clerk (admin only)
  router.post('/', (req, res) => {
    const { name, counter, pin } = req.body;
    if (!name || !counter || !pin) {
      return res.status(400).json({ error: 'Name, counter, and PIN are required.' });
    }
    const result = db.prepare(`
      INSERT INTO clerks (name, counter, pin_hash) VALUES (?, ?, ?)
    `).run(name, counter, pin);
    const clerk = db.prepare('SELECT id, name, counter, is_active FROM clerks WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, clerk });
  });

  // PUT update clerk name and/or counter (daily rotation support)
  router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { name, counter } = req.body;
    if (!name && !counter) {
      return res.status(400).json({ error: 'At least one field (name or counter) is required.' });
    }
    const clerk = db.prepare('SELECT * FROM clerks WHERE id = ?').get(id);
    if (!clerk) return res.status(404).json({ error: 'Clerk not found.' });

    db.prepare('UPDATE clerks SET name = ?, counter = ? WHERE id = ?')
      .run(name || clerk.name, counter || clerk.counter, id);

    const updated = db.prepare('SELECT id, name, counter, is_active FROM clerks WHERE id = ?').get(id);
    res.json({ success: true, clerk: updated });
  });

  // PUT reset PIN
  router.put('/:id/pin', (req, res) => {
    const { id } = req.params;
    const { new_pin } = req.body;
    if (!new_pin || new_pin.length !== 4) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits.' });
    }
    db.prepare('UPDATE clerks SET pin_hash = ? WHERE id = ?').run(new_pin, id);
    res.json({ success: true });
  });

  // PUT toggle clerk active status
  router.put('/:id/toggle', (req, res) => {
    const { id } = req.params;
    const clerk = db.prepare('SELECT * FROM clerks WHERE id = ?').get(id);
    if (!clerk) return res.status(404).json({ error: 'Clerk not found.' });
    const newStatus = clerk.is_active ? 0 : 1;
    db.prepare('UPDATE clerks SET is_active = ? WHERE id = ?').run(newStatus, id);
    res.json({ success: true, is_active: newStatus });
  });

  return router;
};
