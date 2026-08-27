const ExcelJS = require('exceljs');
const path = require('path');
const db = require('../database/db');

async function testImport() {
  const workbook = new ExcelJS.Workbook();
  const filePath = path.join(__dirname, '..', 'SSS_Toledo_Sample_Appointment_Bookings.xlsx');
  await workbook.xlsx.readFile(filePath);
  const worksheet = workbook.worksheets[0];

  const today = new Date().toISOString().split('T')[0];
  let imported = 0;

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

    console.log(`Row ${rowNumber}: [${c1}] | ${c2} | ${c4} | Staff: ${c5} | Service: ${c6} | Status: ${c8}`);
    imported++;
  });
  console.log(`\n🎉 Total Rows Verified: ${imported}`);
}

testImport().catch(console.error);
