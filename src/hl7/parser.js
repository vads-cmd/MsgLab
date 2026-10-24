'use strict';

/**
 * Minimal HL7 v2 parser.
 *
 * Every segment, field, repetition, and component keeps its absolute character
 * offsets in the parsed text, so the UI can later point at the exact spot.
 *
 *   message { text, delims, encoding, segments[] }
 *   segment { name, index, start, end, raw, fields[] } fields[n] = field n (fields[0] unused)
 *   field { seq, raw, start, end, reps[] }
 *   rep { raw, start, end, comps[] }
 *   comp { raw, start, end, subs[] }
 */

const DEFAULT_DELIMS = Object.freeze({ field: '|', comp: '^', rep: '~', esc: '\\', sub: '&' });

/** Split text into non-empty lines (CR, LF, or CRLF), remembering where each one starts. */
function splitLines(text) {
  const lines = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && text[j] !== '\r' && text[j] !== '\n') j++;
    let lineText = text.slice(i, j);
    let start = i;
    // MLLP framing characters are not part of the message.
    if (lineText.codePointAt(0) === 0x0b) {
      lineText = lineText.slice(1);
      start += 1;
    }
    if (lineText.endsWith('\x1c')) lineText = lineText.slice(0, -1);
    if (lineText.trim() !== '') lines.push({ text: lineText, start });
    if (j >= n) break;
    i = text[j] === '\r' && text[j + 1] === '\n' ? j + 2 : j + 1;
  }
  return lines;
}

/** Split `str` on `sep`; pieces carry absolute offsets (`base` = offset of str[0]). */
function splitAt(str, sep, base) {
  if (!sep) return [{ text: str, start: base }];
  const out = [];
  let from = 0;
  for (;;) {
    const i = str.indexOf(sep, from);
    if (i === -1) {
      out.push({ text: str.slice(from), start: base + from });
      break;
    }
    out.push({ text: str.slice(from, i), start: base + from });
    from = i + 1;
  }
  return out;
}

function parseField(seq, raw, start, d, literal = false) {
  const field = { seq, raw, start, end: start + raw.length, reps: [] };
  if (literal) {
    field.reps.push({
      raw, start, end: field.end,
      comps: [{ raw, start, end: field.end, subs: [raw] }],
    });
    return field;
  }
  for (const r of splitAt(raw, d.rep, start)) {
    const rep = { raw: r.text, start: r.start, end: r.start + r.text.length, comps: [] };
    for (const c of splitAt(r.text, d.comp, r.start)) {
      rep.comps.push({
        raw: c.text,
        start: c.start,
        end: c.start + c.text.length,
        subs: d.sub ? c.text.split(d.sub) : [c.text],
      });
    }
    field.reps.push(rep);
  }
  return field;
}

function parseSegment(line, d, index) {
  const parts = splitAt(line.text, d.field, line.start);
  const name = parts[0].text;
  const seg = {
    name,
    index,
    start: line.start,
    end: line.start + line.text.length,
    raw: line.text,
    fields: [],
  };
  if (name === 'MSH') {
    // MSH-1 is the field separator itself and MSH-2 the encoding characters; neither is split further.
    seg.fields[1] = parseField(1, d.field, line.start + 3, d, true);
    for (let i = 1; i < parts.length; i++) {
      seg.fields[i + 1] = parseField(i + 1, parts[i].text, parts[i].start, d, i === 1);
    }
    if (!seg.fields[2]) seg.fields[2] = parseField(2, '', line.start + 4, d, true);
  } else {
    for (let i = 1; i < parts.length; i++) {
      seg.fields[i] = parseField(i, parts[i].text, parts[i].start, d);
    }
  }
  return seg;
}

/** The separators from the MSH line: MSH-1 is the field separator, MSH-2 holds the four encoding characters. */
function readDelimiters(firstLine) {
  const field = firstLine[3];
  const rest = firstLine.slice(4);
  const end = rest.indexOf(field);
  const encoding = end === -1 ? rest : rest.slice(0, end);
  const delims = {
    field,
    comp: encoding[0] ?? DEFAULT_DELIMS.comp,
    rep: encoding[1] ?? DEFAULT_DELIMS.rep,
    esc: encoding[2] ?? DEFAULT_DELIMS.esc,
    sub: encoding[3] ?? DEFAULT_DELIMS.sub,
  };
  return { delims, encoding };
}

