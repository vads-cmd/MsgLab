'use strict';

const { parseMessage, get, unescape } = require('./parser');

/* ------------------------------------------------------------------ */
/* Value checks: each returns null when the value is fine, else a reason */
/* ------------------------------------------------------------------ */

const DTM_RE = /^(\d{4})(?:(\d{2})(?:(\d{2})(?:(\d{2})(?:(\d{2})(?:(\d{2})(?:\.\d{1,4})?)?)?)?)?)?(?:([+-])(\d{4}))?$/;

/** HL7 date/time: YYYY[MM[DD[HH[MM[SS[.S]]]]]][+/-ZZZZ] */
function checkDtm(v) {
  const m = DTM_RE.exec(v);
  if (!m) return 'is not a valid HL7 date/time (expected YYYY[MM[DD[HH[MM[SS]]]]])';
  const [, y, mo, d, h, mi, s, , tz] = m;
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
  return /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(v) ? null : 'is not a valid number';
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
};

// Date/time fields: segment -> field numbers (the first component is checked)
const DATE_FIELDS = {
  MSH: [7],
  EVN: [2, 3, 6],
  PID: [7, 29, 33],
  PV1: [44, 45],
  OBR: [6, 7, 8, 14, 22, 36],
  OBX: [12, 14, 19],
};

// Segments whose field 1 is a sequence number (Set ID)
const SET_ID_SEGMENTS = ['PID', 'PV1', 'OBR', 'OBX', 'NK1', 'AL1', 'DG1', 'NTE'];

const ADT_SEGMENTS = { required: ['EVN', 'PID', 'PV1'] };

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

// Keyed by MSH-9.1 ^ MSH-9.2 (or by MSH-9.1 alone, for example ACK)
const MESSAGE_RULES = {
  'ADT^A01': { counts: ADT_COUNTS },
  'ADT^A02': { counts: ADT_COUNTS },
  'ADT^A03': { counts: ADT_COUNTS },
  'ADT^A04': { counts: ADT_COUNTS },
  'ADT^A08': { counts: ADT_COUNTS },
  'ORU^R01': { counts: { OBR: [1, MANY] }, recommended: ['PID'] },
  'ORM^O01': { counts: { ORC: [1, MANY], PID: [0, 1], PD1: [0, 1], PV1: [0, 1], PV2: [0, 1] }, recommended: ['PID', 'OBR'] },
  ACK: { counts: { MSA: [1, 1], UAC: [0, 1] } },
};

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

/* ------------------------------------------------------------------ */

