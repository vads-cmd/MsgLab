'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildReportCsv, reportFileName, COLUMNS, MAX_RECORDS } = require('../src/send-report');

const record = (n, extra = {}) => ({ number: n, type: 'ADT^A01^ADT_A01', controlId: `C${n}`, ok: true, outcome: 'accepted', ackCode: 'AA', message: 'ACK AA: accepted.', ms: 12, reconnected: false, sentAt: '2026-10-26T10:00:00.000Z', ...extra });

test('the report has a header and one line per message, ending with CRLF', () => {
  const lines = buildReportCsv([record(1), record(2)]).split('\r\n');
  assert.equal(lines[0], COLUMNS.join(','));
  assert.equal(lines[1], '1,ADT^A01^ADT_A01,C1,accepted,AA,ACK AA: accepted.,12,2026-10-26T10:00:00.000Z,no');
  assert.equal(lines.length, 4);
  assert.equal(lines[3], '');
});

test('text with commas, quotes or line breaks is quoted', () => {
  const csv = buildReportCsv([record(1, { message: 'He said "no", twice\nreally' })]);
  assert.ok(csv.includes('"He said ""no"", twice\nreally"'));
});

test('text that a spreadsheet would run as a formula gets an apostrophe', () => {
  const csv = buildReportCsv([record(1, { message: '=HYPERLINK("x")', controlId: '+1', type: '@SUM', ackCode: '-' })]);
  const line = csv.split('\r\n')[1];
  assert.ok(line.includes(",'+1,"));
  assert.ok(line.includes(",'@SUM,") || line.startsWith("1,'@SUM,"));
  assert.ok(line.includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(line.includes(",'-,"));
});

test('numbers are written plainly and bad values become empty cells', () => {
  const line = buildReportCsv([record(3, { ms: -5, number: 'x' })]).split('\r\n')[1];
  assert.ok(line.startsWith(',ADT'));
  assert.ok(line.includes(',,2026'));
});

test('a reconnect is marked', () => {
  assert.ok(buildReportCsv([record(1, { reconnected: true })]).includes(',yes\r\n'));
});

test('nonsense gives only the header, and long lists are cut', () => {
  assert.equal(buildReportCsv('x'), COLUMNS.join(',') + '\r\n');
  assert.equal(buildReportCsv([null, 5]).split('\r\n').length, 4);
  assert.equal(buildReportCsv(Array.from({ length: MAX_RECORDS + 10 }, (_, i) => record(i + 1))).split('\r\n').length, MAX_RECORDS + 2);
});

test('the file name has the local date and time', () => {
  assert.equal(reportFileName(new Date(2026, 9, 27, 0, 15, 30)), 'msglab-send-report-20261027-001530.csv');
});
