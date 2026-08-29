const ExcelJS = require('exceljs');
const path = require('path');

async function createSampleExcel() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Social Security System — Toledo Branch';
  workbook.lastModifiedBy = 'Branch Administrator';
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet('Appointment Bookings', {
    views: [{ showGridLines: true }]
  });

  // Define Columns
  sheet.columns = [
    { header: 'Date & Time',       key: 'dateTime', width: 22 },
    { header: 'Customer Name',     key: 'name',     width: 26 },
    { header: 'Customer Email',    key: 'email',    width: 28 },
    { header: 'Customer Phone',    key: 'phone',    width: 18 },
    { header: 'Staff Name',        key: 'staff',    width: 22 },
    { header: 'Service',           key: 'service',  width: 34 },
    { header: 'Duration (mins)',   key: 'duration', width: 16 },
    { header: 'Status',            key: 'status',   width: 14 }
  ];

  // Style Header Row (SSS Deep Navy #071E4A with White Bold Text)
  const headerRow = sheet.getRow(1);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '071E4A' }
    };
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFF' }
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'D1D5DB' } },
      left: { style: 'thin', color: { argb: 'D1D5DB' } },
      bottom: { style: 'medium', color: { argb: '0038A8' } },
      right: { style: 'thin', color: { argb: 'D1D5DB' } }
    };
  });

  // Generate date strings for Today and Tomorrow for demo flexibility
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  const sampleData = [
    {
      dateTime: `${todayStr} 08:30 AM`,
      name: 'Juan dela Cruz',
      email: 'juan.delacruz@gmail.com',
      phone: '09171234567',
      staff: 'Christie Sillar',
      service: 'Member Data Updating (SS Form E-4)',
      duration: 15,
      status: 'Confirmed'
    },
    {
      dateTime: `${todayStr} 09:00 AM`,
      name: 'Maria Clara Santos',
      email: 'maria.clara@yahoo.com',
      phone: '09289876543',
      staff: 'Noeme Mamac',
      service: 'Maternity Benefit Claim',
      duration: 20,
      status: 'Confirmed'
    },
    {
      dateTime: `${todayStr} 09:30 AM`,
      name: 'Jose P. Rizal',
      email: 'jose.rizal@outlook.com',
      phone: '09185551234',
      staff: 'Glory May Tagpuno',
      service: 'Retirement Benefit Claim',
      duration: 20,
      status: 'Confirmed'
    },
    {
      dateTime: `${todayStr} 10:00 AM`,
      name: 'Andres Bonifacio',
      email: 'andres.bonifacio@gmail.com',
      phone: '09228889900',
      staff: 'Emmie Flores',
      service: 'Sickness Benefit Claim',
      duration: 15,
      status: 'Confirmed'
    },
    {
      dateTime: `${todayStr} 10:30 AM`,
      name: 'Teresa Magbanua',
      email: 'teresa.magbanua@gmail.com',
      phone: '09191112233',
      staff: 'Mabelle Paz',
      service: 'Senior Citizen / Pensioner Assistance',
      duration: 20,
      status: 'Confirmed'
    },
    {
      dateTime: `${todayStr} 11:00 AM`,
      name: 'Emilio Aguinaldo',
      email: 'emilio.aguinaldo@gov.ph',
      phone: '09173334455',
      staff: 'Maricar Boniao',
      service: 'Death / Funeral Claim',
      duration: 25,
      status: 'Confirmed'
    },
    {
      dateTime: `${todayStr} 01:30 PM`,
      name: 'Melchora Aquino',
      email: 'tandang.sora@gmail.com',
      phone: '09204445566',
      staff: 'Noeme Mamac',
      service: 'Senior Citizen / Pension Inquiry',
      duration: 15,
      status: 'Confirmed'
    },
    {
      dateTime: `${todayStr} 02:00 PM`,
      name: 'Antonio Luna',
      email: 'antonio.luna@army.mil.ph',
      phone: '09187778899',
      staff: 'Glory May Tagpuno',
      service: 'Salary / Calamity Loan Application',
      duration: 15,
      status: 'Confirmed'
    },
    {
      dateTime: `${todayStr} 02:30 PM`,
      name: 'Gabriela Silang',
      email: 'gabriela.silang@yahoo.com',
      phone: '09216667788',
      staff: 'Emmie Flores',
      service: 'Member Data Updating (SS Form E-4)',
      duration: 15,
      status: 'Confirmed'
    },
    {
      dateTime: `${todayStr} 03:00 PM`,
      name: 'Apolinario Mabini',
      email: 'apolinario.mabini@law.edu.ph',
      phone: '09179990011',
      staff: 'Mabelle Paz',
      service: 'Disability Benefit Claim',
      duration: 20,
      status: 'Confirmed'
    },
    {
      dateTime: `${todayStr} 03:30 PM`,
      name: 'Francisco Baltazar',
      email: 'balagtas.francisco@gmail.com',
      phone: '09192223344',
      staff: 'Maricar Boniao',
      service: 'Contribution Verification / Inquiries',
      duration: 15,
      status: 'Confirmed'
    },
    {
      dateTime: `${todayStr} 04:00 PM`,
      name: 'Diego Silang',
      email: 'diego.silang@history.ph',
      phone: '09178881234',
      staff: 'Christie Sillar',
      service: 'Payment & PRN Verification',
      duration: 15,
      status: 'Confirmed'
    }
  ];

  // Add Data Rows with Alternating Row Colors
  sampleData.forEach((item, index) => {
    const row = sheet.addRow(item);
    row.height = 22;
    const isEven = index % 2 === 0;
    row.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 10, color: { argb: '1F2937' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFFFFF' : 'F8FAFC' }
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'E2E8F0' } },
        left: { style: 'thin', color: { argb: 'E2E8F0' } },
        bottom: { style: 'thin', color: { argb: 'E2E8F0' } },
        right: { style: 'thin', color: { argb: 'E2E8F0' } }
      };

      // Alignment rules
      if (colNumber === 1 || colNumber === 4 || colNumber === 7 || colNumber === 8) {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }

      // Highlight Status column in green
      if (colNumber === 8) {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: '15803D' } };
      }
    });
  });

  const outputPath = path.join(__dirname, '..', 'SSS_Toledo_Sample_Appointment_Bookings.xlsx');
  await workbook.xlsx.writeFile(outputPath);
  console.log(`✅ Sample Excel successfully generated: ${outputPath}`);
}

createSampleExcel().catch(console.error);
