const express = require('express');
const db = require('../database/db');

module.exports = (io) => {
  const router = express.Router();

  // GET all active members for today (waiting/being-served)
  router.get('/', (req, res) => {
    const today = (db.getTodayDate ? db.getTodayDate() : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()));
    const members = db.prepare(`
      SELECT m.*, c.name as clerk_name
      FROM members m
      LEFT JOIN clerks c ON m.claimed_by = c.id
      WHERE m.date = ?
      ORDER BY
        CASE WHEN m.queue_number GLOB '[0-9]*'
          THEN CAST(m.queue_number AS INTEGER)
          ELSE 99999 END ASC,
        m.check_in_time ASC
    `).all(today);
    res.json(members);
  });

  // GET current ongoing transaction for a clerk/station (for accidental refresh recovery)
  router.get('/current-serving', (req, res) => {
    const { clerk_id, counter } = req.query;
    if (!clerk_id && !counter) {
      return res.json({ hasActive: false });
    }

    try {
      const today = (db.getTodayDate ? db.getTodayDate() : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()));
      const ongoing = db.prepare(`
        SELECT t.id as transaction_id, t.service_start_time, t.counter, t.clerk_id, t.confirmed_transaction_type,
               m.id as member_id, m.name, m.queue_number, m.sss_number, m.transaction_type, m.entry_type, m.routed_to,
               m.status, m.check_in_time
        FROM transactions t
        JOIN members m ON t.member_id = m.id
        WHERE t.service_end_time IS NULL
          AND m.date = ?
          AND m.status = 'being-served'
          AND (
            (t.clerk_id IS NOT NULL AND t.clerk_id = ?)
            OR (t.counter = ?)
            OR (m.claimed_by = ?)
          )
        ORDER BY t.id DESC LIMIT 1
      `).get(today, clerk_id || -1, counter || '', clerk_id || -1);

      if (ongoing) {
        return res.json({
          hasActive: true,
          transaction_id: ongoing.transaction_id,
          service_start_time: ongoing.service_start_time,
          member: {
            id: ongoing.member_id,
            name: ongoing.name,
            queue_number: ongoing.queue_number,
            sss_number: ongoing.sss_number,
            transaction_type: ongoing.confirmed_transaction_type || ongoing.transaction_type,
            entry_type: ongoing.entry_type,
            routed_to: ongoing.routed_to,
            status: ongoing.status,
            check_in_time: ongoing.check_in_time
          }
        });
      }
      return res.json({ hasActive: false });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  // GET members by department/routing
  router.get('/pool/:routed_to', (req, res) => {
    const today = (db.getTodayDate ? db.getTodayDate() : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()));
    const { routed_to } = req.params;
    const members = db.prepare(`
      SELECT m.*, c.name as clerk_name
      FROM members m
      LEFT JOIN clerks c ON m.claimed_by = c.id
      WHERE m.date = ? AND m.routed_to = ? AND m.status IN ('waiting', 'on-hold')
        AND m.entry_type != 'direct-appointment'
      ORDER BY
        CASE WHEN m.queue_number GLOB '[0-9]*'
          THEN CAST(m.queue_number AS INTEGER)
          ELSE 99999 END ASC,
        m.check_in_time ASC
    `).all(today, routed_to);
    res.json(members);
  });

  // POST check-in a walk-in member
  router.post('/checkin', (req, res) => {
    const {
      queue_number, name, sss_number, transaction_type, entry_type,
      customer_type, sex, age, region, dpa_consent, contact_mobile, contact_email
    } = req.body;

    if (!name || !transaction_type) {
      return res.status(400).json({ error: 'Name and transaction type are required.' });
    }

    // Determine routing based on queue number prefix (strictly starting at 1; excluding 0, 000, 2000, 3000, 4000)
    let routed_to = null;
    const qNum = parseInt(queue_number, 10);
    if (!isNaN(qNum)) {
      if (qNum >= 1 && qNum <= 99) {
        routed_to = 'pacd';
      } else if ((qNum >= 2001 && qNum <= 2999) || (qNum >= 3001 && qNum <= 3999)) {
        routed_to = 'counter-pool';
      } else if (qNum >= 4001 && qNum <= 4999) {
        routed_to = 'ecenter';
      }
    }
    if (entry_type === 'portal-appointment') routed_to = 'portal-pool';
    if (entry_type === 'direct-appointment') routed_to = routed_to || 'counter-pool';

    if (!routed_to) {
      return res.status(400).json({
        error: "Invalid queue ticket number. Ticket numbers start at 1: 001–099 (PACD), 2001–2999 / 3001–3999 (Main Counters), and 4001–4999 (E-Center). Numbers such as 000, 2000, 3000, and 4000 cannot be routed."
      });
    }

    const today = (db.getTodayDate ? db.getTodayDate() : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()));

    // ── Duplicate check: block if this queue number was already logged today ───
    if (queue_number) {
      const existing = db.prepare(`
        SELECT id, name, status FROM members
        WHERE queue_number = ? AND date = ?
        LIMIT 1
      `).get(queue_number, today);

      if (existing) {
        return res.status(409).json({
          error: 'duplicate',
          message: `Queue number ${queue_number} has already been logged today.`,
          existing: {
            name: existing.name,
            status: existing.status
          }
        });
      }
    }

    const result = db.prepare(`
      INSERT INTO members (
        queue_number, name, sss_number, transaction_type, routed_to, entry_type,
        customer_type, sex, age, region, dpa_consent, contact_mobile, contact_email
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      queue_number || null, name, sss_number || null, transaction_type, routed_to, entry_type || 'walk-in',
      customer_type || null, sex || null, age ? parseInt(age) : null, region || 'Region VII - Central Visayas',
      dpa_consent || 'agree', contact_mobile || null, contact_email || null
    );

    const newMember = db.prepare('SELECT * FROM members WHERE id = ?').get(result.lastInsertRowid);

    // Broadcast to the correct room
    io.to(routed_to).emit('member:checkin', newMember);
    io.to('admin').emit('member:checkin', newMember);

    res.json({ success: true, member: newMember });
  });


  // POST claim a member (clerk picks them from pool)
  router.post('/:id/claim', (req, res) => {
    const { id } = req.params;
    const { clerk_id, counter } = req.body;

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    if (!member) return res.status(404).json({ error: 'Member not found.' });
    if (member.status !== 'waiting' && member.status !== 'on-hold') {
      return res.status(409).json({ error: 'Member is currently being served or has already been concluded.' });
    }

    db.prepare(`
      UPDATE members SET status = 'being-served', claimed_by = ? WHERE id = ?
    `).run(clerk_id, id);

    // Check if open transaction already exists for this member
    let tx = db.prepare("SELECT * FROM transactions WHERE member_id = ? AND service_end_time IS NULL ORDER BY id DESC LIMIT 1").get(id);
    let txId;

    if (tx) {
      db.prepare("UPDATE transactions SET service_start_time = datetime('now','localtime'), counter = ?, clerk_id = ? WHERE id = ?")
        .run(counter || tx.counter, clerk_id, tx.id);
      txId = tx.id;
    } else {
      // Start transaction record
      const txResult = db.prepare(`
        INSERT INTO transactions (member_id, counter, clerk_id, service_start_time)
        VALUES (?, ?, ?, datetime('now','localtime'))
      `).run(id, counter, clerk_id);
      txId = txResult.lastInsertRowid;

      // Calculate wait time
      const checkIn = new Date(member.check_in_time);
      const now = new Date();
      const waitMins = ((now - checkIn) / 60000).toFixed(1);

      db.prepare('UPDATE transactions SET wait_time_minutes = ? WHERE id = ?')
        .run(waitMins, txId);
    }

    const updatedMember = db.prepare('SELECT * FROM members WHERE id = ?').get(id);

    io.to(member.routed_to).emit('member:claimed', { memberId: id, clerkId: clerk_id });
    io.to('counter-pool').emit('member:claimed', { memberId: id, clerkId: clerk_id });
    io.to('admin').emit('member:claimed', { memberId: id, clerkId: clerk_id });

    res.json({ success: true, member: updatedMember, transaction_id: txId });
  });

  // POST re-route a member (correction)
  router.post('/:id/reroute', (req, res) => {
    const { id } = req.params;
    const { new_destination } = req.body;

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    if (!member) return res.status(404).json({ error: 'Member not found.' });

    // Store where the member originally came from
    const originalDestination = member.original_destination || member.routed_to;

    db.prepare(`
      UPDATE members
      SET routed_to = ?,
          status = 'waiting',
          claimed_by = NULL,
          is_rerouted = 1,
          original_destination = ?
      WHERE id = ?
    `).run(new_destination, originalDestination, id);

    const updatedMember = db.prepare('SELECT * FROM members WHERE id = ?').get(id);

    io.to(new_destination).emit('member:rerouted', updatedMember);
    io.to('admin').emit('member:rerouted', updatedMember);

    res.json({ success: true, member: updatedMember });
  });

  // POST put member on hold (For Verification - same day)
  router.post('/:id/hold', (req, res) => {
    const { id } = req.params;
    db.prepare("UPDATE members SET status = 'on-hold' WHERE id = ?").run(id);
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    io.to('admin').emit('member:updated', member);
    io.to('counter-pool').emit('member:updated', member);
    res.json({ success: true, member });
  });

  // POST resume a held member
  router.post('/:id/resume', (req, res) => {
    const { id } = req.params;
    const { clerk_id, counter } = req.body || {};

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    if (!member) return res.status(404).json({ error: 'Member not found.' });

    const effectiveClerkId = clerk_id || member.claimed_by;
    const effectiveCounter = counter || 'Counter 1';

    db.prepare("UPDATE members SET status = 'being-served', claimed_by = ? WHERE id = ?").run(effectiveClerkId, id);

    // Check for existing unclosed transaction
    let tx = db.prepare("SELECT * FROM transactions WHERE member_id = ? AND service_end_time IS NULL ORDER BY id DESC LIMIT 1").get(id);
    let txId;

    if (tx) {
      db.prepare("UPDATE transactions SET service_start_time = datetime('now','localtime'), counter = ?, clerk_id = ? WHERE id = ?")
        .run(effectiveCounter, effectiveClerkId, tx.id);
      txId = tx.id;
    } else {
      const txResult = db.prepare(`
        INSERT INTO transactions (member_id, counter, clerk_id, service_start_time)
        VALUES (?, ?, ?, datetime('now','localtime'))
      `).run(id, effectiveCounter, effectiveClerkId);
      txId = txResult.lastInsertRowid;
    }

    const updatedMember = db.prepare('SELECT * FROM members WHERE id = ?').get(id);

    io.to('admin').emit('member:claimed', { memberId: id, clerkId: effectiveClerkId });
    io.to('counter-pool').emit('member:claimed', { memberId: id, clerkId: effectiveClerkId });
    io.to('admin').emit('member:updated', updatedMember);
    io.to('counter-pool').emit('member:updated', updatedMember);

    res.json({ success: true, member: updatedMember, transaction_id: txId });
  });

  return router;
};