function parseMessage(text) {
  text = String(text == null ? '' : text);
  const lines = splitLines(text);
  const hasMsh = lines.length > 0 && lines[0].text.startsWith('MSH') && lines[0].text.length >= 4;
  const { delims, encoding } = hasMsh ? readDelimiters(lines[0].text) : { delims: { ...DEFAULT_DELIMS }, encoding: null };
  const msg = { text, delims, encoding, segments: [] };
  lines.forEach((ln, i) => msg.segments.push(parseSegment(ln, msg.delims, i)));
  return msg;
}

/**
 * Split text that holds several messages (one file, or MLLP frames one after another) into
 * separate messages. A new message starts at every MSH segment; the file and batch envelope
 * segments (FHS, BHS, BTS, FTS) are left out. Lines end up joined with "\n".
 */
function splitMessages(text) {
  const messages = [];
  let current = null;
  for (const { text: line } of splitLines(String(text ?? ''))) {
    if (/^(FHS|BHS|BTS|FTS)[^A-Za-z0-9]/.test(line)) continue;
    if (current === null || line.startsWith('MSH')) {
      current = [];
      messages.push(current);
    }
    current.push(line);
  }
  return messages.map((lines) => lines.join('\n'));
}

const PATH_RE = /^([A-Za-z0-9]{3})(?:\[(\d+)])?-(\d+)(?:\((\d+)\))?(?:\.(\d+))?(?:\.(\d+))?$/;

/**
 * Read a value by the path: "PID-5.1", "OBX[2]-5" (second OBX), "PID-3(2).1" (second repetition).
 * Occurrences and repetitions are 1-based. Returns '' when the value does not exist.
 */
function get(msg, path, { unescaped = false } = {}) {
  const m = PATH_RE.exec(path);
  if (!m) throw new Error(`Bad HL7 path: ${path}`);
  const [, segName, occ, fieldNo, repNo, compNo, subNo] = m;
  const seg = msg.segments.filter((s) => s.name === segName)[Number(occ || 1) - 1];
  if (!seg) return '';
  const field = seg.fields[Number(fieldNo)];
  if (!field) return '';
  const rep = field.reps[Number(repNo || 1) - 1];
  if (!rep) return '';
  let value;
  if (!compNo) {
    value = rep.raw;
  } else {
    const comp = rep.comps[Number(compNo) - 1];
    if (!comp) return '';
    value = subNo ? comp.subs[Number(subNo) - 1] || '' : comp.raw;
  }
  return unescaped ? unescape(value, msg.delims) : value;
}

/** Replace HL7 escape sequences (\F\ \S\ \R\ \T\ \E\ \.br\ \Xhh..\) with the literal characters. */
function unescape(str, d = DEFAULT_DELIMS) {
  const e = d.esc;
  if (!e || !str.includes(e)) return str;
  let out = '';
  let i = 0;
  while (i < str.length) {
    if (str[i] !== e) {
      out += str[i++];
      continue;
    }
    const j = str.indexOf(e, i + 1);
    if (j === -1) {
      out += str.slice(i);
      break;
    }
    const code = str.slice(i + 1, j);
    let rep = null;
    switch (code) {
      case 'F': rep = d.field; break;
      case 'S': rep = d.comp; break;
      case 'T': rep = d.sub; break;
      case 'R': rep = d.rep; break;
      case 'E': rep = d.esc; break;
      case 'H': case 'N': rep = ''; break;
      case '.br': rep = '\n'; break;
      default:
        if (/^X([0-9A-Fa-f]{2})+$/.test(code)) {
          rep = code.slice(1).match(/../g).map((h) => String.fromCodePoint(Number.parseInt(h, 16))).join('');
        }
    }
    out += rep === null ? str.slice(i, j + 1) : rep;
    i = j + 1;
  }
  return out;
}

module.exports = { DEFAULT_DELIMS, splitLines, splitAt, splitMessages, parseMessage, get, unescape };
