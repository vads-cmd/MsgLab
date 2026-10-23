'use strict';

const { parseMessage, get, unescape } = require('./parser');
const dict = require('./dictionary');
const tables = require('./tables');

/** "20261023013005" -> "2026-10-23 01:30:05"; keeps whatever precision is present. */
function prettyDtm(value) {
  const m = /^(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\.\d+)?([+-]\d{4})?$/.exec(value || '');
  if (!m) return value || '';
  const [, y, mo, d, h, mi, s, frac, tz] = m;
  let out = y;
  if (mo) out += `-${mo}`;
  if (d) out += `-${d}`;
  if (h) out += ` ${h}:${mi || '00'}`;
  if (h && s) out += `:${s}${frac || ''}`;
  if (tz) out += ` (UTC${tz.slice(0, 3)}:${tz.slice(3)})`;
  return out;
}

const nonEmpty = (list) => list.filter((x) => x !== undefined && x !== null && String(x).trim() !== '');

/** One readable line for a single repetition; `c` holds its component values (position 1 = c[0]). */
function summarizeRep(dt, c) {
  const at = (n) => c[n - 1] || '';
  switch (dt) {
    case 'TS': case 'DTM': case 'DT':
      return prettyDtm(at(1));
    case 'XPN': {
      const given = nonEmpty([at(5), at(2), at(3)]).join(' ');
      const name = nonEmpty([at(1) && given ? `${at(1)},` : at(1), given]).join(' ');
      return nonEmpty([name, at(4)]).join(' ');
    }
    case 'XCN': {
      const name = nonEmpty([at(6), at(3), at(4), at(2), at(5)]).join(' ');
      return nonEmpty([name, at(1) ? `[${at(1)}]` : '']).join(' ');
    }
    case 'XAD':
      return nonEmpty([at(1), at(2), at(3), nonEmpty([at(4), at(5)]).join(' '), at(6)]).join(', ');
    case 'CX':
      return nonEmpty([at(1), at(5) ? `(${at(5)})` : '', at(4) ? `@ ${at(4)}` : '']).join(' ');
    case 'XTN':
      return nonEmpty([at(4) || at(1) || nonEmpty([at(5), at(6), at(7)]).join(' '), at(2) ? `(${at(2)})` : '']).join(' ');
    case 'CE': case 'CWE': case 'CNE':
      if (at(2)) return `${at(2)}${at(1) ? ` [${at(1)}${at(3) ? ` ${at(3)}` : ''}]` : ''}`;
      return nonEmpty([at(1), at(3)]).join(' ');
    case 'PL':
      return nonEmpty([at(1), at(2), at(3), at(4)]).join(' / ');
    case 'EI':
      return nonEmpty([at(1), at(2) ? `@ ${at(2)}` : '']).join(' ');
    case 'HD':
      return nonEmpty([at(1), at(2)]).join(' ');
    default:
      return nonEmpty(c).join(' ^ ');
  }
}

function explainSegment(msg, seg) {
  const def = dict.getSegment(seg.name);
  const out = {
    index: seg.index,
    name: seg.name,
    description: def ? def.name : 'Unknown segment',
    known: !!def,
    start: seg.start,
    end: seg.end,
    fields: [],
  };

  for (let seq = 1; seq < seg.fields.length; seq++) {
    const field = seg.fields[seq];
    if (!field || field.raw.trim() === '') continue;
    const fdef = def && def.byNo[seq];

    // OBX-5 takes its data type from OBX-2
    let dt = fdef ? fdef.dt : '';
    if (seg.name === 'OBX' && seq === 5) dt = seg.fields[2] ? seg.fields[2].raw.trim() : '';
    const names = dict.componentNames(dt);

    const reps = field.reps.filter((r) => r.raw.trim() !== '').map((rep) => {
      const all = rep.comps.map((comp, i) => {
        const n = i + 1;
        const value = unescape(comp.raw, msg.delims).trimEnd();
        const table = fdef && fdef.tables[n] ? fdef.tables[n] : null;
        return {
          n,
          name: names && names[i] ? names[i] : (rep.comps.length > 1 ? `Component ${n}` : ''),
          value,
          decoded: table && value !== '' ? tables.lookup(table, value) : null,
          table,
          start: comp.start,
          end: comp.end,
        };
      });
      let display = summarizeRep(dt, all.map((c) => c.value));
      // Show the meaning next to a coded value: "M (Male)"
      const coded = all.find((c) => c.decoded && c.n === 1);
      if (coded && !['TS', 'DTM', 'DT'].includes(dt)) {
        display = all.length === 1 ? `${coded.value} (${coded.decoded})` : `${display} (${coded.decoded})`;
      }
      return { start: rep.start, end: rep.end, display, components: all.filter((c) => c.value !== '') };
    });

    out.fields.push({
      seq,
      path: `${seg.name}-${seq}`,
      name: fdef ? fdef.name : `Field ${seq}`,
      known: !!fdef,
      dt,
      dtName: dict.DATA_TYPE_NAMES[dt] || '',
      start: field.start,
      end: field.end,
      display: reps.map((r) => r.display).join('  |  '),
      reps,
    });
  }
  return out;
}

const EVENT_PHRASES = {
  A01: 'was admitted',
  A02: 'was transferred',
  A03: 'was discharged',
  A04: 'was registered',
  A05: 'was pre-admitted',
  A08: 'had their information updated',
  A11: 'had the admission cancelled',
  A13: 'had the discharge cancelled',
};

