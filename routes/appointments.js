const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../database/db');

module.exports = (io, upload) => {
  const router = express.Router();

  // GET today's appointments
  router.get('/', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const appointments = db.prepare(`
      SELECT a.*, c.name as clerk_name, c.counter
      FROM appointments a
      LEFT JOIN clerks c ON a.clerk_id = c.id
      WHERE a.date = ?
      ORDER BY a.appointment_time ASC
    `).all(today);
    res.json(appointments);
  });

  // GET appointments for a specific clerk
  router.get('/clerk/:clerk_id', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const { clerk_id } = req.params;
    const appointments = db.prepare(`
      SELECT a.*, c.name as clerk_name
      FROM appointments a
      LEFT JOIN clerks c ON a.clerk_id = c.id
      WHERE a.date = ? AND a.clerk_id = ?
      ORDER BY a.appointment_time ASC
    `).all(today, clerk_id);
    res.json(appointments);
  });

  // GET portal appointments (only ones still actively waiting — not yet served)
  router.get('/portal', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const appointments = db.prepare(`
      SELECT a.*,
             m.status as member_status,
             m.id as member_id
      FROM appointments a
      LEFT JOIN members m ON a.member_id = m.id
      WHERE a.date = ? AND a.type = 'portal'
        AND a.arrival_status = 'in-lobby'
        AND (m.status IS NULL OR m.status NOT IN ('done', 'being-served'))
      ORDER BY a.appointment_time ASC
    `).all(today);
    res.json(appointments);
  });

  // GET export appointments in official 8-column format
  router.get('/export/excel', async (req, res) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const targetDate = req.query.date || today;
      const clerkId = req.query.clerk_id;

      let sql = `
        SELECT a.*, c.name as clerk_name, c.counter
        FROM appointments a
        LEFT JOIN clerks c ON a.clerk_id = c.id
        WHERE a.date = ?
      `;
      const params = [targetDate];
      if (clerkId) {
        sql += ' AND a.clerk_id = ?';
        params.push(clerkId);
      }
      sql += ' ORDER BY a.appointment_time ASC';

      const appts = db.prepare(sql).all(...params);

      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Social Security System — Toledo Branch';
      const sheet = workbook.addWorksheet('Appointment Bookings', { views: [{ showGridLines: true }] });

      sheet.columns = [
        { header: 'Date & Time',     key: 'dateTime', width: 22 },
        { header: 'Customer Name',   key: 'name',     width: 26 },
        { header: 'Customer Email',  key: 'email',    width: 28 },
        { header: 'Customer Phone',  key: 'phone',    width: 18 },
        { header: 'Staff Name',      key: 'staff',    width: 22 },
        { header: 'Service',         key: 'service',  width: 34 },
        { header: 'Duration (mins.)', key: 'duration', width: 16 },
        { header: 'Status',          key: 'status',   width: 14 }
      ];

      const headerRow = sheet.getRow(1);
      headerRow.height = 28;
      headerRow.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF071E4A' } };
        cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'medium', color: { argb: 'FF0038A8' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
      });

      appts.forEach((a, idx) => {
        const dateTimeStr = `${a.date} ${a.appointment_time || '09:00 AM'}`;
        const row = sheet.addRow({
          dateTime: dateTimeStr,
          name: a.name || '—',
          email: a.email || '—',
          phone: a.phone_number || '—',
          staff: a.clerk_name || 'Unassigned',
          service: a.service || 'Appointment Consultation',
          duration: a.duration_mins || 15,
          status: a.booking_status || (a.arrival_status === 'served' ? 'Served' : (a.arrival_status === 'in-lobby' ? 'In Lobby' : 'Confirmed'))
        });

        const isEven = idx % 2 === 0;
        const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.font = { name: 'Segoe UI', size: 9.5 };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
          cell.alignment = { vertical: 'middle', horizontal: 'left' };
        });
      });

      const filename = `SSS_Toledo_Appointment_Bookings_${targetDate}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      await workbook.xlsx.write(res);
      res.end();
    } catch (e) {
      console.error('Appointment export error:', e);
      res.status(500).json({ error: 'Failed to export appointments' });
    }
  });

  // GET download official sample template file
  router.get('/template', (req, res) => {
    const filePath = require('path').join(__dirname, '..', 'SSS_Toledo_Sample_Appointment_Bookings.xlsx');
    res.download(filePath, 'SSS_Toledo_Sample_Appointment_Bookings.xlsx', (err) => {
      if (err) {
        console.error('Template download error:', err);
        res.status(500).json({ error: 'Failed to download sample appointment template.' });
      }
    });
  });

  // POST import Excel appointments (admin — scoped per-clerk deletion)
  router.post('/import', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];

      const today = new Date().toISOString().split('T')[0];
      let imported = 0;
      let skipped = 0;

      const insertAppt = db.prepare(`
        INSERT INTO appointments (name, phone_number, email, appointment_time, clerk_id, type, date, service, duration_mins, booking_status)
        VALUES (?, ?, ?, ?, ?, 'direct', ?, ?, ?, ?)
      `);

      // Support official 8-column SSS format:
      // Col 1: Date & Time, Col 2: Customer Name, Col 3: Customer Email, Col 4: Customer Phone,
      // Col 5: Staff Name, Col 6: Service, Col 7: Duration (mins), Col 8: Status
      const rows = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header row

        const c1 = row.getCell(1).value;
        const c2 = row.getCell(2).value?.toString()?.trim();
        const c3 = row.getCell(3).value?.toString()?.trim();
        const c4 = row.getCell(4).value?.toString()?.trim();
        const c5 = row.getCell(5).value?.toString()?.trim();
        const c6 = row.getCell(6).value?.toString()?.trim();
        const c7 = row.getCell(7).value;
        const c8 = row.getCell(8).value?.toString()?.trim();

        let dateStr = today;
        let timeStr = '';
        let name = '';
        let email = null;
        let phone = null;
        let staffName = '';
        let service = null;
        let duration = 15;
        let bookingStatus = 'Confirmed';

        if (c1 instanceof Date) {
          dateStr = c1.toISOString().split('T')[0];
          timeStr = c1.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
          name = c2 || '';
          email = c3 || null;
          phone = c4 || null;
          staffName = c5 || '';
          service = c6 || null;
          duration = c7 ? parseInt(c7) || 15 : 15;
          bookingStatus = c8 || 'Confirmed';
        } else if (typeof c1 === 'string' && (c1.includes('/') || c1.includes('-') || c1.includes(':') || c1.toLowerCase().includes('am') || c1.toLowerCase().includes('pm'))) {
          const parts = c1.trim().split(/\s+/);
          if (parts.length >= 2) {
            const parsedDate = new Date(c1);
            if (!isNaN(parsedDate.getTime())) {
              dateStr = parsedDate.toISOString().split('T')[0];
              timeStr = parsedDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            } else {
              timeStr = parts.slice(1).join(' ');
            }
          } else {
            timeStr = c1;
          }
          name = c2 || '';
          email = c3 || null;
          phone = c4 || null;
          staffName = c5 || '';
          service = c6 || null;
          duration = c7 ? parseInt(c7) || 15 : 15;
          bookingStatus = c8 || 'Confirmed';
        } else {
          // Legacy 5-column format: Col 1 Name, Col 2 Phone, Col 3 Email, Col 4 Time, Col 5 Staff Name
          name = c1?.toString()?.trim() || '';
          phone = c2 || null;
          email = c3 || null;
          timeStr = c4 || '';
          staffName = c5 || '';
          service = c6 || null;
        }

        if (!name || !timeStr) { skipped++; return; }

        let clerkId = null;
        if (staffName) {
          const clerk = db.prepare('SELECT id FROM clerks WHERE name LIKE ?').get(`%${staffName}%`);
          if (clerk) clerkId = clerk.id;
        }
        rows.push({ name, phone, email, time: timeStr, date: dateStr, clerkId, service, duration, bookingStatus });
      });

      // Delete today's direct appointments only for clerks appearing in this file
      const affectedClerkIds = [...new Set(rows.map(r => r.clerkId).filter(Boolean))];
      if (affectedClerkIds.length > 0) {
        const placeholders = affectedClerkIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM appointments WHERE date = ? AND type = 'direct' AND clerk_id IN (${placeholders})`)
          .run(today, ...affectedClerkIds);
      }
      // Also delete unassigned direct appointments
      db.prepare(`DELETE FROM appointments WHERE date = ? AND type = 'direct' AND clerk_id IS NULL`).run(today);

      rows.forEach(r => {
        insertAppt.run(r.name, r.phone || null, r.email || null, r.time, r.clerkId, r.date || today, r.service || null, r.duration || 15, r.bookingStatus || 'Confirmed');
        imported++;
      });

      io.to('admin').emit('appointments:imported', { count: imported, date: today });
      io.emit('appointments:refresh');

      res.json({ success: true, imported, skipped });
    } catch (err) {
      console.error('Excel import error:', err);
      res.status(500).json({ error: 'Failed to read Excel file. Please check the format.' });
    }
  });

  // POST import Excel appointments for a specific clerk or multi-staff file (clerk self-upload)
  router.post('/clerk/:clerk_id/import', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { clerk_id } = req.params;
    const currentClerk = db.prepare('SELECT * FROM clerks WHERE id = ?').get(clerk_id);
    if (!currentClerk) return res.status(404).json({ error: 'Clerk not found.' });

    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];

      const today = new Date().toISOString().split('T')[0];
      let imported = 0, skipped = 0;
      const insertAppt = db.prepare(`
        INSERT INTO appointments (name, phone_number, email, appointment_time, clerk_id, type, date, service, duration_mins, booking_status)
        VALUES (?, ?, ?, ?, ?, 'direct', ?, ?, ?, ?)
      `);

      const rows = [];
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;

        const c1 = row.getCell(1).value;
        const c2 = row.getCell(2).value?.toString()?.trim();
        const c3 = row.getCell(3).value?.toString()?.trim();
        const c4 = row.getCell(4).value?.toString()?.trim();
        const c5 = row.getCell(5).value?.toString()?.trim();
        const c6 = row.getCell(6).value?.toString()?.trim();
        const c7 = row.getCell(7).value;
        const c8 = row.getCell(8).value?.toString()?.trim();

        let dateStr = today;
        let timeStr = '';
        let name = '';
        let email = null;
        let phone = null;
        let staffName = '';
        let service = null;
        let duration = 15;
        let bookingStatus = 'Confirmed';

        // Check if official 8-column format (Col 1: Date & Time, Col 2: Name)
        if (c1 instanceof Date) {
          dateStr = c1.toISOString().split('T')[0];
          timeStr = c1.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
          name = c2 || '';
          email = c3 || null;
          phone = c4 || null;
          staffName = c5 || '';
          service = c6 || null;
          duration = c7 ? parseInt(c7) || 15 : 15;
          bookingStatus = c8 || 'Confirmed';
        } else if (typeof c1 === 'string' && (c1.includes('/') || c1.includes('-') || c1.includes(':') || c1.toLowerCase().includes('am') || c1.toLowerCase().includes('pm')) && c2) {
          const parts = c1.trim().split(/\s+/);
          if (parts.length >= 2) {
            const parsedDate = new Date(c1);
            if (!isNaN(parsedDate.getTime())) {
              dateStr = parsedDate.toISOString().split('T')[0];
              timeStr = parsedDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            } else {
              timeStr = parts.slice(1).join(' ');
            }
          } else {
            timeStr = c1.trim();
          }
          name = c2 || '';
          email = c3 || null;
          phone = c4 || null;
          staffName = c5 || '';
          service = c6 || null;
          duration = c7 ? parseInt(c7) || 15 : 15;
          bookingStatus = c8 || 'Confirmed';
        } else {
          // Legacy 4/5-column format fallback
          name = c1?.toString()?.trim() || '';
          phone = c2 || null;
          email = c3 || null;
          timeStr = c4 || '';
          staffName = c5 || '';
        }

        if (!name || !timeStr) { skipped++; return; }

        let targetClerkId = clerk_id;
        if (staffName) {
          const matched = db.prepare('SELECT id FROM clerks WHERE LOWER(name) LIKE LOWER(?)').get(`%${staffName.trim()}%`);
          if (matched) {
            targetClerkId = matched.id;
          }
        }

        rows.push({ name, phone, email, time: timeStr, clerkId: targetClerkId, date: dateStr, service, duration, bookingStatus });
      });

      // Clear today's direct appointments for all affected clerks in this file
      const affectedClerkIds = [...new Set(rows.map(r => r.clerkId).filter(Boolean))];
      if (affectedClerkIds.length === 0) affectedClerkIds.push(clerk_id);

      const placeholders = affectedClerkIds.map(() => '?').join(',');
      db.prepare(`DELETE FROM appointments WHERE date = ? AND type = 'direct' AND clerk_id IN (${placeholders})`)
        .run(today, ...affectedClerkIds);

      rows.forEach(r => {
        insertAppt.run(r.name, r.phone, r.email, r.time, r.clerkId, r.date || today, r.service, r.duration, r.bookingStatus);
        imported++;
      });

      // Notify all affected clerks and admin
      affectedClerkIds.forEach(cId => {
        io.to(`clerk-${cId}`).emit('appointments:refresh');
      });
      io.emit('appointments:refresh');
      io.to('admin').emit('appointments:imported', { count: imported, date: today, clerkId: clerk_id });

      res.json({ success: true, imported, skipped });
    } catch (err) {
      console.error('Clerk Excel import error:', err);
      res.status(500).json({ error: 'Failed to read Excel file. Please check the format.' });
    }
  });

  // DELETE clear a clerk's own today appointments
  router.delete('/clerk/:clerk_id/today', (req, res) => {
    const { clerk_id } = req.params;
    const today = new Date().toISOString().split('T')[0];
    db.prepare(`DELETE FROM appointments WHERE date = ? AND type = 'direct' AND clerk_id = ?`).run(today, clerk_id);
    io.to(`clerk-${clerk_id}`).emit('appointments:refresh');
    io.to('admin').emit('appointments:refresh');
    res.json({ success: true });
  });

  // POST mark appointment as arrived (triggered by kiosk check-in)
  router.post('/:id/arrived', (req, res) => {
    const { id } = req.params;
    const { member_id } = req.body;

    // Fetch current appointment to get appointment_time
    const existing = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);

    // Determine if the member is arriving late
    let isLate = 0;
    if (existing && existing.appointment_time) {
      try {
        const now = new Date();
        const timeStr = existing.appointment_time.trim();
        let apptHour = 0, apptMin = 0;

        // Handle "HH:MM AM/PM" format
        const ampm = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        // Handle "HH:MM" 24-hr format
        const h24  = timeStr.match(/^(\d{1,2}):(\d{2})$/);

        if (ampm) {
          apptHour = parseInt(ampm[1]);
          apptMin  = parseInt(ampm[2]);
          const period = ampm[3].toUpperCase();
          if (period === 'PM' && apptHour !== 12) apptHour += 12;
          if (period === 'AM' && apptHour === 12) apptHour = 0;
        } else if (h24) {
          apptHour = parseInt(h24[1]);
          apptMin  = parseInt(h24[2]);
        }

        const apptTime = new Date();
        apptTime.setHours(apptHour, apptMin, 0, 0);
        if (now > apptTime) isLate = 1;
      } catch (e) { /* if parsing fails, don't mark late */ }
    }

    db.prepare(`
      UPDATE appointments SET arrival_status = 'in-lobby', member_id = ?, is_late = ? WHERE id = ?
    `).run(member_id || null, isLate, id);

    const appt = db.prepare(`
      SELECT a.*, c.name as clerk_name, c.counter
      FROM appointments a LEFT JOIN clerks c ON a.clerk_id = c.id
      WHERE a.id = ?
    `).get(id);

    // Notify the assigned clerk
    if (appt.clerk_id) {
      io.to(`clerk-${appt.clerk_id}`).emit('appointment:arrived', appt);
    }
    io.to('portal-pool').emit('appointment:arrived', appt);
    io.to('admin').emit('appointment:arrived', appt);

    res.json({ success: true, appointment: appt });
  });

  // POST verify appointment (kiosk name + phone check - flexible & forgiving)
  router.post('/verify', (req, res) => {
    const { name, phone } = req.body;
    const today = new Date().toISOString().split('T')[0];

    const allTodayAppts = db.prepare(`
      SELECT a.*, c.name as clerk_name, c.counter
      FROM appointments a
      LEFT JOIN clerks c ON a.clerk_id = c.id
      WHERE a.date = ? AND a.type = 'direct'
        AND a.arrival_status = 'not-arrived'
    `).all(today);

    // Normalize search query
    const cleanSearchName = (name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const searchTokens = cleanSearchName.split(' ').filter(t => t.length > 0);
    const searchDigits = (phone || '').replace(/\D/g, '');

    const matches = allTodayAppts.filter(appt => {
      const cleanApptName = (appt.name || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
      const apptTokens = cleanApptName.split(' ').filter(t => t.length > 0);
      const apptDigits = (appt.phone_number || '').replace(/\D/g, '');

      // 1. Name Matching Checks
      // Exact or Substring match
      let nameMatches = cleanApptName.includes(cleanSearchName) || cleanSearchName.includes(cleanApptName);

      // Token / Multi-word match (e.g., "Ursal Louise" matches "Louise Margarette Ursal")
      if (!nameMatches && searchTokens.length > 0) {
        // Check if all search words exist in appointment name
        const allTokensFound = searchTokens.every(st =>
          apptTokens.some(at => at.includes(st) || st.includes(at))
        );
        if (allTokensFound) nameMatches = true;
      }

      // If still no match and query has at least 3 chars, check if any major token matches (first or last name)
      if (!nameMatches && searchTokens.length > 1) {
        const majorTokens = searchTokens.filter(t => t.length >= 3);
        const matchCount = majorTokens.filter(mt =>
          apptTokens.some(at => at.includes(mt) || mt.includes(at))
        ).length;
        if (matchCount >= 2 || (majorTokens.length === 1 && matchCount === 1)) {
          nameMatches = true;
        }
      }

      if (!nameMatches) return false;

      // 2. Phone Matching Check (Forgiving)
      // If phone was provided in search:
      if (searchDigits.length >= 4) {
        // If appointment has a phone in DB, check if last 7 digits or subset matches
        if (apptDigits.length >= 4) {
          const searchTail = searchDigits.slice(-7);
          const apptTail = apptDigits.slice(-7);
          const phoneMatches = apptDigits.includes(searchDigits) ||
                               searchDigits.includes(apptDigits) ||
                               apptTail.includes(searchTail) ||
                               searchTail.includes(apptTail);
          return phoneMatches;
        }
        // If DB has no phone for this record, allow the match by name
        return true;
      }

      return true;
    });

    res.json({ found: matches.length > 0, appointments: matches });
  });

  // POST mark appointment as no-show
  router.post('/:id/noshow', (req, res) => {
    const { id } = req.params;
    db.prepare("UPDATE appointments SET arrival_status = 'no-show' WHERE id = ?").run(id);
    const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
    if (appt && appt.clerk_id) io.to(`clerk-${appt.clerk_id}`).emit('appointments:refresh');
    io.to('admin').emit('appointment:noshow', appt);
    res.json({ success: true });
  });

  // POST mark appointment as done (after transaction concluded)
  router.post('/:id/done', (req, res) => {
    const { id } = req.params;
    db.prepare("UPDATE appointments SET arrival_status = 'done' WHERE id = ?").run(id);
    const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
    if (appt && appt.clerk_id) io.to(`clerk-${appt.clerk_id}`).emit('appointments:refresh');
    io.to('admin').emit('appointment:done', appt);
    res.json({ success: true });
  });

  // POST hand off a BAS appointment to another clerk
  router.post('/:id/handoff', (req, res) => {
    const { id } = req.params;
    const { new_clerk_id } = req.body;
    if (!new_clerk_id) return res.status(400).json({ error: 'new_clerk_id is required.' });
    const oldAppt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(id);
    db.prepare("UPDATE appointments SET clerk_id = ? WHERE id = ?").run(new_clerk_id, id);
    const appt = db.prepare(`
      SELECT a.*, c.name as clerk_name FROM appointments a
      LEFT JOIN clerks c ON a.clerk_id = c.id WHERE a.id = ?
    `).get(id);
    // Notify old and new clerk
    if (oldAppt && oldAppt.clerk_id) io.to(`clerk-${oldAppt.clerk_id}`).emit('appointments:refresh');
    io.to(`clerk-${new_clerk_id}`).emit('appointments:refresh');
    io.to('admin').emit('appointments:refresh');
    res.json({ success: true, appointment: appt });
  });


  // POST add a portal appointment via kiosk
  router.post('/portal/checkin', (req, res) => {
    const {
      name, sss_number, appointment_time, transaction_type,
      customer_type, sex, age, region, dpa_consent
    } = req.body;
    const today = new Date().toISOString().split('T')[0];

    if (!name || !appointment_time) {
      return res.status(400).json({ error: 'Name and appointment time are required.' });
    }

    const txType = transaction_type || 'Portal Appointment';

    // Create member record with specific transaction purpose and ARTA demographics
    const memberResult = db.prepare(`
      INSERT INTO members (
        name, sss_number, transaction_type, routed_to, entry_type,
        customer_type, sex, age, region, dpa_consent
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, sss_number || null, txType, 'portal-pool', 'portal-appointment',
      customer_type || null, sex || null, age ? parseInt(age) : null,
      region || 'Region VII - Central Visayas', dpa_consent || 'agree'
    );

    // Create appointment record
    const apptResult = db.prepare(`
      INSERT INTO appointments (name, appointment_time, type, arrival_status, member_id, date, service)
      VALUES (?, ?, 'portal', 'in-lobby', ?, ?, ?)
    `).run(name, appointment_time, memberResult.lastInsertRowid, today, txType);

    const appt = db.prepare('SELECT * FROM appointments WHERE id = ?').get(apptResult.lastInsertRowid);
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberResult.lastInsertRowid);

    io.to('portal-pool').emit('appointment:arrived', { ...appt, member });
    io.to('counter-pool').emit('appointment:arrived', { ...appt, member });
    io.to('admin').emit('appointment:arrived', { ...appt, member });

    res.json({ success: true, appointment: appt, member });
  });

  return router;
};