function validate(text) {
  const msg = parseMessage(text);
  const issues = [];

  const add = (severity, rule, message, loc = {}) => {
    issues.push({
      severity,
      rule,
      message,
      path: loc.path || '',
      segment: loc.segment || '',
      start: loc.start == null ? 0 : loc.start,
      end: loc.end == null ? 0 : loc.end,
    });
  };
  // Marks the first three characters of a segment (its name)
  const segLoc = (seg, path = seg.name) => ({ path, segment: seg.name, start: seg.start, end: seg.start + Math.min(3, seg.raw.length) });
  // Marks a field; an empty field is marked by the separator in front of it
  const fieldLoc = (seg, field, start, end) => ({
    path: `${seg.name}-${field.seq}`,
    segment: seg.name,
    start: start != null ? start : Math.max(seg.start, field.start - (field.raw === '' ? 1 : 0)),
    end: end != null ? end : Math.max(field.end, field.start + 1),
  });

  if (msg.segments.length === 0) {
    add('error', 'EMPTY_MESSAGE', 'There is no HL7 content to validate.');
    return finish(msg, issues);
  }

  /* ---- message header ---- */
  const first = msg.segments[0];
  if (first.name !== 'MSH') {
    add('error', 'MSH_FIRST', `A message must start with an MSH segment, but the first segment is "${first.name}".`, segLoc(first));
  }
  const mshSegments = msg.segments.filter((s) => s.name === 'MSH');
  if (mshSegments.length > 1) {
    add('error', 'MULTIPLE_MSH', 'More than one MSH segment found - this looks like several messages. Validate them one at a time.', segLoc(mshSegments[1]));
  }
  const msh = mshSegments[0];
  if (msh) {
    const enc = msg.encoding || '';
    const encField = msh.fields[2];
    if (enc.length < 4) {
      add('warning', 'ENCODING_CHARS', `MSH-2 should contain the four encoding characters ^~\\& but has ${enc.length}.`, fieldLoc(msh, encField));
    }
    if (new Set([msg.delims.field, ...enc]).size !== enc.length + 1) {
      add('error', 'ENCODING_CHARS_DISTINCT', 'The field separator and the encoding characters must all be different.', fieldLoc(msh, encField));
    }
  }

  /* ---- segment by segment ---- */
  for (const seg of msg.segments) {
    if (!/^[A-Z][A-Z0-9]{2}$/.test(seg.name)) {
      add('error', 'SEGMENT_NAME', `"${seg.name}" is not a valid segment name (three upper-case letters or digits).`, {
        path: seg.name, segment: seg.name, start: seg.start, end: seg.start + Math.max(1, seg.name.length),
      });
      continue;
    }

    // Required fields
    for (const [no, name] of REQUIRED_FIELDS[seg.name] || []) {
      const field = seg.fields[no];
      if (!field) {
        add('error', 'REQUIRED_FIELD', `${seg.name}-${no} (${name}) is required but missing.`, segLoc(seg, `${seg.name}-${no}`));
      } else if (field.raw.trim() === '') {
        add('error', 'REQUIRED_FIELD', `${seg.name}-${no} (${name}) is required but empty.`, fieldLoc(seg, field));
      }
    }

    // Leading and trailing spaces
    checkSpaces(seg, add);

    // Date/time fields
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

    // Set ID (sequence number)
    if (SET_ID_SEGMENTS.includes(seg.name) && seg.fields[1] && seg.fields[1].raw.trim() !== '') {
      const reason = checkSi(seg.fields[1].raw.trimEnd());
      if (reason) {
        add('error', 'DATA_TYPE', `${seg.name}-1 value "${seg.fields[1].raw}" ${reason}.`, fieldLoc(seg, seg.fields[1]));
      }
    }

    // OBX: the value type (OBX-2) decides how OBX-5 is read
    if (seg.name === 'OBX') {
      const valueType = seg.fields[2] ? seg.fields[2].raw.trim() : '';
      const value = seg.fields[5];
      if (value && value.raw !== '') {
        if (valueType === '') {
          add('error', 'OBX_VALUE_TYPE', 'OBX-5 has a value but OBX-2 (Value Type) is empty.', seg.fields[2] ? fieldLoc(seg, seg.fields[2]) : segLoc(seg, 'OBX-2'));
        } else if (valueType === 'NM') {
          for (const rep of value.reps) {
            const reason = rep.raw.trim() === '' ? null : checkNm(rep.raw.trimEnd());
            if (reason) {
              add('error', 'DATA_TYPE', `OBX-5 value "${rep.raw}" ${reason} (OBX-2 says NM).`, fieldLoc(seg, value, rep.start, Math.max(rep.end, rep.start + 1)));
            }
          }
        }
      }
    }
  }

  /* ---- message type and the segments it needs ---- */
  if (msh) {
    const code = get(msg, 'MSH-9.1').trim();
    const event = get(msg, 'MSH-9.2').trim();
    if (code && !event && code !== 'ACK') {
      add('error', 'MSH9_EVENT', `MSH-9.2 (trigger event) is missing for message type ${code}.`, fieldLoc(msh, msh.fields[9]));
    }
    const type = code ? (event ? `${code}^${event}` : code) : '';
    const rules = MESSAGE_RULES[type] || MESSAGE_RULES[code];
    if (rules) {
      for (const [name, [min, max]] of Object.entries(rules.counts)) {
        const found = msg.segments.filter((s) => s.name === name);
        if (found.length < min) {
          add('error', 'MISSING_SEGMENT', `Segment ${name} is required in ${type} (at least ${min} expected, ${found.length} found).`, segLoc(msh));
        } else if (found.length > max) {
          add('error', 'TOO_MANY_SEGMENTS', `Segment ${name} appears ${found.length} times in ${type}, but at most ${max} ${max === 1 ? 'is' : 'are'} allowed.`, segLoc(found[max]));
        }
      }
      for (const name of rules.recommended || []) {
        if (!msg.segments.some((s) => s.name === name)) {
          add('warning', 'RECOMMENDED_SEGMENT', `Segment ${name} is normally present in ${type} but is missing.`, segLoc(msh));
        }
      }
    }
    return finish(msg, issues, type);
  }

  return finish(msg, issues);
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
        const path = `${seg.name}-${seq}${rep.comps.length > 1 ? `.${i + 1}` : ''}`;
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
