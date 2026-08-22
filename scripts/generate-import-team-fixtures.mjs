import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from '@e965/xlsx';

const root = path.resolve('test-fixtures/import-teams');
fs.mkdirSync(root, { recursive: true });

function writeWorkbook(fileName, sheets) {
  const workbook = XLSX.utils.book_new();
  for (const { name, rows, hidden = false } of sheets) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name);
    if (hidden) {
      const metadata = workbook.Workbook?.Sheets?.find((sheet) => sheet.name === name);
      if (metadata) metadata.Hidden = 1;
    }
  }
  fs.writeFileSync(path.join(root, fileName), XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }));
}

writeWorkbook('02-division-tabs.xlsx', [
  {
    name: 'Mixed 3.5',
    rows: [
      ['Spring social tournament - mixed entries'],
      ['Registration #', 'Player 1 First Name', 'Player 2 First Name', 'Email', 'DUPR Average', 'Gender'],
      ['M-01', 'Avery Stone', 'Morgan Reed', 'avery.stone@example.test', 3.41, 'Mixed'],
      ['M-02', 'Casey Young', 'Drew Park', 'casey.young@example.test', 3.36, 'Mixed']
    ]
  },
  {
    name: "Men's 4.0",
    rows: [
      ['Registration #', 'Player 1 First Name', 'Player 2 First Name', 'Email', 'DUPR Average', 'Gender'],
      ['M-11', 'Elliot King', 'Noah Bell', 'elliot.king@example.test', 4.01, 'M'],
      ['M-12', 'Parker Cole', 'Quinn Fox', 'parker.cole@example.test', 4.08, 'M']
    ]
  },
  {
    name: 'Payments',
    rows: [
      ['Registration #', 'Card last four', 'Amount', 'Paid at'],
      ['M-01', '4242', '$40', '2026-08-01']
    ],
    hidden: true
  },
  {
    name: 'Instructions',
    rows: [['Do not edit this sheet'], ['Payment and waiver details are not team data.']]
  }
]);

writeWorkbook('04-block-layout.xlsx', [
  {
    name: 'Organizer export',
    rows: [
      ['Copied from a printable roster - unrelated notes follow below'],
      ['Mixed 3.5', '', '', "Men's 4.0", '', '', '', ''],
      ['Player 1', 'Player 2', 'DUPR Avg', 'Player 1', 'Player 2', 'Gender', 'Phone', 'Email'],
      ['Smith', 'Jones', 3.42, 'Brown', 'Lee', 'M', '207-555-0141', 'brown.lee@example.test'],
      ['Davis', 'Chen', 3.38, 'Fox', 'Young', 'M', '207-555-0142', 'fox.young@example.test'],
      ['Garcia', 'Patel', 3.51, '', '', '', '', ''],
      ['Roster totals', 3, '', 2, '', '', '', ''],
      ['Reminder: confirm waivers before check-in', '', '', '', '', '', '', '']
    ]
  }
]);

console.log('Generated 02-division-tabs.xlsx and 04-block-layout.xlsx');
