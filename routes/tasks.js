const express = require('express');
const db = require('../database/db');
const ExcelJS = require('exceljs');

module.exports = (io) => {
  const router = express.Router();

  // Helper to auto-evaluate and update overdue tasks
  function refreshOverdueTasks() {
    try {
      const nowStr = (db.getNowDateTime ? db.getNowDateTime() : new Date().toLocaleString('en-CA')).slice(0, 16);
      db.prepare(`
        UPDATE mss_tasks
        SET status = 'overdue'
        WHERE status IN ('pending', 'ongoing')
          AND target_date < ?
      `).run(nowStr);
    } catch(e) {
      console.error('Error refreshing overdue tasks:', e);
    }
  }

  // GET all tasks (with filters: status, assigned_to, category, search)
  router.get('/', (req, res) => {
    refreshOverdueTasks();
    const { status, assigned_to, category, q } = req.query;

    let sql = `
      SELECT t.*, c.name as assignee_name, c.counter as assignee_role,
             creator.name as creator_name
      FROM mss_tasks t
      LEFT JOIN clerks c ON t.assigned_to = c.id
      LEFT JOIN clerks creator ON t.created_by = creator.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
      sql += ' AND t.status = ?';
      params.push(status);
    }
    if (assigned_to) {
      sql += ' AND t.assigned_to = ?';
      params.push(assigned_to);
    }
    if (category) {
      sql += ' AND t.category = ?';
      params.push(category);
    }
    if (q && q.trim()) {
      const term = `%${q.trim()}%`;
      sql += ' AND (t.title LIKE ? OR t.description LIKE ? OR c.name LIKE ?)';
      params.push(term, term, term);
    }

    sql += " ORDER BY CASE t.priority WHEN 'critical' THEN 1 WHEN 'urgent' THEN 2 ELSE 3 END, t.target_date ASC";

    try {
      const tasks = db.prepare(sql).all(...params);
      
      // Calculate summary stats
      const stats = db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'ongoing' THEN 1 ELSE 0 END) as ongoing,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'overdue' THEN 1 ELSE 0 END) as overdue
        FROM mss_tasks
      `).get();

      res.json({ tasks, stats });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET tasks for specific clerk (My Tasks)
  router.get('/my/:clerkId', (req, res) => {
    refreshOverdueTasks();
    const { clerkId } = req.params;
    try {
      const tasks = db.prepare(`
        SELECT t.*, c.name as assignee_name
        FROM mss_tasks t
        LEFT JOIN clerks c ON t.assigned_to = c.id
        WHERE t.assigned_to = ?
        ORDER BY CASE t.status WHEN 'ongoing' THEN 1 WHEN 'pending' THEN 2 WHEN 'overdue' THEN 3 ELSE 4 END, t.target_date ASC
      `).all(clerkId);

      const activeCount = tasks.filter(t => t.status === 'pending' || t.status === 'ongoing' || t.status === 'overdue').length;

      res.json({ tasks, activeCount });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST create new task assignment (Steps 1, 2, 3)
  router.post('/', (req, res) => {
    const { title, description, category, priority = 'normal', assigned_to, assigned_station, target_date, created_by } = req.body;

    if (!title || !category || !target_date) {
      return res.status(400).json({ error: 'Title, category, and target completion date are required.' });
    }

    try {
      // ── All Staff: fan-out one individual copy per active non-admin clerk ──
      if (!assigned_to) {
        const activeStaff = db.prepare(
          `SELECT id, name, counter FROM clerks WHERE is_active = 1 AND counter != 'Admin' ORDER BY name ASC`
        ).all();

        if (activeStaff.length === 0) {
          return res.status(400).json({ error: 'No active staff found to assign tasks to.' });
        }

        const insertStmt = db.prepare(`
          INSERT INTO mss_tasks (title, description, category, priority, assigned_to, assigned_station, target_date, status, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        `);

        const createdTasks = [];
        for (const staff of activeStaff) {
          const r = insertStmt.run(
            title, description || '', category, priority,
            staff.id, staff.counter || 'Branch', target_date, created_by || null
          );
          const task = db.prepare(`
            SELECT t.*, c.name as assignee_name
            FROM mss_tasks t
            LEFT JOIN clerks c ON t.assigned_to = c.id
            WHERE t.id = ?
          `).get(r.lastInsertRowid);
          createdTasks.push(task);
          io.emit('task:created', task);
        }

        return res.status(201).json({ success: true, task: createdTasks[0], count: createdTasks.length, message: `Assignment dispatched to ${createdTasks.length} staff member(s) individually.` });
      }

      // ── Single specific assignee ───────────────────────────────────────────
      const result = db.prepare(`
        INSERT INTO mss_tasks (title, description, category, priority, assigned_to, assigned_station, target_date, status, created_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
      `).run(title, description || '', category, priority, assigned_to, assigned_station || 'Branch', target_date, created_by || null);

      const task = db.prepare(`
        SELECT t.*, c.name as assignee_name
        FROM mss_tasks t
        LEFT JOIN clerks c ON t.assigned_to = c.id
        WHERE t.id = ?
      `).get(result.lastInsertRowid);

      io.emit('task:created', task);
      res.status(201).json({ success: true, task });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT update task status (Start / Complete / Notes)
  router.put('/:id/status', (req, res) => {
    const { id } = req.params;
    const { status, accomplishment_notes } = req.body;

    if (!['pending', 'ongoing', 'completed', 'overdue'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    try {
      const nowStr = (db.getNowDateTime ? db.getNowDateTime() : new Date().toLocaleString('en-CA')).slice(0, 16);
      const existing = db.prepare('SELECT * FROM mss_tasks WHERE id = ?').get(id);
      if (!existing) return res.status(404).json({ error: 'Task not found.' });

      let startedAt = existing.started_at;
      let completedAt = existing.completed_at;

      if (status === 'ongoing' && !startedAt) {
        startedAt = nowStr;
      } else if (status === 'completed') {
        completedAt = nowStr;
        if (!startedAt) startedAt = nowStr;
      }

      db.prepare(`
        UPDATE mss_tasks
        SET status = ?, started_at = ?, completed_at = ?,
            accomplishment_notes = COALESCE(?, accomplishment_notes)
        WHERE id = ?
      `).run(status, startedAt, completedAt, accomplishment_notes || null, id);

      const updated = db.prepare(`
        SELECT t.*, c.name as assignee_name
        FROM mss_tasks t
        LEFT JOIN clerks c ON t.assigned_to = c.id
        WHERE t.id = ?
      `).get(id);

      io.emit('task:updated', updated);
      res.json({ success: true, task: updated });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT reassign task
  router.put('/:id/reassign', (req, res) => {
    const { id } = req.params;
    const { assigned_to, assigned_station, target_date, priority } = req.body;

    try {
      const existing = db.prepare('SELECT * FROM mss_tasks WHERE id = ?').get(id);
      if (!existing) return res.status(404).json({ error: 'Task not found.' });

      db.prepare(`
        UPDATE mss_tasks
        SET assigned_to = ?, assigned_station = COALESCE(?, assigned_station),
            target_date = COALESCE(?, target_date),
            priority = COALESCE(?, priority),
            status = CASE WHEN status = 'overdue' THEN 'pending' ELSE status END
        WHERE id = ?
      `).run(assigned_to || null, assigned_station || null, target_date || null, priority || null, id);

      const updated = db.prepare(`
        SELECT t.*, c.name as assignee_name
        FROM mss_tasks t
        LEFT JOIN clerks c ON t.assigned_to = c.id
        WHERE t.id = ?
      `).get(id);

      io.emit('task:updated', updated);
      res.json({ success: true, task: updated });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE / Archive task
  router.delete('/:id', (req, res) => {
    const { id } = req.params;
    try {
      db.prepare('DELETE FROM mss_tasks WHERE id = ?').run(id);
      io.emit('task:deleted', { id: parseInt(id, 10) });
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET export MSS Accomplishment Report (.xlsx)
  router.get('/export/excel', async (req, res) => {
    refreshOverdueTasks();
    try {
      const { category, assigned_to } = req.query;
      let sql = `
        SELECT t.*, c.name as assignee_name
        FROM mss_tasks t
        LEFT JOIN clerks c ON t.assigned_to = c.id
        WHERE 1=1
      `;
      const params = [];
      if (category) { sql += ' AND t.category = ?'; params.push(category); }
      if (assigned_to) { sql += ' AND t.assigned_to = ?'; params.push(assigned_to); }
      sql += ' ORDER BY t.category, t.target_date ASC';

      const tasks = db.prepare(sql).all(...params);

      const wb = new ExcelJS.Workbook();
      wb.creator = 'SSS Toledo MSS Monitoring';
      wb.created = new Date();

      const ws = wb.addWorksheet('MSS Accomplishments', { views: [{ showGridLines: true }] });

      // Title
      ws.mergeCells('A1:I1');
      ws.getCell('A1').value = 'MEMBER SERVICES SECTION (MSS) — TASK ACCOMPLISHMENT & MONITORING REPORT';
      ws.getCell('A1').font = { name: 'Segoe UI', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
      ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF071E4A' } };
      ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' };
      ws.getRow(1).height = 30;

      // Subtitle
      ws.mergeCells('A2:I2');
      const today = (db.getTodayDate ? db.getTodayDate() : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()));
      ws.getCell('A2').value = `SSS Toledo Branch • Generated: ${today} | Total Assignments: ${tasks.length}`;
      ws.getCell('A2').font = { name: 'Segoe UI', size: 9.5, italic: true, color: { argb: 'FF1E3A8A' } };
      ws.getCell('A2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };
      ws.getCell('A2').alignment = { vertical: 'middle', horizontal: 'center' };
      ws.getRow(2).height = 20;

      // Headers
      const headers = ['#', 'Task / Assignment Title', 'Category / Division', 'Priority', 'Assigned Personnel', 'Target Deadline', 'Status', 'Completed At', 'Accomplishment Notes / Remarks'];
      const hRow = ws.getRow(4);
      hRow.values = headers;
      hRow.height = 24;
      hRow.eachCell((cell) => {
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A56DB' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });

      tasks.forEach((t, idx) => {
        const row = ws.getRow(5 + idx);
        row.values = [
          idx + 1,
          t.title,
          t.category,
          t.priority.toUpperCase(),
          t.assignee_name || 'Unassigned / All Staff',
          t.target_date,
          t.status.toUpperCase(),
          t.completed_at || '—',
          t.accomplishment_notes || '—'
        ];
        row.eachCell((cell, colNum) => {
          cell.font = { name: 'Segoe UI', size: 9.5 };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
            right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
          };
          cell.alignment = { vertical: 'middle', horizontal: (colNum === 2 || colNum === 9) ? 'left' : 'center' };
        });

        // Status highlight
        const statusCell = row.getCell(7);
        if (t.status === 'completed') {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } };
          statusCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF15803D' } };
        } else if (t.status === 'overdue') {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          statusCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FFB91C1C' } };
        } else if (t.status === 'ongoing') {
          statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
          statusCell.font = { name: 'Segoe UI', size: 9.5, bold: true, color: { argb: 'FF1D4ED8' } };
        }
      });

      const colWidths = [6, 34, 22, 12, 22, 18, 14, 18, 38];
      colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="SSS_MSS_Accomplishment_Report_${today}.xlsx"`);
      res.setHeader('Cache-Control', 'no-cache');

      await wb.xlsx.write(res);
      res.end();
    } catch (e) {
      console.error('Task export error:', e);
      res.status(500).json({ error: 'Failed to export task accomplishments' });
    }
  });

  return router;
};
