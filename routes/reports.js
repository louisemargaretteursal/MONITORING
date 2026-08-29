const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../database/db');

module.exports = () => {
  const router = express.Router();

  // GET daily report
  router.get('/daily', (req, res) => {
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const stats = buildDailyStats(date);
    res.json(stats);
  });

  // GET weekly report
  router.get('/weekly', (req, res) => {
    const endDate = req.query.end || new Date().toISOString().split('T')[0];
    const end = new Date(endDate);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    const startDate = start.toISOString().split('T')[0];

    const stats = buildRangeStats(startDate, endDate);
    const daily = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayStats = buildDailyStats(dateStr);
      daily.push({ date: dateStr, ...dayStats.summary });
    }
    res.json({ range: { from: startDate, to: endDate }, summary: stats, daily });
  });

  // GET monthly report
  router.get('/monthly', (req, res) => {
    const { year, month } = req.query;
    const y = year || new Date().getFullYear();
    const m = month || (new Date().getMonth() + 1);
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const end = new Date(y, m, 0);
    const endDate = end.toISOString().split('T')[0];

    const stats = buildRangeStats(startDate, endDate);
    res.json({ range: { from: startDate, to: endDate }, ...stats });
  });

  // GET summary report (alias for date or custom date range)
  router.get('/summary', (req, res) => {
    const { from, to, date } = req.query;
    if (from && to) {
      const stats = buildRangeStats(from, to);
      return res.json({ range: { from, to }, stats: stats.summary, summary: stats.summary, ...stats });
    }
    const targetDate = date || new Date().toISOString().split('T')[0];
    const stats = buildDailyStats(targetDate);
    res.json({ date: targetDate, stats: stats.summary, summary: stats.summary, ...stats });
  });

  // GET custom date range report
  router.get('/custom', (req, res) => {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'Both from and to query parameters (YYYY-MM-DD) are required.' });
    }
    const stats = buildRangeStats(from, to);
    res.json({ range: { from, to }, stats: stats.summary, summary: stats.summary, ...stats });
  });

  // GET download database backup (.db file)
  router.get('/backup/db', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const dbPath = path.join(__dirname, '..', 'database', 'sss_toledo.db');
    if (!fs.existsSync(dbPath)) {
      return res.status(404).json({ error: 'Database file not found.' });
    }
    const today = new Date().toISOString().split('T')[0];
    const filename = `sss_toledo_backup_${today}.db`;
    res.download(dbPath, filename, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ error: 'Failed to download database backup.' });
      }
    });
  });

  function buildDailyStats(date) {
    const summary = db.prepare(`
      SELECT
        COUNT(*) as total_served,
        ROUND(AVG(wait_time_minutes), 2) as avg_wait,
        ROUND(AVG(duration_minutes), 2) as avg_duration,
        SUM(CASE WHEN outcome = 'finished' THEN 1 ELSE 0 END) as finished,
        SUM(CASE WHEN outcome = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN outcome = 'for-appointment' THEN 1 ELSE 0 END) as for_appointment,
        SUM(CASE WHEN outcome = 'for-verification' THEN 1 ELSE 0 END) as for_verification,
        SUM(CASE WHEN rating = 'happy' THEN 1 ELSE 0 END) as happy,
        SUM(CASE WHEN rating = 'neutral' THEN 1 ELSE 0 END) as neutral,
        SUM(CASE WHEN rating = 'sad' THEN 1 ELSE 0 END) as sad,
        ROUND(AVG(CASE WHEN rating = 'happy' THEN 5 WHEN rating = 'neutral' THEN 3 WHEN rating = 'sad' THEN 1 END), 1) as avg_rating
      FROM transactions WHERE date = ?
    `).get(date);

    const byCounter = db.prepare(`
      SELECT t.counter, c.name as clerk_name,
        COUNT(*) as served,
        ROUND(AVG(t.wait_time_minutes), 1) as avg_wait,
        ROUND(AVG(t.duration_minutes), 1) as avg_duration,
        ROUND(AVG(CASE WHEN t.rating = 'happy' THEN 5 WHEN t.rating = 'neutral' THEN 3 WHEN t.rating = 'sad' THEN 1 END), 1) as avg_rating,
        SUM(CASE WHEN t.outcome = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM transactions t
      LEFT JOIN clerks c ON t.clerk_id = c.id
      WHERE t.date = ?
      GROUP BY t.counter, t.clerk_id
    `).all(date);

    const hourly = db.prepare(`
      SELECT strftime('%H', check_in_time) as hour, COUNT(*) as count
      FROM members WHERE date = ?
      GROUP BY hour ORDER BY hour
    `).all(date);

    const byTransactionType = db.prepare(`
      SELECT COALESCE(t.confirmed_transaction_type, m.transaction_type) as transaction_type, COUNT(*) as count
      FROM transactions t JOIN members m ON t.member_id = m.id
      WHERE t.date = ?
      GROUP BY COALESCE(t.confirmed_transaction_type, m.transaction_type) ORDER BY count DESC
    `).all(date);

    const noShows = db.prepare(`
      SELECT COUNT(*) as count FROM appointments
      WHERE date = ? AND arrival_status = 'no-show'
    `).get(date);

    return { date, summary, byCounter, hourly, byTransactionType, noShows };
  }

  function buildRangeStats(from, to) {
    const summary = db.prepare(`
      SELECT
        COUNT(*) as total_served,
        ROUND(AVG(wait_time_minutes), 2) as avg_wait,
        ROUND(AVG(duration_minutes), 2) as avg_duration,
        SUM(CASE WHEN outcome = 'finished' THEN 1 ELSE 0 END) as finished,
        SUM(CASE WHEN outcome = 'rejected' THEN 1 ELSE 0 END) as rejected,
        SUM(CASE WHEN outcome = 'for-appointment' THEN 1 ELSE 0 END) as for_appointment,
        SUM(CASE WHEN outcome = 'for-verification' THEN 1 ELSE 0 END) as for_verification,
        SUM(CASE WHEN rating = 'happy' THEN 1 ELSE 0 END) as happy,
        SUM(CASE WHEN rating = 'neutral' THEN 1 ELSE 0 END) as neutral,
        SUM(CASE WHEN rating = 'sad' THEN 1 ELSE 0 END) as sad,
        ROUND(AVG(CASE WHEN rating = 'happy' THEN 5 WHEN rating = 'neutral' THEN 3 WHEN rating = 'sad' THEN 1 END), 1) as avg_rating
      FROM transactions WHERE date BETWEEN ? AND ?
    `).get(from, to);

    const byCounter = db.prepare(`
      SELECT t.counter, c.name as clerk_name,
        COUNT(*) as served,
        ROUND(AVG(t.wait_time_minutes), 1) as avg_wait,
        ROUND(AVG(t.duration_minutes), 1) as avg_duration,
        ROUND(AVG(CASE WHEN t.rating = 'happy' THEN 5 WHEN t.rating = 'neutral' THEN 3 WHEN t.rating = 'sad' THEN 1 END), 2) as avg_rating,
        SUM(CASE WHEN t.outcome = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM transactions t LEFT JOIN clerks c ON t.clerk_id = c.id
      WHERE t.date BETWEEN ? AND ?
      GROUP BY t.counter, t.clerk_id ORDER BY served DESC
    `).all(from, to);

    const byTransactionType = db.prepare(`
      SELECT COALESCE(t.confirmed_transaction_type, m.transaction_type) as transaction_type, COUNT(*) as count
      FROM transactions t JOIN members m ON t.member_id = m.id
      WHERE t.date BETWEEN ? AND ?
      GROUP BY COALESCE(t.confirmed_transaction_type, m.transaction_type) ORDER BY count DESC
    `).all(from, to);

    return { summary, byCounter, byTransactionType };
  }

  // GET clerk's personal service log for today (for end-of-day output)
  router.get('/clerk/:id/today', (req, res) => {
    const { id } = req.params;
    const date = req.query.date || new Date().toISOString().split('T')[0];
    const isOjt = id === 'ojt' || id === '0' || id === 'null' || id === 'undefined';

    const records = isOjt
      ? db.prepare(`
          SELECT
            t.id as tx_id,
            m.queue_number,
            m.name,
            m.sss_number,
            m.transaction_type,
            m.entry_type,
            m.check_in_time,
            t.service_start_time,
            t.service_end_time,
            t.wait_time_minutes,
            t.duration_minutes,
            t.outcome,
            t.rating,
            t.remarks,
            t.feedback_reason,
            t.counter,
            t.confirmed_transaction_type,
            t.clerk_instructions,
            COALESCE(a.is_late, 0) as is_late
          FROM transactions t
          JOIN members m ON t.member_id = m.id
          LEFT JOIN appointments a ON a.member_id = m.id
          WHERE (t.clerk_id IS NULL OR t.counter LIKE 'E-Center%') AND t.date = ?
            AND t.service_end_time IS NOT NULL
          ORDER BY t.service_start_time ASC
        `).all(date)
      : db.prepare(`
          SELECT
            t.id as tx_id,
            m.queue_number,
            m.name,
            m.sss_number,
            m.transaction_type,
            m.entry_type,
            m.check_in_time,
            t.service_start_time,
            t.service_end_time,
            t.wait_time_minutes,
            t.duration_minutes,
            t.outcome,
            t.rating,
            t.remarks,
            t.feedback_reason,
            t.counter,
            t.confirmed_transaction_type,
            t.clerk_instructions,
            COALESCE(a.is_late, 0) as is_late
          FROM transactions t
          JOIN members m ON t.member_id = m.id
          LEFT JOIN appointments a ON a.member_id = m.id
          WHERE t.clerk_id = ? AND t.date = ?
            AND t.service_end_time IS NOT NULL
          ORDER BY t.service_start_time ASC
        `).all(id, date);

    const summary = {
      total: records.length,
      finished: records.filter(r => r.outcome === 'finished').length,
      rejected: records.filter(r => r.outcome === 'rejected').length,
      for_appointment: records.filter(r => r.outcome === 'for-appointment').length,
      happy: records.filter(r => r.rating === 'happy').length,
      neutral: records.filter(r => r.rating === 'neutral').length,
      sad: records.filter(r => r.rating === 'sad').length,
      avg_duration: records.length
        ? (records.reduce((s, r) => s + (r.duration_minutes || 0), 0) / records.length).toFixed(1)
        : 0,
      avg_wait: records.length
        ? (records.reduce((s, r) => s + (r.wait_time_minutes || 0), 0) / records.length).toFixed(1)
        : 0
    };

    // Also fetch all appointments for this clerk on this date with their transaction status
    const apptsQuery = isOjt
      ? `
        SELECT a.*,
               COALESCE(c.name, 'OJT Assistant') as clerk_name,
               COALESCE(a.counter, c.counter, 'E-Center') as counter_name,
               m.queue_number,
               m.sss_number,
               m.check_in_time,
               t.service_start_time,
               t.service_end_time,
               t.duration_minutes,
               t.wait_time_minutes,
               t.outcome,
               t.rating,
               t.remarks,
               t.feedback_reason,
               t.clerk_instructions,
               t.confirmed_transaction_type,
               CASE
                 WHEN a.arrival_status = 'done' OR t.outcome IS NOT NULL THEN 'Served'
                 WHEN a.arrival_status = 'no-show' THEN 'No-Show'
                 WHEN a.arrival_status = 'in-lobby' THEN 'In Lobby'
                 ELSE 'Pending'
               END as computed_status
        FROM appointments a
        LEFT JOIN clerks c ON a.clerk_id = c.id
        LEFT JOIN members m ON a.member_id = m.id
        LEFT JOIN transactions t ON t.member_id = m.id
        WHERE a.date = ?
        ORDER BY a.appointment_time ASC
      `
      : `
        SELECT a.*,
               COALESCE(c.name, 'Assigned Officer') as clerk_name,
               COALESCE(a.counter, c.counter, 'Counter 1') as counter_name,
               m.queue_number,
               m.sss_number,
               m.check_in_time,
               t.service_start_time,
               t.service_end_time,
               t.duration_minutes,
               t.wait_time_minutes,
               t.outcome,
               t.rating,
               t.remarks,
               t.feedback_reason,
               t.clerk_instructions,
               t.confirmed_transaction_type,
               CASE
                 WHEN a.arrival_status = 'done' OR t.outcome IS NOT NULL THEN 'Served'
                 WHEN a.arrival_status = 'no-show' THEN 'No-Show'
                 WHEN a.arrival_status = 'in-lobby' THEN 'In Lobby'
                 ELSE 'Pending'
               END as computed_status
        FROM appointments a
        LEFT JOIN clerks c ON a.clerk_id = c.id
        LEFT JOIN members m ON a.member_id = m.id
        LEFT JOIN transactions t ON t.member_id = m.id
        WHERE a.clerk_id = ? AND a.date = ?
        ORDER BY a.appointment_time ASC
      `;

    const appointments = isOjt
      ? db.prepare(apptsQuery).all(date)
      : db.prepare(apptsQuery).all(id, date);

    res.json({ date, records, summary, appointments });
  });

  // ── CSV Helper ─────────────────────────────────────────────────────────────
  function escapeCSV(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function buildCSV(headers, rows) {
    const headRow = headers.map(h => escapeCSV(h)).join(',');
    const bodyRows = rows.map(r => headers.map(h => escapeCSV(r[h])).join(','));
    return [headRow, ...bodyRows].join('\r\n');
  }

  // ── LIVE EXCEL FEEDS (Power Query / Web Query / One-Click Export) ─────────
  // 1. Transactions Feed & Export
  router.get('/feed/transactions.csv', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const isAll = req.query.all === '1' || req.query.all === 'true';
    const fromDate = req.query.from;
    const toDate = req.query.to;
    const targetDate = req.query.date || (!fromDate ? today : null);
    const clerkId = req.query.clerk_id;
    const isDownload = req.query.download === '1' || req.query.download === 'true';

    let query = `
      SELECT
        t.date as "Date",
        m.queue_number as "Queue Number",
        m.name as "Member Name",
        m.sss_number as "SSS Number",
        CASE
          WHEN m.entry_type = 'walk-in' THEN 'Walk-In'
          WHEN m.entry_type = 'portal-appointment' THEN 'Portal Appointment'
          WHEN m.entry_type = 'direct-appointment' THEN 'BAS Appointment'
          ELSE m.entry_type
        END as "Entry Type",
        COALESCE(t.confirmed_transaction_type, m.transaction_type, '—') as "Transaction Type",
        COALESCE(c.name, 'OJT Assistant') as "Clerk Name",
        COALESCE(t.counter, '—') as "Counter",
        m.check_in_time as "Check-in Time",
        t.service_start_time as "Service Start",
        t.service_end_time as "Service End",
        t.wait_time_minutes as "Wait Time (min)",
        t.duration_minutes as "Service Duration (min)",
        CASE
          WHEN t.outcome = 'finished' THEN 'Finished'
          WHEN t.outcome = 'rejected' THEN 'Rejected'
          WHEN t.outcome = 'for-verification' THEN 'For Verification (On Hold)'
          WHEN t.outcome = 'for-appointment' THEN 'For Appointment'
          ELSE COALESCE(t.outcome, '—')
        END as "Outcome",
        CASE
          WHEN t.rating = 'happy' THEN 'Satisfied (5/5)'
          WHEN t.rating = 'neutral' THEN 'Neutral (3/5)'
          WHEN t.rating = 'sad' THEN 'Unsatisfied (1/5)'
          ELSE COALESCE(t.rating, '—')
        END as "Satisfaction",
        COALESCE(t.remarks, '') as "Remarks",
        COALESCE(t.clerk_instructions, '') as "Instructions for Member",
        CASE WHEN a.is_late = 1 THEN 'Yes' ELSE 'No' END as "Late Arrival"
      FROM transactions t
      JOIN members m ON t.member_id = m.id
      LEFT JOIN clerks c ON t.clerk_id = c.id
      LEFT JOIN appointments a ON a.member_id = m.id
    `;

    const whereClauses = [];
    const params = [];

    if (clerkId) {
      whereClauses.push('t.clerk_id = ?');
      params.push(clerkId);
    }

    if (fromDate && toDate) {
      whereClauses.push('t.date BETWEEN ? AND ?');
      params.push(fromDate, toDate);
    } else if (targetDate && !isAll) {
      whereClauses.push('t.date = ?');
      params.push(targetDate);
    }

    if (whereClauses.length > 0) {
      query += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    query += ` ORDER BY t.date DESC, t.service_start_time DESC`;

    const rows = db.prepare(query).all(...params);

    const headers = [
      'Date', 'Queue Number', 'Member Name', 'SSS Number', 'Entry Type',
      'Transaction Type', 'Clerk Name', 'Counter', 'Check-in Time',
      'Service Start', 'Service End', 'Wait Time (min)', 'Service Duration (min)',
      'Outcome', 'Satisfaction', 'Remarks', 'Instructions for Member', 'Late Arrival'
    ];

    const filename = `sss_transactions_${fromDate && toDate ? `${fromDate}_to_${toDate}` : (isAll ? 'all' : targetDate)}.csv`;
    const csvData = '\uFEFF' + buildCSV(headers, rows); // UTF-8 BOM for Excel
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `${isDownload ? 'attachment' : 'inline'}; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(csvData);
  });

  // 2. Live Clerk Performance Feed
  router.get('/feed/clerks.csv', (req, res) => {
    const today = req.query.date || new Date().toISOString().split('T')[0];
    const isDownload = req.query.download === '1' || req.query.download === 'true';

    const rows = db.prepare(`
      SELECT
        c.name as "Clerk Name",
        c.counter as "Counter",
        COUNT(t.id) as "Total Served",
        SUM(CASE WHEN t.outcome = 'finished' THEN 1 ELSE 0 END) as "Finished",
        SUM(CASE WHEN t.outcome = 'rejected' THEN 1 ELSE 0 END) as "Rejected",
        SUM(CASE WHEN t.outcome = 'for-appointment' THEN 1 ELSE 0 END) as "For Appointment",
        ROUND(AVG(t.duration_minutes), 2) as "Avg Duration (min)",
        ROUND(AVG(t.wait_time_minutes), 2) as "Avg Wait (min)",
        SUM(CASE WHEN t.rating = 'happy' THEN 1 ELSE 0 END) as "Satisfied Count",
        SUM(CASE WHEN t.rating = 'neutral' THEN 1 ELSE 0 END) as "Neutral Count",
        SUM(CASE WHEN t.rating = 'sad' THEN 1 ELSE 0 END) as "Unsatisfied Count",
        ROUND(AVG(CASE WHEN t.rating = 'happy' THEN 5 WHEN t.rating = 'neutral' THEN 3 WHEN t.rating = 'sad' THEN 1 END), 2) as "Avg Rating (out of 5)"
      FROM clerks c
      LEFT JOIN transactions t ON t.clerk_id = c.id AND t.date = ? AND t.service_end_time IS NOT NULL
      WHERE c.counter != 'Admin'
      GROUP BY c.id
      ORDER BY c.counter, c.name
    `).all(today);

    const headers = [
      'Clerk Name', 'Counter', 'Total Served', 'Finished', 'Rejected',
      'For Appointment', 'Avg Duration (min)', 'Avg Wait (min)',
      'Satisfied Count', 'Neutral Count', 'Unsatisfied Count', 'Avg Rating (out of 5)'
    ];

    const csvData = '\uFEFF' + buildCSV(headers, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `${isDownload ? 'attachment' : 'inline'}; filename="sss_clerk_performance_${today}.csv"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(csvData);
  });

  // 3. Live Hourly Traffic Feed
  router.get('/feed/hourly.csv', (req, res) => {
    const today = req.query.date || new Date().toISOString().split('T')[0];
    const isDownload = req.query.download === '1' || req.query.download === 'true';

    const rows = db.prepare(`
      SELECT
        strftime('%H:00', check_in_time) as "Hour",
        COUNT(*) as "Total Check-ins",
        SUM(CASE WHEN entry_type = 'walk-in' THEN 1 ELSE 0 END) as "Walk-Ins",
        SUM(CASE WHEN entry_type = 'portal-appointment' THEN 1 ELSE 0 END) as "Portal Appointments",
        SUM(CASE WHEN entry_type = 'direct-appointment' THEN 1 ELSE 0 END) as "BAS Appointments"
      FROM members
      WHERE date = ?
      GROUP BY strftime('%H', check_in_time)
      ORDER BY "Hour" ASC
    `).all(today);

    const headers = ['Hour', 'Total Check-ins', 'Walk-Ins', 'Portal Appointments', 'BAS Appointments'];

    const csvData = '\uFEFF' + buildCSV(headers, rows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `${isDownload ? 'attachment' : 'inline'}; filename="sss_hourly_traffic_${today}.csv"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(csvData);
  });

  // ── SSS SERVICE LOG MATRIX API (A / R / TOTAL) ───────────────────────────
  router.get('/matrix', (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const isAll = req.query.all === '1' || req.query.all === 'true';
      const fromDate = req.query.from;
      const toDate = req.query.to;
      const targetDate = req.query.date || (!fromDate && !isAll ? today : null);
      const counter = req.query.counter;

      let sql = `
        SELECT
          COALESCE(t.confirmed_transaction_type, m.transaction_type) as tx_type,
          COALESCE(c.name, 'Unassigned') as clerk_name,
          COALESCE(t.counter, c.counter, 'Counter 1') as counter,
          c.id as clerk_id,
          t.outcome
        FROM transactions t
        JOIN members m ON t.member_id = m.id
        LEFT JOIN clerks c ON t.clerk_id = c.id
        WHERE 1=1
      `;
      const params = [];
      if (fromDate && toDate) {
        sql += ' AND t.date BETWEEN ? AND ?';
        params.push(fromDate, toDate);
      } else if (targetDate && !isAll) {
        sql += ' AND t.date = ?';
        params.push(targetDate);
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

      const rows = db.prepare(sql).all(...params);

      // Get list of active clerks in this period
      const clerkMap = {};
      rows.forEach(r => {
        if (r.clerk_name && r.clerk_name !== 'Unassigned' && r.clerk_name !== 'Admin') {
          clerkMap[r.clerk_name] = r.counter || 'Counter';
        }
      });
      const clerks = Object.keys(clerkMap).sort();

      // Aggregate by transaction type
      const matrixMap = {};
      let grandTotalA = 0;
      let grandTotalR = 0;

      rows.forEach(r => {
        const type = r.tx_type || 'Unspecified Transaction';
        if (!matrixMap[type]) {
          matrixMap[type] = {
            tx_type: type,
            accepted: 0,
            rejected: 0,
            total: 0,
            byClerk: {}
          };
          clerks.forEach(cName => {
            matrixMap[type].byClerk[cName] = { accepted: 0, rejected: 0, total: 0 };
          });
        }

        const isAccepted = r.outcome === 'finished';
        if (isAccepted) {
          matrixMap[type].accepted += 1;
          grandTotalA += 1;
        } else {
          matrixMap[type].rejected += 1;
          grandTotalR += 1;
        }
        matrixMap[type].total += 1;

        if (r.clerk_name && matrixMap[type].byClerk[r.clerk_name]) {
          if (isAccepted) {
            matrixMap[type].byClerk[r.clerk_name].accepted += 1;
          } else {
            matrixMap[type].byClerk[r.clerk_name].rejected += 1;
          }
          matrixMap[type].byClerk[r.clerk_name].total += 1;
        }
      });

      const matrixList = Object.values(matrixMap).sort((a, b) => b.total - a.total);

      res.json({
        period: fromDate && toDate ? `${fromDate} to ${toDate}` : (isAll ? 'All Dates' : (targetDate || today)),
        clerks: clerks.map(name => ({ name, counter: clerkMap[name] })),
        matrix: matrixList,
        totals: {
          accepted: grandTotalA,
          rejected: grandTotalR,
          total: grandTotalA + grandTotalR
        }
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // ── STYLED EXCEL WORKBOOK EXPORT (.XLSX) ───────────────────────────────────
  router.get(['/export/excel', '/export/transactions.xlsx'], async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const isAll = req.query.all === '1' || req.query.all === 'true';
      const fromDate = req.query.from;
      const toDate = req.query.to;
      const targetDate = req.query.date || (!fromDate && !isAll ? today : null);
      const clerkId = req.query.clerk_id;
      const counter = req.query.counter;
      const outcome = req.query.outcome;
      const channel = req.query.channel || req.query.entry_type;
      const rating = req.query.rating;
      const txType = req.query.tx_type;
      const category = req.query.category;
      const q = req.query.q;

      let query = `
        SELECT
          t.id as tx_id,
          t.date,
          m.queue_number,
          m.name as member_name,
          m.sss_number,
          CASE
            WHEN m.entry_type = 'walk-in' THEN 'Walk-In'
            WHEN m.entry_type IN ('portal-appointment', 'portal-pool', 'portal') THEN 'Portal Appointment'
            WHEN m.entry_type IN ('direct-appointment', 'appointment', 'direct') THEN 'BAS Appointment'
            ELSE COALESCE(m.entry_type, 'Walk-In')
          END as entry_type,
          COALESCE(t.confirmed_transaction_type, m.transaction_type, '—') as tx_type,
          COALESCE(c.name, 'OJT Assistant') as clerk_name,
          COALESCE(t.counter, '—') as counter,
          m.check_in_time,
          t.service_start_time,
          t.service_end_time,
          t.wait_time_minutes,
          t.duration_minutes,
          CASE
            WHEN t.outcome = 'finished' THEN 'Finished'
            WHEN t.outcome = 'rejected' THEN 'Rejected'
            WHEN t.outcome = 'for-verification' THEN 'For Verification'
            WHEN t.outcome = 'for-appointment' THEN 'For Appointment'
            ELSE COALESCE(t.outcome, '—')
          END as outcome,
          CASE
            WHEN t.rating = 'happy' THEN 'Satisfied (5/5)'
            WHEN t.rating = 'neutral' THEN 'Neutral (3/5)'
            WHEN t.rating = 'sad' THEN 'Unsatisfied (1/5)'
            ELSE COALESCE(t.rating, '—')
          END as satisfaction,
          CASE
            WHEN t.feedback_reason IS NOT NULL AND t.remarks IS NOT NULL THEN t.feedback_reason || ' (' || t.remarks || ')'
            ELSE COALESCE(t.feedback_reason, t.remarks, '')
          END as remarks,
          COALESCE(t.feedback_reason, '') as feedback_reason,
          COALESCE(t.clerk_instructions, '') as clerk_instructions,
          CASE WHEN a.is_late = 1 THEN 'Yes' ELSE 'No' END as is_late
        FROM transactions t
        JOIN members m ON t.member_id = m.id
        LEFT JOIN clerks c ON t.clerk_id = c.id
        LEFT JOIN appointments a ON a.member_id = m.id
      `;

      const whereClauses = [];
      const params = [];

      if (clerkId) {
        whereClauses.push('t.clerk_id = ?');
        params.push(clerkId);
      }

      if (fromDate && toDate) {
        whereClauses.push('t.date BETWEEN ? AND ?');
        params.push(fromDate, toDate);
      } else if (targetDate && !isAll) {
        whereClauses.push('t.date = ?');
        params.push(targetDate);
      }

      if (counter) {
        if (counter.includes('PACD')) {
          whereClauses.push("(t.counter LIKE '%PACD%' OR m.routed_to = 'pacd')");
        } else if (counter.includes('E-Center')) {
          whereClauses.push("(t.counter LIKE '%E-Center%' OR m.routed_to = 'ecenter')");
        } else if (counter === 'Counter 1') {
          whereClauses.push("(t.counter = 'Counter 1' OR t.counter = 'Main Counter' OR t.counter = 'Branch Staff')");
        } else {
          whereClauses.push('t.counter LIKE ?');
          params.push(`%${counter}%`);
        }
      }

      if (outcome) {
        whereClauses.push('t.outcome = ?');
        params.push(outcome);
      }

      if (channel) {
        if (channel === 'walk-in') {
          whereClauses.push("(m.entry_type = 'walk-in' OR m.entry_type IS NULL)");
        } else if (channel === 'direct' || channel === 'bas') {
          whereClauses.push("m.entry_type IN ('direct-appointment', 'appointment', 'direct')");
        } else if (channel === 'portal') {
          whereClauses.push("m.entry_type IN ('portal-appointment', 'portal-pool', 'portal')");
        }
      }

      if (rating) {
        whereClauses.push('t.rating = ?');
        params.push(rating);
      }

      if (txType && txType.trim()) {
        const term = `%${txType.trim()}%`;
        whereClauses.push('(t.confirmed_transaction_type LIKE ? OR m.transaction_type LIKE ?)');
        params.push(term, term);
      }

      if (category && category.trim()) {
        const cat = category.toLowerCase();
        if (cat.includes('e-4') || cat.includes('member data')) {
          whereClauses.push("(t.confirmed_transaction_type LIKE '%E-4%' OR t.confirmed_transaction_type LIKE '%Web%' OR t.confirmed_transaction_type LIKE '%PDCR%' OR t.confirmed_transaction_type LIKE '%Cancellation%' OR t.confirmed_transaction_type LIKE '%T to P%' OR t.confirmed_transaction_type LIKE '%DOC%')");
        } else if (cat.includes('employer') || cat.includes('r-1') || cat.includes('r-8')) {
          whereClauses.push("(t.confirmed_transaction_type LIKE '%R-1%' OR t.confirmed_transaction_type LIKE '%R1-A%' OR t.confirmed_transaction_type LIKE '%R-8%' OR t.confirmed_transaction_type LIKE '%Separated EE%')");
        } else if (cat.includes('contribution') || cat.includes('prn')) {
          whereClauses.push("(t.confirmed_transaction_type LIKE '%Contribution%' OR t.confirmed_transaction_type LIKE '%PRN%' OR t.confirmed_transaction_type LIKE '%ADA%' OR t.confirmed_transaction_type LIKE '%PESO%' OR t.confirmed_transaction_type LIKE '%WISP%' OR t.confirmed_transaction_type LIKE '%Unpostables%')");
        } else if (cat.includes('loan')) {
          whereClauses.push("(t.confirmed_transaction_type LIKE '%Loan%' OR t.confirmed_transaction_type LIKE '%Salary Loan%')");
        } else if (cat.includes('benefit') || cat.includes('claim') || cat.includes('death') || cat.includes('funeral') || cat.includes('retire') || cat.includes('disability')) {
          whereClauses.push("(t.confirmed_transaction_type LIKE '%Funeral%' OR t.confirmed_transaction_type LIKE '%Death%' OR t.confirmed_transaction_type LIKE '%Retirement%' OR t.confirmed_transaction_type LIKE '%Disability%' OR t.confirmed_transaction_type LIKE '%Medical%' OR t.confirmed_transaction_type LIKE '%Check%')");
        } else if (cat.includes('inquiry') || cat.includes('verification') || cat.includes('acop')) {
          whereClauses.push("(t.confirmed_transaction_type LIKE '%Inquiry%' OR t.confirmed_transaction_type LIKE '%ACOP%' OR t.confirmed_transaction_type LIKE '%Verification%')");
        } else if (cat.includes('card') || cat.includes('umid') || cat.includes('admin')) {
          whereClauses.push("(t.confirmed_transaction_type LIKE '%UMID%' OR t.confirmed_transaction_type LIKE '%Blue Card%' OR t.confirmed_transaction_type LIKE '%Form%' OR t.confirmed_transaction_type LIKE '%Certification%' OR t.confirmed_transaction_type LIKE '%L-501%' OR t.confirmed_transaction_type LIKE '%DAEM%' OR t.confirmed_transaction_type LIKE '%Transmittal%' OR t.confirmed_transaction_type LIKE '%Correspondence%' OR t.confirmed_transaction_type LIKE '%Complaint%')");
        }
      }

      if (q && q.trim()) {
        const term = `%${q.trim()}%`;
        whereClauses.push('(m.name LIKE ? OR m.queue_number LIKE ? OR m.sss_number LIKE ? OR t.remarks LIKE ? OR t.confirmed_transaction_type LIKE ? OR m.transaction_type LIKE ?)');
        params.push(term, term, term, term, term, term);
      }

      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(' AND ')}`;
      }

      query += ` ORDER BY t.date DESC, t.service_start_time DESC`;

      const rows = db.prepare(query).all(...params);

      // Create Workbook
      const wb = new ExcelJS.Workbook();
      wb.creator = 'SSS Toledo Branch — BOMS System';
      wb.lastModifiedBy = 'SSS Branch Operations';
      wb.created = new Date();
      wb.modified = new Date();

      const NAVY_DARK = '1E3A8A';
      const SSS_BLUE = '005596';
      const SSS_LIGHT_BG = 'EFF6FF';
      const HEADER_BG = '0284C7';
      const BORDER_COLOR = 'CBD5E1';

      // ── HELPER: Build Standard Detailed Transaction Sheet ──
      function buildTransactionSheet(worksheet, sheetTitle, subtitle, dataRows) {
        worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 6, showGridLines: true }];
        worksheet.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

        // Banner
        worksheet.mergeCells('A1:R1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = `SOCIAL SECURITY SYSTEM — TOLEDO BRANCH | ${sheetTitle}`;
        titleCell.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY_DARK } };
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
        worksheet.getRow(1).height = 28;

        worksheet.mergeCells('A2:R2');
        const subCell = worksheet.getCell('A2');
        subCell.value = subtitle;
        subCell.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
        subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + SSS_BLUE } };
        subCell.alignment = { vertical: 'middle', horizontal: 'center' };
        worksheet.getRow(2).height = 20;

        // KPI Summary Row
        const totalCount = dataRows.length;
        const finishedCount = dataRows.filter(r => r.outcome === 'Finished').length;
        const rejectedCount = dataRows.filter(r => r.outcome === 'Rejected').length;
        const forVerifCount = dataRows.filter(r => r.outcome && r.outcome.includes('Verification')).length;
        const avgWait = totalCount ? (dataRows.reduce((a, b) => a + (parseFloat(b.wait_time_minutes) || 0), 0) / totalCount).toFixed(1) : '0.0';
        const avgDur = totalCount ? (dataRows.reduce((a, b) => a + (parseFloat(b.duration_minutes) || 0), 0) / totalCount).toFixed(1) : '0.0';

        worksheet.mergeCells('A4:C4');
        worksheet.getCell('A4').value = `Total Volume: ${totalCount}`;
        worksheet.getCell('A4').font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
        worksheet.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
        worksheet.getCell('A4').alignment = { vertical: 'middle', horizontal: 'center' };

        worksheet.mergeCells('D4:F4');
        worksheet.getCell('D4').value = `Finished: ${finishedCount} (${totalCount ? Math.round(finishedCount/totalCount*100) : 0}%)`;
        worksheet.getCell('D4').font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF15803D' } };
        worksheet.getCell('D4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
        worksheet.getCell('D4').alignment = { vertical: 'middle', horizontal: 'center' };

        worksheet.mergeCells('G4:I4');
        worksheet.getCell('G4').value = `Rejected / Pending: ${rejectedCount + forVerifCount}`;
        worksheet.getCell('G4').font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
        worksheet.getCell('G4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        worksheet.getCell('G4').alignment = { vertical: 'middle', horizontal: 'center' };

        worksheet.mergeCells('J4:L4');
        worksheet.getCell('J4').value = `Avg Wait: ${avgWait}m | Avg Svc: ${avgDur}m`;
        worksheet.getCell('J4').font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
        worksheet.getCell('J4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
        worksheet.getCell('J4').alignment = { vertical: 'middle', horizontal: 'center' };

        worksheet.getRow(4).height = 22;

        // Table Header
        const headers = [
          '#', 'Date', 'Ticket', 'Member Name', 'SSS Number', 'Channel',
          'Confirmed Transaction Type', 'Desk / Station', 'Officer / Clerk',
          'Check-In', 'Service Start', 'Service End', 'Wait (min)', 'Duration (min)',
          'Outcome', 'CSAT Satisfaction', 'Remarks', 'Officer Instructions'
        ];

        const headerRow = worksheet.getRow(6);
        headerRow.values = headers;
        headerRow.height = 26;
        headerRow.eachCell((cell) => {
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + HEADER_BG } };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          cell.border = {
            top: { style: 'medium', color: { argb: 'FF' + NAVY_DARK } },
            bottom: { style: 'medium', color: { argb: 'FF' + NAVY_DARK } },
            left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
            right: { style: 'thin', color: { argb: 'FFFFFFFF' } }
          };
        });

        // Set Native AutoFilter
        worksheet.autoFilter = {
          from: { row: 6, column: 1 },
          to: { row: 6, column: headers.length }
        };

        // Data Rows
        dataRows.forEach((r, idx) => {
          const row = worksheet.getRow(7 + idx);
          const checkIn = r.check_in_time ? r.check_in_time.split(' ')[1] || r.check_in_time : '—';
          const sStart = r.service_start_time ? r.service_start_time.split(' ')[1] || r.service_start_time : '—';
          const sEnd = r.service_end_time ? r.service_end_time.split(' ')[1] || r.service_end_time : '—';

          row.values = [
            idx + 1,
            r.date || '—',
            r.queue_number || '—',
            r.member_name || '—',
            r.sss_number || '—',
            r.entry_type || 'Walk-In',
            r.tx_type || '—',
            r.counter || '—',
            r.clerk_name || 'OJT Assistant',
            checkIn,
            sStart,
            sEnd,
            r.wait_time_minutes != null ? parseFloat(r.wait_time_minutes) : 0,
            r.duration_minutes != null ? parseFloat(r.duration_minutes) : 0,
            r.outcome || '—',
            r.satisfaction || '—',
            r.remarks || '',
            r.clerk_instructions || ''
          ];

          const sssCell = row.getCell(5);
          sssCell.numFmt = '@';

          const isEven = idx % 2 === 0;
          const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.font = { name: 'Segoe UI', size: 9 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
              left: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
              bottom: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
              right: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'left' };

            if ([1, 2, 3, 5, 6, 9, 10, 11, 12, 13, 14, 15, 16].includes(colNumber)) {
              cell.alignment = { vertical: 'middle', horizontal: 'center' };
            }
          });

          // Soft Color Fills on Outcome
          const outcomeCell = row.getCell(15);
          if (r.outcome === 'Finished') {
            outcomeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
            outcomeCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF15803D' } };
          } else if (r.outcome === 'Rejected') {
            outcomeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            outcomeCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFB91C1C' } };
          } else if (r.outcome && r.outcome.includes('Verification')) {
            outcomeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } };
            outcomeCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFA16207' } };
          } else if (r.outcome && r.outcome.includes('Appointment')) {
            outcomeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
            outcomeCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF1D4ED8' } };
          }

          // Soft Color Fills on CSAT Satisfaction
          const satCell = row.getCell(16);
          if (r.satisfaction && r.satisfaction.includes('Satisfied')) {
            satCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF15803D' } };
          } else if (r.satisfaction && r.satisfaction.includes('Unsatisfied')) {
            satCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            satCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFB91C1C' } };
          }

          if (r.clerk_instructions) {
            row.getCell(18).font = { name: 'Segoe UI', size: 9, italic: true, color: { argb: 'FF1D4ED8' } };
          }
        });

        // Column widths
        const columnWidths = [6, 12, 11, 24, 16, 18, 32, 20, 16, 12, 12, 12, 12, 14, 16, 18, 24, 28];
        columnWidths.forEach((w, i) => {
          worksheet.getColumn(i + 1).width = w;
        });
      }

      // ── SHEET 1: OFFICIAL SSS SERVICE LOG MATRIX (A / R / TOTAL) ──
      // This exactly matches the official SSS monthly/daily format with Blue header block and red totals
      const wsMatrix = wb.addWorksheet('SSS Service Matrix', { views: [{ state: 'frozen', xSplit: 2, ySplit: 4, showGridLines: true }] });
      
      const clerkObj = clerkId ? db.prepare('SELECT name, counter FROM clerks WHERE id = ?').get(clerkId) : null;
      const filterLabels = [];
      if (counter) filterLabels.push(`Desk: ${counter}`);
      if (outcome) filterLabels.push(`Outcome: ${outcome.toUpperCase()}`);
      if (channel) filterLabels.push(`Channel: ${channel.toUpperCase()}`);
      if (rating) filterLabels.push(`CSAT: ${rating.toUpperCase()}`);
      if (category) filterLabels.push(`Category: ${category}`);
      if (txType) filterLabels.push(`Type: ${txType}`);
      if (q) filterLabels.push(`Query: "${q}"`);
      const filterSuffix = filterLabels.length ? ` | Filters: [ ${filterLabels.join(' • ')} ]` : '';

      const subtitleText = clerkObj
        ? `Daily Service Log — ${clerkObj.name} (${clerkObj.counter}) | Date: ${targetDate || today}${filterSuffix}`
        : `Branch-Wide Service Monitoring Log | Date: ${fromDate && toDate ? `${fromDate} to ${toDate}` : (isAll ? 'ALL HISTORICAL DATES' : (targetDate || today))}${filterSuffix}`;

      // Get list of active clerks in the current result set
      const activeClerksMap = {};
      rows.forEach(r => {
        if (r.clerk_name && r.clerk_name !== 'Unassigned' && r.clerk_name !== 'Admin') {
          activeClerksMap[r.clerk_name] = r.counter || 'Counter';
        }
      });
      const activeClerkNames = Object.keys(activeClerksMap).sort();

      // Aggregate transaction types: overall and per clerk
      const txMatrix = {};
      rows.forEach(r => {
        const type = r.tx_type || 'Unspecified Transaction';
        if (!txMatrix[type]) {
          txMatrix[type] = {
            name: type,
            totalA: 0,
            totalR: 0,
            total: 0,
            clerks: {}
          };
          activeClerkNames.forEach(cName => {
            txMatrix[type].clerks[cName] = { a: 0, r: 0, total: 0 };
          });
        }

        const isA = r.outcome === 'Finished';
        if (isA) {
          txMatrix[type].totalA += 1;
        } else {
          txMatrix[type].totalR += 1;
        }
        txMatrix[type].total += 1;

        if (r.clerk_name && txMatrix[type].clerks[r.clerk_name]) {
          if (isA) txMatrix[type].clerks[r.clerk_name].a += 1;
          else txMatrix[type].clerks[r.clerk_name].r += 1;
          txMatrix[type].clerks[r.clerk_name].total += 1;
        }
      });

      const matrixRows = Object.values(txMatrix).sort((a, b) => b.total - a.total);

      // Matrix Title Banner (Blue Box as in SSS standard screenshot)
      const periodLabel = fromDate && toDate ? `${fromDate} to ${toDate}` : (isAll ? 'ALL HISTORICAL DATES' : (targetDate || today).toUpperCase());
      const totalMatrixCols = 5 + (activeClerkNames.length * 3);

      wsMatrix.mergeCells(1, 1, 2, 2);
      const mTopBox = wsMatrix.getCell('A1');
      mTopBox.value = `SSS TOLEDO\n${periodLabel}`;
      mTopBox.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      mTopBox.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY_DARK } };
      mTopBox.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

      wsMatrix.mergeCells(1, 3, 2, totalMatrixCols);
      const mTitle = wsMatrix.getCell('C1');
      mTitle.value = `SOCIAL SECURITY SYSTEM — DAILY SERVICE MATRIX (A / R / TOTAL)\n${subtitleText}`;
      mTitle.font = { name: 'Segoe UI', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      mTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + SSS_BLUE } };
      mTitle.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      wsMatrix.getRow(1).height = 22;
      wsMatrix.getRow(2).height = 22;

      // Group Headers Row 3
      wsMatrix.getCell('A3').value = 'No.';
      wsMatrix.getCell('B3').value = 'Transaction Type';

      wsMatrix.mergeCells('C3:E3');
      const branchTotalHeader = wsMatrix.getCell('C3');
      branchTotalHeader.value = 'OVERALL BRANCH VOLUME';
      branchTotalHeader.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
      branchTotalHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + SSS_BLUE } };
      branchTotalHeader.alignment = { vertical: 'middle', horizontal: 'center' };

      activeClerkNames.forEach((cName, cIdx) => {
        const startCol = 6 + (cIdx * 3);
        wsMatrix.mergeCells(3, startCol, 3, startCol + 2);
        const cHeader = wsMatrix.getCell(3, startCol);
        cHeader.value = `${cName} (${activeClerksMap[cName] || 'Staff'})`;
        cHeader.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF1E3A8A' } };
        cHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
        cHeader.alignment = { vertical: 'middle', horizontal: 'center' };
      });
      wsMatrix.getRow(3).height = 22;

      // Sub-headers Row 4: A, R, Total
      const subHeaderRowValues = ['No.', 'Transaction Type', 'A', 'R', 'Total'];
      activeClerkNames.forEach(() => {
        subHeaderRowValues.push('A', 'R', 'Total');
      });

      const mSubHeaderRow = wsMatrix.getRow(4);
      mSubHeaderRow.values = subHeaderRowValues;
      mSubHeaderRow.height = 22;

      mSubHeaderRow.eachCell((cell, colNum) => {
        cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF1E293B' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
          bottom: { style: 'medium', color: { argb: 'FF' + SSS_BLUE } },
          left: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
          right: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } }
        };

        if (subHeaderRowValues[colNum - 1] === 'Total') {
          cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFDC2626' } };
        }
      });

      // Populate Matrix Data Rows
      let grandSumA = 0;
      let grandSumR = 0;
      let grandSumTotal = 0;
      const clerkSums = {};
      activeClerkNames.forEach(cName => {
        clerkSums[cName] = { a: 0, r: 0, total: 0 };
      });

      matrixRows.forEach((mItem, idx) => {
        const row = wsMatrix.getRow(5 + idx);
        const rowVals = [
          idx + 1,
          mItem.name,
          mItem.totalA,
          mItem.totalR,
          mItem.total
        ];

        grandSumA += mItem.totalA;
        grandSumR += mItem.totalR;
        grandSumTotal += mItem.total;

        activeClerkNames.forEach(cName => {
          const cData = mItem.clerks[cName] || { a: 0, r: 0, total: 0 };
          rowVals.push(cData.a, cData.r, cData.total);
          clerkSums[cName].a += cData.a;
          clerkSums[cName].r += cData.r;
          clerkSums[cName].total += cData.total;
        });

        row.values = rowVals;
        row.height = 20;

        const isEven = idx % 2 === 0;
        const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

        row.eachCell((cell, colNum) => {
          cell.font = { name: 'Segoe UI', size: 9 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
            bottom: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
            left: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
            right: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } }
          };
          cell.alignment = { vertical: 'middle', horizontal: colNum === 2 ? 'left' : 'center' };

          // Total column in Red text as in standard SSS spreadsheet
          const headerName = subHeaderRowValues[colNum - 1];
          if (headerName === 'Total') {
            cell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: cell.value > 0 ? 'FFDC2626' : 'FF94A3B8' } };
          }
        });
      });

      // Bottom Grand Total Row
      const grandTotalRowNum = 5 + matrixRows.length;
      const grandTotalRow = wsMatrix.getRow(grandTotalRowNum);
      const grandTotalVals = ['TOTAL', 'DAILY BRANCH GRAND TOTAL', grandSumA, grandSumR, grandSumTotal];
      activeClerkNames.forEach(cName => {
        grandTotalVals.push(clerkSums[cName].a, clerkSums[cName].r, clerkSums[cName].total);
      });

      grandTotalRow.values = grandTotalVals;
      grandTotalRow.height = 24;
      grandTotalRow.eachCell((cell, colNum) => {
        cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1E3A8A' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Soft Gold
        cell.alignment = { vertical: 'middle', horizontal: colNum === 2 ? 'left' : 'center' };
        cell.border = {
          top: { style: 'medium', color: { argb: 'FF' + NAVY_DARK } },
          bottom: { style: 'double', color: { argb: 'FF' + NAVY_DARK } },
          left: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
          right: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } }
        };

        const headerName = subHeaderRowValues[colNum - 1];
        if (headerName === 'Total') {
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFDC2626' } };
        }
      });

      // Widths for SSS Matrix
      wsMatrix.getColumn(1).width = 6;
      wsMatrix.getColumn(2).width = 46;
      for (let c = 3; c <= totalMatrixCols; c++) {
        wsMatrix.getColumn(c).width = 11;
      }

      // ── SHEET 2: Master Service Log (All Transactions) ──
      const wsMaster = wb.addWorksheet('Master Log', { views: [{ showGridLines: true }] });
      buildTransactionSheet(wsMaster, 'MASTER SERVICE MONITORING LOG', subtitleText, rows);

      // ── SHEET 3: MY APPOINTMENTS & SCHEDULE ATTENDANCE LOG ───────────────────
      let apptSql = `
        SELECT a.*,
               COALESCE(c.name, 'Assigned Officer') as clerk_name,
               COALESCE(a.counter, c.counter, 'Counter 1') as counter_name,
               m.queue_number,
               m.sss_number,
               m.check_in_time,
               t.service_start_time,
               t.service_end_time,
               t.duration_minutes,
               t.wait_time_minutes,
               t.outcome,
               t.rating,
               t.remarks,
               t.feedback_reason,
               t.clerk_instructions,
               COALESCE(t.confirmed_transaction_type, a.service, m.transaction_type, 'Appointment') as confirmed_tx_type,
               CASE
                 WHEN a.arrival_status = 'done' OR t.outcome IS NOT NULL THEN 'Served'
                 WHEN a.arrival_status = 'no-show' THEN 'No-Show'
                 WHEN a.arrival_status = 'in-lobby' THEN 'In Lobby'
                 ELSE 'Pending'
               END as computed_status
        FROM appointments a
        LEFT JOIN clerks c ON a.clerk_id = c.id
        LEFT JOIN members m ON a.member_id = m.id
        LEFT JOIN transactions t ON t.member_id = m.id
        WHERE 1=1
      `;
      const apptParams = [];
      if (clerkId) {
        apptSql += ' AND a.clerk_id = ?';
        apptParams.push(clerkId);
      }
      if (fromDate && toDate) {
        apptSql += ' AND a.date BETWEEN ? AND ?';
        apptParams.push(fromDate, toDate);
      } else if (targetDate && !isAll) {
        apptSql += ' AND a.date = ?';
        apptParams.push(targetDate);
      }
      apptSql += ' ORDER BY a.date DESC, a.appointment_time ASC';

      const apptRows = db.prepare(apptSql).all(...apptParams);

      if (apptRows.length > 0) {
        const wsAppts = wb.addWorksheet('Appointments Log', { views: [{ state: 'frozen', xSplit: 0, ySplit: 6, showGridLines: true }] });
        wsAppts.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

        // Banner
        wsAppts.mergeCells('A1:P1');
        const apptTitle = wsAppts.getCell('A1');
        apptTitle.value = `SOCIAL SECURITY SYSTEM — TOLEDO BRANCH | ${clerkId ? 'MY APPOINTMENTS LOG & ATTENDANCE RECORD' : 'APPOINTMENTS LOG & ATTENDANCE RECORD'}`;
        apptTitle.font = { name: 'Segoe UI', size: 13, bold: true, color: { argb: 'FFFFFFFF' } };
        apptTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + NAVY_DARK } };
        apptTitle.alignment = { vertical: 'middle', horizontal: 'center' };
        wsAppts.getRow(1).height = 28;

        wsAppts.mergeCells('A2:P2');
        const apptSub = wsAppts.getCell('A2');
        apptSub.value = subtitleText;
        apptSub.font = { name: 'Segoe UI', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
        apptSub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + SSS_BLUE } };
        apptSub.alignment = { vertical: 'middle', horizontal: 'center' };
        wsAppts.getRow(2).height = 20;

        // KPI Summary Row
        const totalAppts = apptRows.length;
        const servedAppts = apptRows.filter(r => r.computed_status === 'Served').length;
        const noShowAppts = apptRows.filter(r => r.computed_status === 'No-Show').length;
        const inLobbyAppts = apptRows.filter(r => r.computed_status === 'In Lobby').length;
        const pendingAppts = apptRows.filter(r => r.computed_status === 'Pending').length;

        wsAppts.mergeCells('A4:C4');
        wsAppts.getCell('A4').value = `Total Bookings: ${totalAppts}`;
        wsAppts.getCell('A4').font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
        wsAppts.getCell('A4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
        wsAppts.getCell('A4').alignment = { vertical: 'middle', horizontal: 'center' };

        wsAppts.mergeCells('D4:F4');
        wsAppts.getCell('D4').value = `Served: ${servedAppts} (${totalAppts ? Math.round(servedAppts/totalAppts*100) : 0}%)`;
        wsAppts.getCell('D4').font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF15803D' } };
        wsAppts.getCell('D4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
        wsAppts.getCell('D4').alignment = { vertical: 'middle', horizontal: 'center' };

        wsAppts.mergeCells('G4:I4');
        wsAppts.getCell('G4').value = `No-Show: ${noShowAppts} (${totalAppts ? Math.round(noShowAppts/totalAppts*100) : 0}%)`;
        wsAppts.getCell('G4').font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
        wsAppts.getCell('G4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
        wsAppts.getCell('G4').alignment = { vertical: 'middle', horizontal: 'center' };

        wsAppts.mergeCells('J4:L4');
        wsAppts.getCell('J4').value = `In Lobby: ${inLobbyAppts} | Pending: ${pendingAppts}`;
        wsAppts.getCell('J4').font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1E3A8A' } };
        wsAppts.getCell('J4').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };
        wsAppts.getCell('J4').alignment = { vertical: 'middle', horizontal: 'center' };

        wsAppts.getRow(4).height = 22;

        // Table Header
        const apptHeaders = [
          '#', 'Date', 'Appt Time', 'Member Name', 'Contact Phone', 'Email Address',
          'Service / Purpose', 'Assigned Officer', 'Counter / Desk', 'Status / Mark',
          'Late?', 'Check-in Time', 'Duration (min)', 'Outcome', 'CSAT Rating', 'Instructions / Remarks'
        ];

        const apptHeaderRow = wsAppts.getRow(6);
        apptHeaderRow.values = apptHeaders;
        apptHeaderRow.height = 26;
        apptHeaderRow.eachCell((cell) => {
          cell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + HEADER_BG } };
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
          cell.border = {
            top: { style: 'medium', color: { argb: 'FF' + NAVY_DARK } },
            bottom: { style: 'medium', color: { argb: 'FF' + NAVY_DARK } },
            left: { style: 'thin', color: { argb: 'FFFFFFFF' } },
            right: { style: 'thin', color: { argb: 'FFFFFFFF' } }
          };
        });

        wsAppts.autoFilter = {
          from: { row: 6, column: 1 },
          to: { row: 6, column: apptHeaders.length }
        };

        // Populate Data
        apptRows.forEach((r, idx) => {
          const row = wsAppts.getRow(7 + idx);
          const checkIn = r.check_in_time ? r.check_in_time.split(' ')[1] || r.check_in_time : '—';
          const dur = r.duration_minutes != null ? parseFloat(r.duration_minutes) : (r.computed_status === 'Served' ? 10.0 : 0);
          const out = r.outcome ? (r.outcome === 'finished' ? 'Finished' : (r.outcome === 'for-verification' ? 'For Verification' : r.outcome)) : (r.computed_status === 'Served' ? 'Finished' : '—');
          const sat = r.rating ? (r.rating === 'happy' ? 'Satisfied' : (r.rating === 'neutral' ? 'Neutral' : 'Unsatisfied')) : '—';

          row.values = [
            idx + 1,
            r.date || '—',
            r.appointment_time || '—',
            r.name || '—',
            r.phone || '—',
            r.email || '—',
            r.confirmed_tx_type || r.service || 'Appointment',
            r.clerk_name || 'Assigned Officer',
            r.counter_name || 'Counter 1',
            r.computed_status,
            r.is_late ? 'Yes (Late)' : 'No',
            checkIn,
            dur,
            out,
            sat,
            r.clerk_instructions || r.remarks || ''
          ];

          const isEven = idx % 2 === 0;
          const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

          row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            cell.font = { name: 'Segoe UI', size: 9 };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
            cell.border = {
              top: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
              left: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
              bottom: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } },
              right: { style: 'thin', color: { argb: 'FF' + BORDER_COLOR } }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'left' };

            if ([1, 2, 3, 5, 8, 9, 10, 11, 12, 13, 14, 15].includes(colNumber)) {
              cell.alignment = { vertical: 'middle', horizontal: 'center' };
            }
          });

          // Status Badge Color
          const statusCell = row.getCell(10);
          if (r.computed_status === 'Served') {
            statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
            statusCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF15803D' } };
          } else if (r.computed_status === 'No-Show') {
            statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
            statusCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FFB91C1C' } };
          } else if (r.computed_status === 'In Lobby') {
            statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
            statusCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF1D4ED8' } };
          } else {
            statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
            statusCell.font = { name: 'Segoe UI', size: 9, bold: true, color: { argb: 'FF64748B' } };
          }
        });

        // Column widths
        const apptColWidths = [6, 12, 12, 24, 16, 22, 30, 18, 16, 16, 10, 12, 12, 16, 14, 28];
        apptColWidths.forEach((w, i) => {
          wsAppts.getColumn(i + 1).width = w;
        });
      }

      // ── CATEGORY SHEETS: ONLY CREATED IF ROWS EXIST (No Empty Clutter Tabs) ──
      // ── INDIVIDUAL TRANSACTION TYPE TABS (Exact Transacted Types) ──────────
      // Create a dedicated worksheet tab for each exact transaction type that was transacted on this day/period
      const usedSheetNames = new Set(['sss service matrix', 'master log', 'appointments log', 'my appointments', 'appointments schedule', 'staff performance', 'tx types breakdown']);

      matrixRows.forEach(mItem => {
        const typeName = mItem.name;
        const typeRows = rows.filter(r => (r.tx_type || '').trim() === typeName.trim());
        if (typeRows.length === 0) return;

        // Clean name for Excel tab (max 31 chars, no illegal chars: \ / ? * [ ] :)
        let cleanName = typeName
          .replace(/[\/\\?*\[\]:]/g, '-')
          .replace(/\s+/g, ' ')
          .trim();

        if (cleanName.length > 31) {
          cleanName = cleanName.substring(0, 31).trim();
        }

        let finalSheetName = cleanName;
        let suffix = 2;
        while (usedSheetNames.has(finalSheetName.toLowerCase())) {
          const sfx = ` (${suffix})`;
          finalSheetName = cleanName.substring(0, 31 - sfx.length) + sfx;
          suffix++;
        }
        usedSheetNames.add(finalSheetName.toLowerCase());

        const wsType = wb.addWorksheet(finalSheetName, { views: [{ showGridLines: true }] });
        buildTransactionSheet(wsType, typeName.toUpperCase(), subtitleText, typeRows);
      });

      // Send output
      const filterSlugParts = [
        counter ? counter.replace(/\s+/g, '_') : null,
        outcome ? outcome.replace(/\s+/g, '_') : null,
        channel ? channel.replace(/\s+/g, '_') : null
      ].filter(Boolean);
      const filterSlug = filterSlugParts.length ? `${filterSlugParts.join('_')}_` : '';
      const dateSlug = fromDate && toDate ? `${fromDate}_to_${toDate}` : (isAll ? 'ALL' : (targetDate || today));
      const filename = `SSS_Toledo_ServiceLog_${filterSlug}${dateSlug}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache');

      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error('Excel export error:', err);
      res.status(500).json({ error: 'Failed to generate Excel file' });
    }
  });

  // ── GET ARTA CSM Analytics & Quarterly Stats ──────────────────────────────
  router.get('/arta-csm', (req, res) => {
    try {
      const { from, to, date } = req.query;
      let dateFilter = '';
      const params = [];

      if (from && to) {
        dateFilter = 'WHERE t.date BETWEEN ? AND ?';
        params.push(from, to);
      } else if (date) {
        dateFilter = 'WHERE t.date = ?';
        params.push(date);
      }

      const query = `
        SELECT
          t.id, t.date, t.rating, t.nps_score, t.feedback_reason, t.feedback_category, t.comments,
          m.customer_type, m.sex, m.age, m.region, m.transaction_type, t.confirmed_transaction_type
        FROM transactions t
        JOIN members m ON t.member_id = m.id
        ${dateFilter}
      `;
      const records = db.prepare(query).all(...params);

      const totalResponses = records.length;
      const ratedResponses = records.filter(r => r.rating || r.nps_score != null);

      // CSAT
      const csat = {
        very_satisfied: records.filter(r => r.rating === 'happy' && (r.nps_score >= 9 || r.nps_score == null)).length,
        satisfied: records.filter(r => r.rating === 'happy' && r.nps_score < 9).length,
        neutral: records.filter(r => r.rating === 'neutral').length,
        unsatisfied: records.filter(r => r.rating === 'sad').length,
        total: ratedResponses.length
      };

      // NPS (Net Promoter Score)
      const promoters = records.filter(r => (r.nps_score >= 9) || (r.rating === 'happy' && r.nps_score == null)).length;
      const passives = records.filter(r => (r.nps_score >= 7 && r.nps_score <= 8) || (r.rating === 'neutral' && r.nps_score == null)).length;
      const detractors = records.filter(r => (r.nps_score >= 1 && r.nps_score <= 6) || (r.rating === 'sad' && r.nps_score == null)).length;
      const npsRatedCount = ratedResponses.length;
      const npsScore = npsRatedCount > 0 ? Math.round(((promoters - detractors) / npsRatedCount) * 100) : 0;

      // Customer Types
      const customerTypes = {};
      records.forEach(r => {
        const ct = r.customer_type || 'Employed Member';
        customerTypes[ct] = (customerTypes[ct] || 0) + 1;
      });

      // Sex
      const sex = {
        male: records.filter(r => (r.sex || '').toLowerCase() === 'male').length,
        female: records.filter(r => (r.sex || '').toLowerCase() === 'female').length,
        unspecified: records.filter(r => !r.sex).length
      };

      // Age Groups
      const ageGroups = {
        under_20: records.filter(r => r.age && r.age < 20).length,
        age_20_34: records.filter(r => r.age && r.age >= 20 && r.age <= 34).length,
        age_35_49: records.filter(r => r.age && r.age >= 35 && r.age <= 49).length,
        age_50_64: records.filter(r => r.age && r.age >= 50 && r.age <= 64).length,
        age_65_plus: records.filter(r => r.age && r.age >= 65).length,
        unspecified: records.filter(r => !r.age).length
      };

      // Feedback Categories
      const feedbackCategories = {
        positive: records.filter(r => r.feedback_category === 'Positive Feedback' || (!r.feedback_category && r.rating === 'happy')).length,
        negative: records.filter(r => r.feedback_category === 'Negative Feedback' || (!r.feedback_category && (r.rating === 'sad' || r.rating === 'neutral'))).length,
        no_comment: records.filter(r => r.feedback_category === 'No comment or N/A').length
      };

      // Top Root Causes / Reasons
      const reasonsTally = {};
      records.forEach(r => {
        if (r.feedback_reason) {
          reasonsTally[r.feedback_reason] = (reasonsTally[r.feedback_reason] || 0) + 1;
        }
      });

      res.json({
        totalResponses,
        ratedCount: ratedResponses.length,
        csat,
        nps: {
          promoters,
          passives,
          detractors,
          score: npsScore,
          promoterPct: npsRatedCount > 0 ? ((promoters / npsRatedCount) * 100).toFixed(1) : 0,
          detractorPct: npsRatedCount > 0 ? ((detractors / npsRatedCount) * 100).toFixed(1) : 0
        },
        customerTypes,
        sex,
        ageGroups,
        feedbackCategories,
        reasonsTally
      });
    } catch (e) {
      console.error('ARTA CSM stats error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // ── GET Export Official ARTA CSM Multi-Tab Excel Workbook ───────────────────
  router.get('/export/arta-excel', async (req, res) => {
    try {
      const { from, to, date } = req.query;
      const today = new Date().toISOString().split('T')[0];
      let dateFilter = '';
      const params = [];

      if (from && to) {
        dateFilter = 'WHERE t.date BETWEEN ? AND ?';
        params.push(from, to);
      } else if (date) {
        dateFilter = 'WHERE t.date = ?';
        params.push(date);
      }

      const rows = db.prepare(`
        SELECT
          t.id as tx_id,
          t.date,
          m.check_in_time,
          m.queue_number,
          m.name as member_name,
          m.sss_number,
          COALESCE(m.customer_type, 'Employed Member') as customer_type,
          COALESCE(m.sex, 'Unspecified') as sex,
          m.age,
          COALESCE(m.region, 'Region VII - Central Visayas') as region,
          COALESCE(t.counter, 'Counter 1') as counter,
          COALESCE(c.name, 'Officer on Duty') as clerk_name,
          COALESCE(t.confirmed_transaction_type, m.transaction_type, 'General Service') as transaction_type,
          t.nps_score,
          CASE
            WHEN t.rating = 'happy' THEN 'Satisfied (5/5)'
            WHEN t.rating = 'neutral' THEN 'Neutral (3/5)'
            WHEN t.rating = 'sad' THEN 'Unsatisfied (1/5)'
            ELSE '—'
          END as csat_rating,
          COALESCE(t.feedback_category, 'No comment or N/A') as feedback_category,
          t.feedback_reason,
          t.comments,
          COALESCE(t.comm_consent, 'agree') as comm_consent
        FROM transactions t
        JOIN members m ON t.member_id = m.id
        LEFT JOIN clerks c ON t.clerk_id = c.id
        ${dateFilter}
        ORDER BY t.date DESC, t.id DESC
      `).all(...params);

      const totalResponses = rows.length;
      const ratedResponses = rows.filter(r => r.csat_rating !== '—' || r.nps_score != null);
      const promoters = rows.filter(r => (r.nps_score >= 9) || (r.csat_rating.includes('Satisfied') && r.nps_score == null)).length;
      const passives = rows.filter(r => (r.nps_score >= 7 && r.nps_score <= 8) || (r.csat_rating.includes('Neutral') && r.nps_score == null)).length;
      const detractors = rows.filter(r => (r.nps_score >= 1 && r.nps_score <= 6) || (r.csat_rating.includes('Unsatisfied') && r.nps_score == null)).length;
      const npsScore = ratedResponses.length > 0 ? Math.round(((promoters - detractors) / ratedResponses.length) * 100) : 0;
      const csatPct = ratedResponses.length > 0 ? (((promoters + passives) / ratedResponses.length) * 100).toFixed(1) : '100.0';

      const wb = new ExcelJS.Workbook();
      wb.creator = 'SSS Toledo Monitoring System';
      wb.created = new Date();

      const navyHeaderFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF071E4A' } };
      const blueSubFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0A3871' } };
      const thinBorder = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
      };

      // ── TAB 1: ARTA Executive Summary ──────────────────────────────────────
      const ws1 = wb.addWorksheet('ARTA CSM Summary', { views: [{ showGridLines: true }] });
      ws1.columns = [
        { width: 32 }, { width: 18 }, { width: 18 }, { width: 22 }, { width: 22 }, { width: 22 }
      ];

      ws1.mergeCells('A1:F1');
      ws1.getCell('A1').value = 'SOCIAL SECURITY SYSTEM — TOLEDO BRANCH';
      ws1.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
      ws1.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
      ws1.getCell('A1').fill = navyHeaderFill;
      ws1.getRow(1).height = 28;

      ws1.mergeCells('A2:F2');
      ws1.getCell('A2').value = 'HARMONIZED CLIENT SATISFACTION MEASUREMENT (CSM) REPORT — ARTA / CSC';
      ws1.getCell('A2').font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      ws1.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
      ws1.getCell('A2').fill = blueSubFill;
      ws1.getRow(2).height = 22;

      ws1.mergeCells('A3:F3');
      const periodLabel = from && to ? `${from} to ${to}` : (date || today);
      ws1.getCell('A3').value = `Audit Period: ${periodLabel} | Generated: ${new Date().toLocaleString('en-PH')}`;
      ws1.getCell('A3').font = { italic: true, size: 9, color: { argb: 'FF6B7280' } };
      ws1.getCell('A3').alignment = { horizontal: 'center' };
      ws1.getRow(3).height = 18;

      // Scorecard
      ws1.getCell('A5').value = 'I. EXECUTIVE SATISFACTION & NPS SCORECARD';
      ws1.getCell('A5').font = { bold: true, size: 11, color: { argb: 'FF071E4A' } };

      const kpiHeaders = ['Metric Description', 'Value / Score', 'National ARTA Standard', 'Audit Rating'];
      ws1.getRow(6).values = kpiHeaders;
      ws1.getRow(6).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ws1.getRow(6).alignment = { horizontal: 'center', vertical: 'middle' };
      ['A6','B6','C6','D6'].forEach(c => { ws1.getCell(c).fill = blueSubFill; ws1.getCell(c).border = thinBorder; });

      const kpiRows = [
        ['Overall Citizen Satisfaction Rate (CSAT %)', `${csatPct}%`, '>= 80.0%', csatPct >= 80 ? 'PASSED (Compliant)' : 'ACTION REQUIRED'],
        ['Net Promoter Score (NPS)', npsScore >= 0 ? `+${npsScore}` : `${npsScore}`, '>= +30.0', npsScore >= 50 ? 'EXCELLENT' : 'GOOD'],
        ['Total Survey Respondents Sampled', `${ratedResponses.length} citizens`, 'Representative Sample', 'VALID'],
        ['Promoters (Rating 9-10 / 5★)', `${promoters} (${ratedResponses.length > 0 ? ((promoters/ratedResponses.length)*100).toFixed(1) : 0}%)`, 'Loyal Advocates', 'OPTIMAL'],
        ['Passives (Rating 7-8 / 3★)', `${passives} (${ratedResponses.length > 0 ? ((passives/ratedResponses.length)*100).toFixed(1) : 0}%)`, 'Neutral', 'ACCEPTABLE'],
        ['Detractors (Rating 1-6 / 1★)', `${detractors} (${ratedResponses.length > 0 ? ((detractors/ratedResponses.length)*100).toFixed(1) : 0}%)`, '< 10.0%', detractors <= (ratedResponses.length * 0.1) ? 'WITHIN THRESHOLD' : 'REVIEW NEEDED']
      ];

      kpiRows.forEach(r => {
        const row = ws1.addRow(r);
        row.eachCell(cell => { cell.border = thinBorder; cell.font = { size: 9.5 }; });
      });

      // Customer Types Breakdown
      const custStartRow = ws1.rowCount + 2;
      ws1.getCell(`A${custStartRow}`).value = 'II. CLIENTELE & MEMBERSHIP DEMOGRAPHICS';
      ws1.getCell(`A${custStartRow}`).font = { bold: true, size: 11, color: { argb: 'FF071E4A' } };

      const custHeadRow = custStartRow + 1;
      ws1.getRow(custHeadRow).values = ['Customer Membership Type', 'Citizen Count', 'Percentage Ratio', 'Status'];
      ws1.getRow(custHeadRow).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      ['A','B','C','D'].forEach(col => { ws1.getCell(`${col}${custHeadRow}`).fill = blueSubFill; ws1.getCell(`${col}${custHeadRow}`).border = thinBorder; });

      const custTally = {};
      rows.forEach(r => { custTally[r.customer_type] = (custTally[r.customer_type] || 0) + 1; });
      Object.entries(custTally).forEach(([type, count]) => {
        const pct = totalResponses > 0 ? ((count / totalResponses) * 100).toFixed(1) : 0;
        const row = ws1.addRow([type, count, `${pct}%`, 'Audited']);
        row.eachCell(cell => { cell.border = thinBorder; cell.font = { size: 9.5 }; });
      });

      // Sign-off
      const signRow = ws1.rowCount + 3;
      ws1.getCell(`A${signRow}`).value = 'Prepared by: _____________________________';
      ws1.getCell(`D${signRow}`).value = 'Approved by: _____________________________';
      ws1.getCell(`A${signRow+1}`).value = 'Branch CSAT & Triage Officer';
      ws1.getCell(`D${signRow+1}`).value = 'Branch Head / OIC — Toledo Branch';
      ws1.getCell(`A${signRow+1}`).font = { italic: true, size: 8.5, color: { argb: 'FF6B7280' } };
      ws1.getCell(`D${signRow+1}`).font = { italic: true, size: 8.5, color: { argb: 'FF6B7280' } };

      // ── TAB 2: Citizen Response Registry ───────────────────────────────────
      const ws2 = wb.addWorksheet('Citizen Survey Registry', { views: [{ showGridLines: true }] });
      ws2.columns = [
        { header: 'Tx ID', key: 'tx_id', width: 10 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Check-In', key: 'check_in_time', width: 12 },
        { header: 'Queue #', key: 'queue_number', width: 12 },
        { header: 'Citizen Name', key: 'member_name', width: 24 },
        { header: 'SSS Number', key: 'sss_number', width: 16 },
        { header: 'Customer Type', key: 'customer_type', width: 22 },
        { header: 'Sex', key: 'sex', width: 10 },
        { header: 'Age', key: 'age', width: 8 },
        { header: 'Region', key: 'region', width: 24 },
        { header: 'Station / Counter', key: 'counter', width: 18 },
        { header: 'Attending Officer', key: 'clerk_name', width: 20 },
        { header: 'Service Availed', key: 'transaction_type', width: 26 },
        { header: 'NPS (1-10)', key: 'nps_score', width: 12 },
        { header: 'CSAT Rating', key: 'csat_rating', width: 16 },
        { header: 'Feedback Category', key: 'feedback_category', width: 18 },
        { header: 'Root Cause / Reason', key: 'feedback_reason', width: 24 },
        { header: 'Written Comments / Suggestions', key: 'comments', width: 32 },
        { header: 'DPA Consent', key: 'comm_consent', width: 12 }
      ];

      const headerRow2 = ws2.getRow(1);
      headerRow2.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9.5 };
      headerRow2.alignment = { horizontal: 'center', vertical: 'middle' };
      headerRow2.height = 24;
      headerRow2.eachCell(cell => { cell.fill = navyHeaderFill; cell.border = thinBorder; });

      rows.forEach(r => {
        const row = ws2.addRow({
          ...r,
          check_in_time: r.check_in_time ? new Date(r.check_in_time).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'
        });
        row.eachCell(cell => { cell.border = thinBorder; cell.font = { size: 9 }; });
      });

      // ── TAB 3: Complaints & Root Causes ────────────────────────────────────
      const ws3 = wb.addWorksheet('Complaints & Improvements', { views: [{ showGridLines: true }] });
      ws3.columns = [
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Queue #', key: 'queue_number', width: 12 },
        { header: 'Citizen Name', key: 'member_name', width: 24 },
        { header: 'Station', key: 'counter', width: 16 },
        { header: 'Officer', key: 'clerk_name', width: 20 },
        { header: 'NPS Score', key: 'nps_score', width: 12 },
        { header: 'Root Cause Bottleneck', key: 'feedback_reason', width: 28 },
        { header: 'Citizen Comment / Suggestion', key: 'comments', width: 36 }
      ];

      const headerRow3 = ws3.getRow(1);
      headerRow3.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9.5 };
      headerRow3.alignment = { horizontal: 'center', vertical: 'middle' };
      headerRow3.height = 24;
      headerRow3.eachCell(cell => { cell.fill = navyHeaderFill; cell.border = thinBorder; });

      const complaintRows = rows.filter(r => r.feedback_reason || r.csat_rating.includes('Unsatisfied') || r.csat_rating.includes('Neutral') || (r.nps_score != null && r.nps_score <= 6));
      complaintRows.forEach(r => {
        const row = ws3.addRow({
          date: r.date,
          queue_number: r.queue_number,
          member_name: r.member_name,
          counter: r.counter,
          clerk_name: r.clerk_name,
          nps_score: r.nps_score || '—',
          feedback_reason: r.feedback_reason || 'General Neutral/Unsatisfied',
          comments: r.comments || '—'
        });
        row.eachCell(cell => { cell.border = thinBorder; cell.font = { size: 9 }; });
      });

      const filename = `SSS_Toledo_ARTA_CSM_Report_${periodLabel.replace(/[\s:-]+/g, '_')}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-cache');

      await wb.xlsx.write(res);
      res.end();
    } catch (e) {
      console.error('ARTA Excel error:', e);
      res.status(500).json({ error: 'Failed to generate ARTA Excel workbook' });
    }
  });

  return router;
};