/** Explain a message: the main facts, a short narrative and every field with its name and meaning. */
function explain(text) {
  const msg = parseMessage(text);
  if (msg.segments.length === 0) return { empty: true, messageType: '', facts: [], narrative: '', segments: [] };

  const v = (path) => get(msg, path, { unescaped: true }).trim();
  const comps = (seg, n) =>
    seg && seg.fields[n] && seg.fields[n].reps[0] ? seg.fields[n].reps[0].comps.map((c) => unescape(c.raw, msg.delims).trimEnd()) : [];
  const withMeaning = (value, table) => {
    if (!value) return '';
    const meaning = tables.lookup(table, value);
    return meaning ? `${value} (${meaning})` : value;
  };
  const joinAt = (a, b) => nonEmpty([v(a), v(b)]).join(' @ ');

  const code = v('MSH-9.1');
  const event = v('MSH-9.2');
  const type = code ? (event ? `${code}^${event}` : code) : '';
  const typeName = dict.messageName(code, event);

  const facts = [];
  const fact = (label, value) => {
    if (value) facts.push({ label, value });
  };

  fact('Message type', type ? `${type}${typeName ? ` - ${typeName}` : ''}` : '');
  fact('Structure', v('MSH-9.3'));
  fact('HL7 version', v('MSH-12.1'));
  fact('Control ID', v('MSH-10'));
  fact('Sent', prettyDtm(v('MSH-7.1')));
  fact('From', joinAt('MSH-3.1', 'MSH-4.1'));
  fact('To', joinAt('MSH-5.1', 'MSH-6.1'));
  fact('Processing', withMeaning(v('MSH-11.1'), '0103'));

  const pid = msg.segments.find((s) => s.name === 'PID');
  let patientName = '';
  let patientId = '';
  if (pid) {
    patientName = summarizeRep('XPN', comps(pid, 5));
    patientId = summarizeRep('CX', comps(pid, 3));
    fact('Patient', patientName);
    fact('Patient ID', patientId);
    fact('Born', prettyDtm(v('PID-7.1')));
    fact('Sex', withMeaning(v('PID-8'), '0001'));
    fact('Address', summarizeRep('XAD', comps(pid, 11)));
  }

  const pv1 = msg.segments.find((s) => s.name === 'PV1');
  let patientClass = '';
  if (pv1) {
    patientClass = withMeaning(v('PV1-2'), '0004');
    fact('Patient class', patientClass);
    fact('Location', summarizeRep('PL', comps(pv1, 3)));
    if (code === 'ADT' && event === 'A02') fact('Moved from', summarizeRep('PL', comps(pv1, 6)));
    fact('Attending doctor', summarizeRep('XCN', comps(pv1, 7)));
    fact('Visit number', summarizeRep('CX', comps(pv1, 19)));
    fact('Admitted', prettyDtm(v('PV1-44.1')));
    fact('Discharged', prettyDtm(v('PV1-45.1')));
  }

  const obrs = msg.segments.filter((s) => s.name === 'OBR');
  const obxs = msg.segments.filter((s) => s.name === 'OBX');
  const service = (obr) => summarizeRep('CE', comps(obr, 4));
  obrs.forEach((obr, i) => fact(obrs.length > 1 ? `Order ${i + 1}` : 'Order', service(obr)));
  if (obxs.length) {
    const abnormal = obxs.filter((o) => {
      const flag = o.fields[8] ? o.fields[8].raw.trim() : '';
      return flag !== '' && flag !== 'N';
    }).length;
    fact('Results', `${obxs.length} observation${obxs.length === 1 ? '' : 's'}${abnormal ? `, ${abnormal} flagged abnormal` : ''}`);
  }

  // A short description in plain words
  const sentences = [];
  const from = joinAt('MSH-3.1', 'MSH-4.1');
  const to = joinAt('MSH-5.1', 'MSH-6.1');
  const sent = prettyDtm(v('MSH-7.1'));
  sentences.push(`${type || 'This message'}${typeName ? ` (${typeName})` : ''}${from ? ` from ${from}` : ''}${to ? ` to ${to}` : ''}${sent ? `, sent ${sent}` : ''}.`);

  const who = patientName ? `${patientName}${patientId ? ` (${patientId})` : ''}` : 'the patient';
  if (code === 'ADT' && EVENT_PHRASES[event]) {
    sentences.push(`Reports that ${who} ${EVENT_PHRASES[event]}${patientClass ? ` (patient class: ${tables.lookup('0004', v('PV1-2')) || v('PV1-2')})` : ''}.`);
  } else if (code === 'ORU') {
    sentences.push(`Delivers ${obxs.length} observation result${obxs.length === 1 ? '' : 's'} for ${who}${obrs.length ? `, ordered as ${obrs.map(service).join('; ')}` : ''}.`);
  } else if (code === 'ORM') {
    const control = withMeaning(v('ORC-1'), '0119');
    sentences.push(`Carries an order${control ? ` (${control})` : ''} for ${who}${obrs.length ? `: ${obrs.map(service).join('; ')}` : ''}.`);
  } else if (code === 'ACK') {
    const ack = withMeaning(v('MSA-1'), '0008');
    sentences.push(`Acknowledges message ${v('MSA-2') || '(unknown)'} with ${ack || 'no code'}${v('MSA-3') ? `: ${v('MSA-3')}` : ''}.`);
  } else if (patientName) {
    sentences.push(`Concerns ${who}.`);
  }

  return {
    empty: false,
    messageType: type,
    facts,
    narrative: sentences.join(' '),
    segments: msg.segments.map((s) => explainSegment(msg, s)),
  };
}

module.exports = { explain, prettyDtm, summarizeRep };
