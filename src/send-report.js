'use strict';

/** Builds the CSV report of a bulk send. Pure text work: the window and the file dialog live elsewhere. */

const MAX_RECORDS = 5000;

const COLUMNS = ['Number', 'Type', 'Control ID', 'Outcome', 'ACK code', 'Message', 'Time (ms)', 'Sent at', 'Connected again'];

/** Spreadsheets run text that starts with one of these as a formula, so such text gets a leading apostrophe. */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value) {
  let text = value === undefined || value === null ? '' : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const count = (value) => (Number.isFinite(value) && value >= 0 ? Math.round(value) : '');

function rowOf(record) {
  const r = record && typeof record === 'object' ? record : {};
  return [
    count(r.number), r.type, r.controlId, r.outcome, r.ackCode, r.message, count(r.ms),
    typeof r.sentAt === 'string' ? r.sentAt : '', r.reconnected === true ? 'yes' : 'no',
  ].map(cell).join(',');
}

/**
 * Returns the CSV text, lines ending with CRLF. Numbers are written as they are; only text columns
 * get the formula guard, so a plain number is never changed.
 */
function buildReportCsv(records) {
  const list = Array.isArray(records) ? records.slice(0, MAX_RECORDS) : [];
  return [COLUMNS.map(cell).join(','), ...list.map(rowOf)].join('\r\n') + '\r\n';
}

/** A file name for the report, e.g. msglab-send-report-20261027-001530.csv (local time). */
function reportFileName(date = new Date()) {
  const two = (n) => String(n).padStart(2, '0');
  const day = `${date.getFullYear()}${two(date.getMonth() + 1)}${two(date.getDate())}`;
  const time = `${two(date.getHours())}${two(date.getMinutes())}${two(date.getSeconds())}`;
  return `msglab-send-report-${day}-${time}.csv`;
}

module.exports = { buildReportCsv, reportFileName, COLUMNS, MAX_RECORDS };
