'use strict';

const { parseMessage, get, unescape } = require('./parser');
const { messageTypeLabel } = require('./dictionary');

/* ------------------------------------------------------------------ */
/* Value checks: each returns null when the value is fine, else a reason */
/* ------------------------------------------------------------------ */

const DTM_RE = /^(\d+)(?:\.\d{1,4})?(?:[+-](\d{4}))?$/;
const DTM_PARTS_RE = /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?$/;

/** HL7 date/time: YYYY[MM[DD[HH[MM[SS[.S]]]]]][+/-ZZZZ] */
function checkDtm(v) {
  const m = DTM_RE.exec(v);
  const parts = m && DTM_PARTS_RE.exec(m[1]);
  // A fraction of a second is only allowed after the seconds.
  const fractionOk = !m || !v.includes('.') || m[1].length === 14;
  if (!parts || !fractionOk) return 'is not a valid HL7 date/time (expected YYYY[MM[DD[HH[MM[SS]]]]])';
  const [, y, mo, d, h, mi, s] = parts;
  const tz = m[2];
  if (mo !== undefined && (+mo < 1 || +mo > 12)) return `has an invalid month (${mo})`;
  if (d !== undefined) {
    const daysInMonth = new Date(Date.UTC(+y, +mo, 0)).getUTCDate();
    if (+d < 1 || +d > daysInMonth) return `has an invalid day (${d})`;
  }
  if (h !== undefined && +h > 23) return `has an invalid hour (${h})`;
  if (mi !== undefined && +mi > 59) return `has an invalid minute (${mi})`;
  if (s !== undefined && +s > 59) return `has an invalid second (${s})`;
  if (tz !== undefined && (+tz.slice(0, 2) > 14 || +tz.slice(2) > 59)) return `has an invalid time zone offset (${tz})`;
  return null;
}

function checkNm(v) {
  return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v) ? null : 'is not a valid number';
}

function checkSi(v) {
  return /^\d+$/.test(v) ? null : 'is not a valid sequence number (whole number)';
}

/* ------------------------------------------------------------------ */
/* Rules (kept small on purpose - they grow in later steps)            */
/* ------------------------------------------------------------------ */

// Fields that must not be empty: segment -> [[field number, name], ...]
const REQUIRED_FIELDS = {
  MSH: [[7, 'Date/Time Of Message'], [9, 'Message Type'], [10, 'Message Control ID'], [11, 'Processing ID'], [12, 'Version ID']],
  EVN: [[2, 'Recorded Date/Time']],
  PID: [[3, 'Patient Identifier List'], [5, 'Patient Name']],
  PV1: [[2, 'Patient Class']],
  ORC: [[1, 'Order Control']],
  OBR: [[4, 'Universal Service Identifier']],
  OBX: [[3, 'Observation Identifier'], [11, 'Observation Result Status']],
  MSA: [[1, 'Acknowledgment Code'], [2, 'Message Control ID']],
  MRG: [[1, 'Prior Patient Identifier List']],
  IAM: [[3, 'Allergen Code/Mnemonic/Description'], [6, 'Allergy Action Code']],
};

// Date/time fields: segment -> field numbers (the first component is checked)
const DATE_FIELDS = {
  MSH: [7],
  EVN: [2, 3, 6],
  PID: [7, 29, 33],
  PV1: [44, 45],
  OBR: [6, 7, 8, 14, 22, 36],
  OBX: [12, 14, 19],
  IAM: [11, 13],
  ORC: [9, 15],
};

// Segments whose field 1 is a sequence number (Set ID)
const SET_ID_SEGMENTS = new Set(['PID', 'PV1', 'OBR', 'OBX', 'NK1', 'AL1', 'DG1', 'NTE', 'IAM']);

// How often each segment may appear, by message type: segment -> [minimum, maximum].
// Segments that are not listed are not counted. Repeating groups (such as the OBR/OBX
// groups of an ORU) have no maximum.
const MANY = Infinity;

const ADT_COUNTS = {
  EVN: [1, 1],
  PID: [1, 1],
  PD1: [0, 1],
  PV1: [1, 1],
  PV2: [0, 1],
};

const MERGE_COUNTS = { EVN: [1, 1], PID: [1, 1], PD1: [0, 1], MRG: [1, 1], PV1: [0, 1] };
const ALLERGY_COUNTS = { EVN: [1, 1], PID: [1, 1], PV1: [0, 1], PV2: [0, 1], IAM: [0, MANY] };

