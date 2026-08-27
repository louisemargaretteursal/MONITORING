const ExcelJS = require('exceljs');
const http = require('http');
const fs = require('fs');

async function testExport(url, filename) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(filename);
    http.get(url, (res) => {
      res.pipe(file);
      file.on('finish', async () => {
        file.close();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.readFile(filename);
        const ws = wb.getWorksheet('Master Log');
        const rows = [];
        ws.eachRow((r, rowNum) => {
          if (rowNum >= 4) {
            rows.push({
              ticket: r.getCell(1).value,
              name: r.getCell(4).value,
              desk: r.getCell(8).value,
              outcome: r.getCell(15).value
            });
          }
        });
        console.log(`\n=== Export Result for ${filename} ===`);
        console.log(`Header Subtitle: ${ws.getCell('A2').value}`);
        console.log(`Total data rows in Master Log: ${rows.length}`);
        console.table(rows.slice(0, 5));
        resolve();
      });
    }).on('error', reject);
  });
}

async function run() {
  await testExport('http://localhost:3000/api/reports/export/excel?counter=Counter%201&outcome=finished&date=2026-08-23', 'test_filtered_export.xlsx');
  await testExport('http://localhost:3000/api/reports/export/excel?counter=PACD&date=2026-08-23', 'test_pacd_export.xlsx');
}

run().catch(console.error);
