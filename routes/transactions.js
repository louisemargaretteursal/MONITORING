const express = require('express');
const db = require('../database/db');

module.exports = (io, activeStations) => {
  const router = express.Router();

  // POST conclude a transaction
  router.post('/:id/conclude', (req, res) => {
    const { id } = req.params;
    const { outcome, rating, remarks, member_id, confirmed_transaction_type, clerk_instructions, sss_number } = req.body;

    if (!outcome) {
      return res.status(400).json({ error: 'Outcome is required.' });
    }

    const now = new Date();
    const nowStr = now.toISOString().replace('T', ' ').slice(0, 19);

    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found.' });

    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(member_id || tx.member_id);
    const clerk = tx.clerk_id ? db.prepare('SELECT * FROM clerks WHERE id = ?').get(tx.clerk_id) : null;

    const startTime = new Date(tx.service_start_time);
    const durationMins = ((now - startTime) / 60000).toFixed(1);

    // If clerk added or updated the SSS Number, update the member's record
    if (sss_number && (member_id || tx.member_id)) {
      db.prepare('UPDATE members SET sss_number = ? WHERE id = ?').run(sss_number, member_id || tx.member_id);
    }

    db.prepare(`
      UPDATE transactions
      SET service_end_time = ?, duration_minutes = ?, outcome = ?, rating = COALESCE(?, rating), remarks = ?,
          confirmed_transaction_type = ?, clerk_instructions = ?
      WHERE id = ?
    `).run(nowStr, durationMins, outcome, rating || null, remarks || null,
           confirmed_transaction_type || null, clerk_instructions || null, id);

    const finalStatus = outcome === 'for-verification' ? 'on-hold' : 'done';
    db.prepare('UPDATE members SET status = ? WHERE id = ?').run(finalStatus, member_id || tx.member_id);

    // Auto-mark any linked BAS appointment as done (works even if clerk served from walk-in pool)
    db.prepare(`
      UPDATE appointments SET arrival_status = 'done'
      WHERE member_id = ? AND arrival_status = 'in-lobby'
    `).run(member_id || tx.member_id);

    const updatedTx = db.prepare(`
      SELECT t.*, m.name, m.queue_number, m.sss_number, m.transaction_type, m.entry_type,
             c.name as clerk_name, c.counter as clerk_counter
      FROM transactions t
      JOIN members m ON t.member_id = m.id
      LEFT JOIN clerks c ON t.clerk_id = c.id
      WHERE t.id = ?
    `).get(id);

    // Broadcast conclusion to admin and counters
    io.to('admin').emit('transaction:concluded', updatedTx);
    io.to('counter-pool').emit('transaction:concluded', updatedTx);

    // Trigger survey prompt on customer-facing rating tablet for this desk
    let counterDesk = tx.counter;
    if (!counterDesk || counterDesk === 'counter-pool' || counterDesk === 'portal-pool' || counterDesk === 'Main Counter' || counterDesk === 'Branch Staff') {
      if (global.activeStations) {
        for (const [stName, stData] of global.activeStations.entries()) {
          if (stData.clerkId === tx.clerk_id) {
            counterDesk = stName;
            break;
          }
        }
      }
    }
    if (!counterDesk) counterDesk = clerk ? (clerk.active_station || clerk.counter) : 'Counter 1';

    const promptPayload = {
      txId: id,
      memberId: member_id || tx.member_id,
      queueNumber: member ? member.queue_number : '—',
      memberName: member ? member.name : 'Citizen',
      clerkName: clerk ? clerk.name : 'Officer on Duty',
      counter: counterDesk
    };

    io.emit('survey:prompt', promptPayload);

    res.json({ success: true, transaction: updatedTx });
  });

  // POST submit citizen rating from tablet or E-Center on-screen survey
  router.post('/:id/rating', (req, res) => {
    const { id } = req.params;
    const {
      rating, star, reason, counter,
      nps_score, feedback_category, comments, comm_consent,
      contact_mobile, contact_email, customer_type, sex, age, region
    } = req.body;

    if (!rating) {
      return res.status(400).json({ error: 'Rating value is required.' });
    }

    try {
      const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
      if (!tx) return res.status(404).json({ error: 'Transaction not found.' });

      const npsVal = nps_score ? parseInt(nps_score) : (star ? Math.min(10, Math.max(1, star * 2)) : (rating === 'happy' ? 10 : rating === 'neutral' ? 6 : 2));

      db.prepare(`
        UPDATE transactions
        SET rating = ?,
            feedback_reason = COALESCE(?, feedback_reason),
            nps_score = COALESCE(?, nps_score),
            feedback_category = COALESCE(?, feedback_category),
            comments = COALESCE(?, comments),
            comm_consent = COALESCE(?, comm_consent)
        WHERE id = ?
      `).run(rating, reason || null, npsVal, feedback_category || null, comments || null, comm_consent || 'agree', id);

      // Optionally update member demographics if provided
      if (tx.member_id && (customer_type || sex || age || region || contact_mobile || contact_email)) {
        db.prepare(`
          UPDATE members
          SET customer_type = COALESCE(?, customer_type),
              sex = COALESCE(?, sex),
              age = COALESCE(?, age),
              region = COALESCE(?, region),
              contact_mobile = COALESCE(?, contact_mobile),
              contact_email = COALESCE(?, contact_email)
          WHERE id = ?
        `).run(
          customer_type || null, sex || null, age ? parseInt(age) : null,
          region || null, contact_mobile || null, contact_email || null, tx.member_id
        );
      }

      const updated = db.prepare(`
        SELECT t.*, m.name, m.queue_number, m.customer_type, m.sex, m.age, m.region, c.name as clerk_name
        FROM transactions t
        JOIN members m ON t.member_id = m.id
        LEFT JOIN clerks c ON t.clerk_id = c.id
        WHERE t.id = ?
      `).get(id);

      io.to('admin').emit('transaction:rated', {
        txId: id, rating, star, reason, nps_score: npsVal,
        feedback_category, comments, counter, transaction: updated
      });
      if (tx.clerk_id) {
        io.to(`clerk-${tx.clerk_id}`).emit('transaction:rated', { txId: id, rating, star, reason, nps_score: npsVal });
      }

      res.json({ success: true, transaction: updated });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET today's transaction stats
  router.get('/stats/today', (req, res) => {
    const today = new Date().toISOString().split('T')[0];

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        ROUND(AVG(wait_time_minutes), 2) as avg_wait,
        ROUND(AVG(duration_minutes), 2) as avg_duration,
        SUM(CASE WHEN outcome = 'finished' THEN 1 ELSE 0 END) as finished,
        SUM(CASE WHEN outcome = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN outcome = 'for-appointment' THEN 1 ELSE 0 END) as for_appointment,
        SUM(CASE WHEN outcome = 'for-verification' THEN 1 ELSE 0 END) as for_verification,
        SUM(CASE WHEN rating = 'happy' THEN 1 ELSE 0 END) as happy,
        SUM(CASE WHEN rating = 'neutral' THEN 1 ELSE 0 END) as neutral,
        SUM(CASE WHEN rating = 'sad' THEN 1 ELSE 0 END) as sad
      FROM transactions WHERE date = ?
    `).get(today);

    const byCounter = db.prepare(`
      SELECT t.counter, t.clerk_id,
        COALESCE(c.name, 'OJT Assistant') as clerk_name,
        COUNT(*) as served,
        ROUND(AVG(t.wait_time_minutes), 2) as avg_wait,
        ROUND(AVG(t.duration_minutes), 2) as avg_duration,
        ROUND(AVG(CASE WHEN t.rating = 'happy' THEN 5 WHEN t.rating = 'neutral' THEN 3 WHEN t.rating = 'sad' THEN 1 END), 2) as avg_rating,
        SUM(CASE WHEN t.outcome = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM transactions t
      LEFT JOIN clerks c ON t.clerk_id = c.id
      WHERE t.date = ?
      GROUP BY t.counter, t.clerk_id
    `).all(today);

    // Enriched currently serving: includes queue #, start time, desk, clerk
    const currentlyServing = db.prepare(`
      SELECT m.id as member_id, m.name as member_name, m.queue_number, m.transaction_type,
             m.routed_to, m.claimed_by as clerk_id,
             t.counter, t.service_start_time, c.name as clerk_name
      FROM members m
      LEFT JOIN transactions t ON t.member_id = m.id AND t.service_end_time IS NULL
      LEFT JOIN clerks c ON m.claimed_by = c.id
      WHERE m.date = ? AND m.status = 'being-served'
    `).all(today);

    // Active long-wait alerts (> 20 mins)
    const longWaiting = db.prepare(`
      SELECT id, name, queue_number, transaction_type, routed_to, check_in_time,
             ROUND((julianday('now', 'localtime') - julianday(check_in_time)) * 24 * 60, 1) as wait_minutes
      FROM members
      WHERE date = ? AND status = 'waiting'
        AND ((julianday('now', 'localtime') - julianday(check_in_time)) * 24 * 60) >= 20
      ORDER BY wait_minutes DESC
    `).all(today);

    // All non-admin clerks for the grid
    const allClerks = db.prepare(`
      SELECT id, name, counter FROM clerks WHERE counter != 'Admin' ORDER BY counter, name
    `).all();

    const hourly = db.prepare(`
      SELECT strftime('%H', check_in_time) as hour, COUNT(*) as count
      FROM members WHERE date = ?
      GROUP BY hour ORDER BY hour
    `).all(today);

    const waiting = db.prepare(`
      SELECT COUNT(*) as count FROM members
      WHERE date = ? AND status IN ('waiting', 'being-served', 'on-hold')
    `).get(today);

    const activeStationsMap = req.app.get('activeStations');
    const activePresence = activeStationsMap ? Array.from(activeStationsMap.values()) : [];
    res.json({ stats, byCounter, currentlyServing, allClerks, hourly, waiting, longWaiting, activePresence });
  });

  // GET transactions for a date range (for weekly/monthly reports)
  router.get('/range', (req, res) => {
    const { from, to } = req.query;
    const transactions = db.prepare(`
      SELECT t.*, m.name, m.queue_number, m.sss_number, m.transaction_type, m.routed_to, m.entry_type, m.is_rerouted,
             c.name as clerk_name, c.counter as clerk_counter
      FROM transactions t
      JOIN members m ON t.member_id = m.id
      LEFT JOIN clerks c ON t.clerk_id = c.id
      WHERE t.date BETWEEN ? AND ?
      ORDER BY t.id DESC
    `).all(from, to);
    res.json(transactions);
  });

  // GET search transactions with flexible filters (query, date, from, to, counter, outcome, tx_type, channel, rating, limit)
  router.get('/search', (req, res) => {
    const { q, date, from, to, counter, outcome, tx_type, channel, rating, clerk_id, limit = 200 } = req.query;
    let sql = `
      SELECT t.*, m.name, m.queue_number, m.sss_number, m.transaction_type, m.routed_to, m.entry_type, m.is_rerouted,
             c.name as clerk_name, c.counter as clerk_counter
      FROM transactions t
      JOIN members m ON t.member_id = m.id
      LEFT JOIN clerks c ON t.clerk_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (from && to) {
      sql += ' AND t.date BETWEEN ? AND ?';
      params.push(from, to);
    } else if (date) {
      sql += ' AND t.date = ?';
      params.push(date);
    }

    if (clerk_id) {
      sql += ' AND t.clerk_id = ?';
      params.push(clerk_id);
    }

    if (counter) {
      if (counter.includes('PACD')) {
        sql += " AND (t.counter LIKE '%PACD%' OR m.routed_to = 'pacd')";
      } else if (counter.includes('E-Center')) {
        sql += " AND (t.counter LIKE '%E-Center%' OR m.routed_to = 'ecenter')";
      } else if (counter === 'Counter 1') {
        sql += " AND (t.counter = 'Counter 1' OR t.counter = 'Main Counter' OR t.counter = 'Branch Staff')";
      } else {
        sql += ' AND t.counter LIKE ?';
        params.push(`%${counter}%`);
      }
    }

    if (outcome) {
      sql += ' AND t.outcome = ?';
      params.push(outcome);
    }

    if (channel) {
      if (channel === 'walk-in') {
        sql += " AND (m.entry_type = 'walk-in' OR m.entry_type IS NULL)";
      } else if (channel === 'direct' || channel === 'bas') {
        sql += " AND m.entry_type IN ('direct-appointment', 'appointment', 'direct')";
      } else if (channel === 'portal') {
        sql += " AND m.entry_type IN ('portal-appointment', 'portal-pool', 'portal')";
      }
    }

    if (rating) {
      sql += ' AND t.rating = ?';
      params.push(rating);
    }

    if (tx_type && tx_type.trim()) {
      const term = `%${tx_type.trim()}%`;
      sql += ' AND (t.confirmed_transaction_type LIKE ? OR m.transaction_type LIKE ?)';
      params.push(term, term);
    }

    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      sql += ' AND (m.name LIKE ? OR m.queue_number LIKE ? OR m.sss_number LIKE ? OR t.remarks LIKE ? OR t.confirmed_transaction_type LIKE ? OR m.transaction_type LIKE ?)';
      params.push(term, term, term, term, term, term);
    }

    sql += ' ORDER BY t.id DESC LIMIT ?';
    params.push(parseInt(limit, 10) || 200);

    try {
      const results = db.prepare(sql).all(...params);
      res.json(results);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET active transaction types for dynamic filter population
  router.get('/active-types', (req, res) => {
    const { date, from, to, counter } = req.query;
    let sql = `
      SELECT 
        COALESCE(t.confirmed_transaction_type, m.transaction_type) as tx_type,
        COUNT(*) as total,
        SUM(CASE WHEN t.outcome = 'finished' THEN 1 ELSE 0 END) as accepted,
        SUM(CASE WHEN t.outcome != 'finished' OR t.outcome IS NULL THEN 1 ELSE 0 END) as rejected
      FROM transactions t
      JOIN members m ON t.member_id = m.id
      WHERE 1=1
    `;
    const params = [];

    if (from && to) {
      sql += ' AND t.date BETWEEN ? AND ?';
      params.push(from, to);
    } else if (date) {
      sql += ' AND t.date = ?';
      params.push(date);
    }

    if (counter) {
      if (counter.includes('PACD')) {
        sql += " AND (t.counter LIKE '%PACD%' OR m.routed_to = 'pacd')";
      } else if (counter.includes('E-Center')) {
        sql += " AND (t.counter LIKE '%E-Center%' OR m.routed_to = 'ecenter')";
      } else if (counter === 'Counter 1') {
        sql += " AND (t.counter = 'Counter 1' OR t.counter = 'Main Counter' OR t.counter = 'Branch Staff')";
      } else {
        sql += ' AND t.counter LIKE ?';
        params.push(`%${counter}%`);
      }
    }

    sql += " GROUP BY tx_type HAVING tx_type IS NOT NULL AND tx_type != '' ORDER BY total DESC, tx_type ASC";

    try {
      const rows = db.prepare(sql).all(...params);
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
};