// Keyed by MSH-9.1 ^ MSH-9.2 (or by MSH-9.1 alone, for example ACK).
// `retiredFrom` / `notBefore` are HL7 versions: the event was withdrawn in, or only exists from, that version.
const MESSAGE_RULES = {
  'ADT^A01': { counts: ADT_COUNTS },
  'ADT^A02': { counts: ADT_COUNTS },
  'ADT^A03': { counts: ADT_COUNTS },
  'ADT^A04': { counts: ADT_COUNTS },
  'ADT^A08': { counts: ADT_COUNTS },
  'ADT^A18': { counts: MERGE_COUNTS, retiredFrom: '2.4', replacement: 'ADT^A40' },
  'ADT^A40': { counts: MERGE_COUNTS },
  'ADT^A60': { counts: ALLERGY_COUNTS, recommended: ['IAM'], notBefore: '2.4' },
  'ORU^R01': { counts: { OBR: [1, MANY] }, recommended: ['PID'] },
  'ORM^O01': { counts: { ORC: [1, MANY], PID: [0, 1], PD1: [0, 1], PV1: [0, 1], PV2: [0, 1] }, recommended: ['PID', 'OBR'] },
  ACK: { counts: { MSA: [1, 1], UAC: [0, 1] } },
};

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

/* ------------------------------------------------------------------ */

function makeAdd(issues) {
  return (severity, rule, message, loc = {}) => {
    issues.push({
      severity,
      rule,
      message,
      path: loc.path || '',
      segment: loc.segment || '',
      start: loc.start ?? 0,
      end: loc.end ?? 0,
    });
  };
}

// Marks the first three characters of a segment (its name)
const segLoc = (seg, path = seg.name) => ({ path, segment: seg.name, start: seg.start, end: seg.start + Math.min(3, seg.raw.length) });

// Marks a field; an empty field is marked by the separator in front of it
function fieldLoc(seg, field, start, end) {
  const separator = field.raw === '' ? 1 : 0;
  return {
    path: `${seg.name}-${field.seq}`,
    segment: seg.name,
    start: start ?? Math.max(seg.start, field.start - separator),
    end: end ?? Math.max(field.end, field.start + 1),
  };
}

function checkHeader(msg, add) {
  const first = msg.segments[0];
  if (first.name !== 'MSH') {
    add('error', 'MSH_FIRST', `A message must start with an MSH segment, but the first segment is "${first.name}".`, segLoc(first));
  }
  const mshSegments = msg.segments.filter((s) => s.name === 'MSH');
  if (mshSegments.length > 1) {
    add('error', 'MULTIPLE_MSH', 'More than one MSH segment found - this looks like several messages. Validate them one at a time.', segLoc(mshSegments[1]));
  }
  const msh = mshSegments[0];
  if (!msh) return;
  const enc = msg.encoding || '';
  const encField = msh.fields[2];
  if (enc.length < 4) {
    add('warning', 'ENCODING_CHARS', String.raw`MSH-2 should contain the four encoding characters ^~\& but has ${enc.length}.`, fieldLoc(msh, encField));
  }
  if (new Set([msg.delims.field, ...enc]).size !== enc.length + 1) {
    add('error', 'ENCODING_CHARS_DISTINCT', 'The field separator and the encoding characters must all be different.', fieldLoc(msh, encField));
  }
}

function checkRequiredFields(seg, add) {
  for (const [no, name] of REQUIRED_FIELDS[seg.name] || []) {
    const field = seg.fields[no];
    if (!field) {
      add('error', 'REQUIRED_FIELD', `${seg.name}-${no} (${name}) is required but missing.`, segLoc(seg, `${seg.name}-${no}`));
    } else if (field.raw.trim() === '') {
      add('error', 'REQUIRED_FIELD', `${seg.name}-${no} (${name}) is required but empty.`, fieldLoc(seg, field));
    }
  }
}

function checkDateFields(seg, msg, add) {
  for (const no of DATE_FIELDS[seg.name] || []) {
    const field = seg.fields[no];
    if (!field) continue;
    for (const rep of field.reps) {
      const comp = rep.comps[0];
      if (!comp || comp.raw.trim() === '') continue;
      const reason = checkDtm(unescape(comp.raw, msg.delims).trimEnd());
      if (reason) {
        add('error', 'DATA_TYPE', `${seg.name}-${no} value "${comp.raw}" ${reason}.`, fieldLoc(seg, field, comp.start, Math.max(comp.end, comp.start + 1)));
      }
    }
  }
}

function checkSetId(seg, add) {
  const field = seg.fields[1];
  if (!SET_ID_SEGMENTS.has(seg.name) || !field || field.raw.trim() === '') return;
  const reason = checkSi(field.raw.trimEnd());
  if (reason) {
    add('error', 'DATA_TYPE', `${seg.name}-1 value "${field.raw}" ${reason}.`, fieldLoc(seg, field));
  }
}

// OBX: the value type (OBX-2) decides how OBX-5 is read
function checkObx(seg, add) {
  const typeField = seg.fields[2];
  const valueType = typeField ? typeField.raw.trim() : '';
  const value = seg.fields[5];
  if (!value || value.raw === '') return;
  if (valueType === '') {
    add('error', 'OBX_VALUE_TYPE', 'OBX-5 has a value but OBX-2 (Value Type) is empty.', typeField ? fieldLoc(seg, typeField) : segLoc(seg, 'OBX-2'));
    return;
  }
  if (valueType !== 'NM') return;
  for (const rep of value.reps) {
    const reason = rep.raw.trim() === '' ? null : checkNm(rep.raw.trimEnd());
    if (reason) {
      add('error', 'DATA_TYPE', `OBX-5 value "${rep.raw}" ${reason} (OBX-2 says NM).`, fieldLoc(seg, value, rep.start, Math.max(rep.end, rep.start + 1)));
    }
  }
}

// ORC-2 (placer) or ORC-3 (filler) order number must be present; which one depends on who creates the order
function checkOrderNumbers(seg, add) {
  const empty = (n) => !seg.fields[n] || seg.fields[n].raw.trim() === '';
  if (empty(2) && empty(3)) {
    const field = seg.fields[2];
    add('warning', 'ORDER_NUMBER', 'ORC-2 (placer order number) and ORC-3 (filler order number) are both empty; an order needs at least one of them.', field ? fieldLoc(seg, field) : segLoc(seg, 'ORC-2'));
  }
}

function checkSegment(seg, msg, add) {
  if (!/^[A-Z][A-Z0-9]{2}$/.test(seg.name)) {
    add('error', 'SEGMENT_NAME', `"${seg.name}" is not a valid segment name (three upper-case letters or digits).`, {
      path: seg.name, segment: seg.name, start: seg.start, end: seg.start + Math.max(1, seg.name.length),
    });
    return;
  }
  checkRequiredFields(seg, add);
  checkSpaces(seg, add);
  checkDateFields(seg, msg, add);
  checkSetId(seg, add);
  if (seg.name === 'OBX') checkObx(seg, add);
  if (seg.name === 'ORC') checkOrderNumbers(seg, add);
}

/** Message type (MSH-9) and the segments it needs; returns the type label. */
function checkMessageType(msg, msh, add) {
  const code = get(msg, 'MSH-9.1').trim();
  const event = get(msg, 'MSH-9.2').trim();
  if (code && !event && code !== 'ACK') {
    add('error', 'MSH9_EVENT', `MSH-9.2 (trigger event) is missing for message type ${code}.`, fieldLoc(msh, msh.fields[9]));
  }
  const type = messageTypeLabel(code, event);
  const rules = MESSAGE_RULES[type] || MESSAGE_RULES[code];
  if (rules) {
    checkVersion(msg, msh, type, rules, add);
    checkSegmentCounts(msg, msh, type, rules, add);
  }
  return type;
}

/** Dotted HL7 versions compared number by number: "2.5.1" is after "2.5". */
function versionAtLeast(version, minimum) {
  const a = version.split('.').map(Number);
  const b = minimum.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

/** Warns when the event does not exist in the message's HL7 version (MSH-12). */
function checkVersion(msg, msh, type, rules, add) {
  const version = get(msg, 'MSH-12.1').trim();
  if (!/^\d+(\.\d+)*$/.test(version)) return;
  const where = msh.fields[12] ? fieldLoc(msh, msh.fields[12]) : segLoc(msh, 'MSH-12');
  if (rules.retiredFrom && versionAtLeast(version, rules.retiredFrom)) {
    add('warning', 'EVENT_RETIRED', `${type} was withdrawn in HL7 ${rules.retiredFrom}; version ${version} should use ${rules.replacement} instead.`, where);
  }
  if (rules.notBefore && !versionAtLeast(version, rules.notBefore)) {
    add('warning', 'EVENT_NOT_IN_VERSION', `${type} is only defined from HL7 ${rules.notBefore}, but the message says version ${version}.`, where);
  }
}

function checkSegmentCounts(msg, msh, type, rules, add) {
  for (const [name, [min, max]] of Object.entries(rules.counts)) {
    const found = msg.segments.filter((s) => s.name === name);
    if (found.length < min) {
      add('error', 'MISSING_SEGMENT', `Segment ${name} is required in ${type} (at least ${min} expected, ${found.length} found).`, segLoc(msh));
    } else if (found.length > max) {
      const verb = max === 1 ? 'is' : 'are';
      add('error', 'TOO_MANY_SEGMENTS', `Segment ${name} appears ${found.length} times in ${type}, but at most ${max} ${verb} allowed.`, segLoc(found[max]));
    }
  }
  for (const name of rules.recommended || []) {
    if (!msg.segments.some((s) => s.name === name)) {
      add('warning', 'RECOMMENDED_SEGMENT', `Segment ${name} is normally present in ${type} but is missing.`, segLoc(msh));
    }
  }
}

function validate(text) {
  const msg = parseMessage(text);
  const issues = [];
  const add = makeAdd(issues);

  if (msg.segments.length === 0) {
    add('error', 'EMPTY_MESSAGE', 'There is no HL7 content to validate.');
    return finish(msg, issues);
  }

  checkHeader(msg, add);
  for (const seg of msg.segments) checkSegment(seg, msg, add);

  const msh = msg.segments.find((s) => s.name === 'MSH');
  const type = msh ? checkMessageType(msg, msh, add) : '';
  return finish(msg, issues, type);
}

/**
 * Spaces in field values. HL7 string values are left-justified and trailing spaces are not
 * significant, so: trailing spaces are only noted (info), leading spaces are a warning, and a
 * value that is nothing but spaces counts as empty. Each field is reported at most once per rule.
 */
function checkSpaces(seg, add) {
  for (let seq = 1; seq < seg.fields.length; seq++) {
    if (seg.name === 'MSH' && seq <= 2) continue;
    const field = seg.fields[seq];
    if (!field || field.raw === '') continue;
    // Free text (OBX-5 values, NTE comments) may legitimately start with spaces.
    const freeText = (seg.name === 'OBX' && seq === 5) || (seg.name === 'NTE' && seq === 3);
    let reportedLeading = false;
    let reportedTrailing = false;
    let reportedBlank = false;

    for (const rep of field.reps) {
      rep.comps.forEach((comp, i) => {
        const raw = comp.raw;
        if (raw === '') return;
        const partSuffix = rep.comps.length > 1 ? `.${i + 1}` : '';
        const path = `${seg.name}-${seq}${partSuffix}`;
        const loc = (start, end) => ({ path, segment: seg.name, start, end });

        if (raw.trim() === '') {
          if (!reportedBlank) {
            reportedBlank = true;
            add('info', 'SPACES_ONLY', `${path} contains only spaces and is treated as empty.`, loc(comp.start, comp.end));
          }
          return;
        }
        if (!freeText && !reportedLeading && /^[ \t]/.test(raw)) {
          reportedLeading = true;
          const length = raw.length - raw.trimStart().length;
          add('warning', 'LEADING_SPACE', `${path} starts with a space. Values are left-justified, so leading spaces should not be sent.`, loc(comp.start, comp.start + length));
        }
        if (!reportedTrailing && /[ \t]$/.test(raw)) {
          reportedTrailing = true;
          add('info', 'TRAILING_SPACE', `${path} ends with a space. HL7 treats trailing spaces as not significant, so it is accepted, but it is best removed.`, loc(comp.start + raw.trimEnd().length, comp.end));
        }
      });
    }
  }
}

/** Sort the issues, add line numbers and counts. */
function finish(msg, issues, messageType = '') {
  issues.sort((a, b) => a.start - b.start || SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const lineStarts = [0];
  for (let i = 0; i < msg.text.length; i++) {
    const c = msg.text[i];
    if (c === '\n' || (c === '\r' && msg.text[i + 1] !== '\n')) lineStarts.push(i + 1);
  }
  for (const issue of issues) {
    let line = 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= issue.start) line++;
    issue.line = line + 1;
  }

  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity]++;
  return { valid: counts.error === 0, counts, issues, messageType };
}

module.exports = { validate, checkDtm, checkNm, checkSi };
