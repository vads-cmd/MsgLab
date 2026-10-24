'use strict';

const input = document.getElementById('message');
const tabs = Array.from(document.querySelectorAll('.tab'));
const panels = {
  validation: document.getElementById('panel-validation'),
  explain: document.getElementById('panel-explain'),
};
const PLACEHOLDERS = {
  validation: 'Validation results will appear here.',
  explain: 'The explanation will appear here.',
};

let timer = null;
let latestRequest = 0;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/* ---- tabs ---- */

function selectTab(name) {
  for (const tab of tabs) {
    const active = tab.dataset.tab === name;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    panels[tab.dataset.tab].hidden = !active;
  }
}

function setValidationLabel(problems) {
  document.getElementById('tab-validation').textContent = problems ? `Validation (${problems})` : 'Validation';
}

function showPlaceholders() {
  for (const name of Object.keys(panels)) {
    panels[name].replaceChildren(el('p', 'placeholder', PLACEHOLDERS[name]));
  }
  setValidationLabel(0);
}

/* ---- validation tab ---- */

function renderValidation(result) {
  const children = [];

  const summary = el('div', 'summary');
  summary.append(el('span', `badge ${result.valid ? 'ok' : 'bad'}`, result.valid ? 'Valid' : 'Not valid'));
  const parts = [plural(result.counts.error, 'error'), plural(result.counts.warning, 'warning')];
  if (result.counts.info) parts.push(plural(result.counts.info, 'note'));
  if (result.messageType) parts.unshift(result.messageType);
  summary.append(el('span', 'summary-text', parts.join(' · ')));
  children.push(summary);

  if (result.issues.length === 0) {
    children.push(el('p', 'placeholder', 'No problems found.'));
  } else {
    const list = el('ul', 'issues');
    for (const issue of result.issues) {
      const item = el('li', `issue ${issue.severity}`);
      item.append(el('span', 'severity', issue.severity));
      const body = el('div', 'issue-body');
      body.append(el('div', 'issue-message', issue.message));
      body.append(el('div', 'issue-where', [issue.path, `line ${issue.line}`].filter(Boolean).join(' · ')));
      item.append(body);
      list.append(item);
    }
    children.push(list);
  }

  panels.validation.replaceChildren(...children);
  setValidationLabel(result.counts.error + result.counts.warning);
}

/* ---- explain tab ---- */

function renderChips(field) {
  const comps = el('div', 'f-comps');
  for (const rep of field.reps) {
    for (const c of rep.components) {
      const chip = el('span', 'chip');
      chip.append(el('span', 'chip-name', c.name || `#${c.n}`));
      chip.append(document.createTextNode(c.decoded ? ` ${c.value} (${c.decoded})` : ` ${c.value}`));
      comps.append(chip);
    }
  }
  return comps;
}

function renderFieldRow(field) {
  const row = el('tr');
  row.append(el('td', 'f-path', field.path), el('td', 'f-name', field.name));

  const value = el('td', 'f-value');
  value.append(el('div', 'f-display', field.display));
  if (field.reps.some((rep) => rep.components.length > 1)) value.append(renderChips(field));
  row.append(value, el('td', 'f-type', field.dt));
  return row;
}

function renderSegment(seg) {
  const details = el('details', 'segment');
  details.open = true;
  const summary = el('summary');
  summary.append(el('span', 'seg-name', seg.name), el('span', 'seg-desc', seg.description));
  details.append(summary);

  if (seg.fields.length === 0) {
    details.append(el('p', 'placeholder', seg.known ? 'No values in this segment.' : 'This segment is not in the built-in dictionary.'));
    return details;
  }

  const table = el('table', 'fields');
  for (const field of seg.fields) table.append(renderFieldRow(field));
  details.append(table);
  return details;
}

function renderExplain(result) {
  if (result.empty) {
    panels.explain.replaceChildren(el('p', 'placeholder', PLACEHOLDERS.explain));
    return;
  }
  const children = [];
  if (result.narrative) children.push(el('p', 'narrative', result.narrative));
  if (result.facts.length) {
    const list = el('dl', 'facts');
    for (const fact of result.facts) list.append(el('dt', '', fact.label), el('dd', '', fact.value));
    children.push(list);
  }
  for (const seg of result.segments) children.push(renderSegment(seg));
  panels.explain.replaceChildren(...children);
}

/* ---- wiring ---- */

async function run() {
  const text = input.value;
  if (text.trim() === '') {
    latestRequest++;
    showPlaceholders();
    return;
  }
  const request = ++latestRequest;
  try {
    const [validation, explanation] = await Promise.all([window.hl7.validate(text), window.hl7.explain(text)]);
    if (request !== latestRequest) return; // ignore answers that arrive late
    renderValidation(validation);
    renderExplain(explanation);
  } catch (err) {
    if (request !== latestRequest) return;
    for (const name of Object.keys(panels)) {
      panels[name].replaceChildren(el('p', 'placeholder', `Something went wrong: ${err.message}`));
    }
  }
}

tabs.forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));
input.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(run, 250);
  markChanged();
});

showPlaceholders();
selectTab('validation');

/* ---- generator ---- */

const generatorForm = document.getElementById('generator');
const genStatus = document.getElementById('gen-status');
const restoreButton = document.getElementById('gen-restore');
let replacedText = null; // the message an ACK replaced, so it can be brought back
const fieldValue = (id) => document.getElementById(id).value;

async function generateMessage() {
  genStatus.classList.remove('error');
  genStatus.textContent = '';
  const type = fieldValue('gen-type');
  const previous = input.value;
  try {
    const result = await window.hl7.generate({
      type,
      source: type === 'ACK' ? previous : '',
      version: fieldValue('gen-version'),
      sendingApp: fieldValue('gen-send-app'),
      sendingFacility: fieldValue('gen-send-fac'),
      receivingApp: fieldValue('gen-recv-app'),
      receivingFacility: fieldValue('gen-recv-fac'),
      processingId: fieldValue('gen-processing'),
      seed: fieldValue('gen-seed'),
      fields: collectManual(),
    });
    if (!result.ok) throw new Error(result.error);
    replacedText = type === 'ACK' ? previous : null;
    restoreButton.hidden = replacedText === null;
    detachFile();
    input.value = result.text;
    input.scrollTop = 0;
    const manualNote = result.manual.length ? ` · ${plural(result.manual.length, 'manual value')}` : '';
    genStatus.textContent = `Generated ${result.type} (v${result.version}) · seed ${result.seed}${manualNote}`;
    clearTimeout(timer);
    run().catch(console.error);
  } catch (err) {
    genStatus.classList.add('error');
    genStatus.textContent = err.message;
  }
}

restoreButton.addEventListener('click', () => {
  if (replacedText === null) return;
  input.value = replacedText;
  replacedText = null;
  restoreButton.hidden = true;
  detachFile();
  genStatus.textContent = 'Original message restored';
  clearTimeout(timer);
  run().catch(console.error);
});

generatorForm.addEventListener('submit', (event) => {
  event.preventDefault();
  generateMessage().catch(console.error);
});

/* ---- saving ---- */

const fileStatus = document.getElementById('file-status');
let savedName = ''; // the file the editor is tied to; empty until the first save
let changedSinceSave = false;

function updateTitle() {
  const name = savedName ? `${savedName} - ` : '';
  document.title = `${changedSinceSave && savedName ? '* ' : ''}${name}HL7 Workbench`;
}

// The main process asks before a window with unsaved changes is closed or its text replaced
let lastDirtySent = false;
function syncDirty() {
  const dirty = changedSinceSave && input.value.trim() !== '';
  if (dirty === lastDirtySent) return;
  lastDirtySent = dirty;
  window.hl7.setDirty(dirty).catch(console.error);
}

function markChanged() {
  changedSinceSave = true;
  updateTitle();
  syncDirty();
}

/** The editor now holds something new (generated, answered, picked from a list): Save must ask for a file again. */
function detachFile() {
  savedName = '';
  changedSinceSave = false;
  updateTitle();
  syncDirty();
  window.hl7.forgetFile().catch(console.error);
}

async function saveMessage(mode) {
  fileStatus.classList.remove('error');
  fileStatus.textContent = '';
  try {
    const result = await window.hl7.saveMessage({
      text: input.value,
      mode: savedName ? mode : 'saveAs',
      lineEnding: fieldValue('file-eol'),
      encoding: fieldValue('file-encoding'),
      mllp: document.getElementById('file-mllp').checked,
    });
    if (result.canceled) return;
    if (!result.ok) throw new Error(result.error);
    savedName = result.fileName;
    changedSinceSave = false;
    updateTitle();
    syncDirty();
    const warning = result.warning ? ` - ${result.warning}` : '';
    fileStatus.textContent = `Saved ${result.fileName} (${result.bytes} bytes)${warning}`;
  } catch (err) {
    fileStatus.classList.add('error');
    fileStatus.textContent = err.message;
  }
}

document.getElementById('file-save').addEventListener('click', () => saveMessage('save').catch(console.error));
document.getElementById('file-save-as').addEventListener('click', () => saveMessage('saveAs').catch(console.error));

/* ---- opening ---- */

function applyOpened(result) {
  const { messages, format, notes } = result;
  if (format.lineEnding) document.getElementById('file-eol').value = format.lineEnding;
  document.getElementById('file-encoding').value = format.encoding;
  document.getElementById('file-mllp').checked = format.mllp;
  replacedText = null;
  restoreButton.hidden = true;
  input.value = messages[0].text;
  input.scrollTop = 0;
  const many = messages.length > 1;
  if (many) {
    showBulkResult({ summary: `${result.fileName}: ${plural(messages.length, 'message')}${result.batch ? ' (batch file)' : ''}`, messages });
    document.getElementById('bulk').open = true;
  }
  if (result.tied) {
    savedName = result.fileName;
    changedSinceSave = false;
    updateTitle();
    syncDirty();
  } else {
    detachFile();
  }
  const listed = many ? ` - ${plural(messages.length, 'message')}, listed under Bulk generation; the first one is shown` : '';
  fileStatus.textContent = ['Opened ', result.fileName, listed, ...notes.map((note) => ` - ${note}`)].join('');
  clearTimeout(timer);
  run().catch(console.error);
}

async function runOpen(request) {
  fileStatus.classList.remove('error');
  fileStatus.textContent = '';
  try {
    const result = await request();
    if (result.canceled) return false;
    if (!result.ok) throw new Error(result.error);
    applyOpened(result);
    return true;
  } catch (err) {
    fileStatus.classList.add('error');
    fileStatus.textContent = err.message;
    return false;
  }
}

const openFromDialog = () => runOpen(() => window.hl7.openFile());
document.getElementById('file-open').addEventListener('click', () => openFromDialog().catch(console.error));

const dropPane = input.closest('.pane');
const hasFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files');
document.addEventListener('dragover', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dropPane.classList.add('drop-target');
});
document.addEventListener('dragleave', (event) => {
  if (event.relatedTarget === null) dropPane.classList.remove('drop-target');
});
document.addEventListener('drop', (event) => {
  if (!hasFiles(event)) return;
  event.preventDefault();
  dropPane.classList.remove('drop-target');
  const dropped = Array.from(event.dataTransfer.files);
  if (dropped.length === 0) return;
  runOpen(async () => window.hl7.openFileData({ name: dropped[0].name, data: await dropped[0].arrayBuffer() }))
    .then((opened) => {
      if (opened && dropped.length > 1) fileStatus.textContent += ' - only the first of the dropped files was opened';
    })
    .catch(console.error);
});

document.addEventListener('keydown', (event) => {
  if (!(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key === 's') {
    event.preventDefault();
    saveMessage(event.shiftKey ? 'saveAs' : 'save').catch(console.error);
  } else if (key === 'o') {
    event.preventDefault();
    openFromDialog().catch(console.error);
  }
});

/* ---- bulk generation ---- */

const bulkForm = document.getElementById('bulk-form');
const bulkStatus = document.getElementById('bulk-status');
const bulkResult = document.getElementById('bulk-result');
const SHOWN_ROWS = 200; // the table lists the first rows only; "Copy all" always copies everything
let bulkMessages = [];

function buildBulkTypes() {
  const box = document.getElementById('bulk-types');
  for (const option of document.getElementById('gen-type').options) {
    if (option.value === 'ACK') continue; // an ACK answers one given message
    const label = el('label');
    const check = el('input');
    check.type = 'checkbox';
    check.value = option.value;
    check.checked = option.value === 'ADT^A01';
    label.append(check, document.createTextNode(` ${option.value}`));
    box.append(label);
  }
}

function showBulkResult(result) {
  bulkMessages = result.messages;
  const counts = `${plural(result.count, 'message')} for ${plural(result.patients, 'patient')} · seed ${result.seed}`;
  document.getElementById('bulk-summary').textContent = result.summary ?? counts;
  document.getElementById('bulk-copy-status').textContent = '';
  const rows = [];
  bulkMessages.slice(0, SHOWN_ROWS).forEach((message, index) => {
    const row = el('tr');
    const open = el('button', '', 'Show');
    open.type = 'button';
    open.addEventListener('click', () => {
      input.value = message.text;
      input.scrollTop = 0;
      replacedText = null;
      restoreButton.hidden = true;
      detachFile();
      clearTimeout(timer);
      run().catch(console.error);
    });
    const action = el('td');
    action.append(open);
    row.append(el('td', '', String(index + 1)), el('td', '', message.type), el('td', '', message.patient), el('td', '', message.time), el('td', '', message.controlId), action);
    rows.push(row);
  });
  if (bulkMessages.length > SHOWN_ROWS) {
    const more = el('tr');
    more.append(el('td', '', `... and ${bulkMessages.length - SHOWN_ROWS} more (all are included when you copy)`));
    more.firstChild.colSpan = 6;
    rows.push(more);
  }
  document.getElementById('bulk-rows').replaceChildren(...rows);
  bulkResult.hidden = false;
}

async function generateBulkMessages() {
  bulkStatus.classList.remove('error');
  bulkStatus.textContent = 'Generating...';
  const button = document.getElementById('bulk-generate');
  button.disabled = true;
  try {
    const types = Array.from(document.querySelectorAll('#bulk-types input:checked'), (box) => box.value);
    const result = await window.hl7.generateBulk({
      count: fieldValue('bulk-count'),
      minutesBetween: fieldValue('bulk-minutes'),
      mode: fieldValue('bulk-mode'),
      types,
      version: fieldValue('gen-version'),
      sendingApp: fieldValue('gen-send-app'),
      sendingFacility: fieldValue('gen-send-fac'),
      receivingApp: fieldValue('gen-recv-app'),
      receivingFacility: fieldValue('gen-recv-fac'),
      processingId: fieldValue('gen-processing'),
      seed: fieldValue('gen-seed'),
    });
    if (!result.ok) throw new Error(result.error);
    showBulkResult(result);
    bulkStatus.textContent = 'Done';
  } catch (err) {
    bulkStatus.classList.add('error');
    bulkStatus.textContent = err.message;
  } finally {
    button.disabled = false;
  }
}

bulkForm.addEventListener('submit', (event) => {
  event.preventDefault();
  generateBulkMessages().catch(console.error);
});

document.getElementById('bulk-copy').addEventListener('click', async () => {
  const status = document.getElementById('bulk-copy-status');
  try {
    await navigator.clipboard.writeText(bulkMessages.map((message) => message.text).join('\n'));
    status.textContent = `Copied ${plural(bulkMessages.length, 'message')}`;
  } catch (err) {
    status.textContent = `Could not copy: ${err.message}`;
  }
});

buildBulkTypes();

/* ---- manual values ---- */

// [key, label, events it applies to (all when left out)]
const MERGE_TYPES = ['ADT^A18', 'ADT^A40'];
const ORDER_TYPES = ['ORM^O01', 'ORU^R01'];
const RESULT_TYPES = ['ORU^R01'];
const ACK_TYPES = ['ACK'];

const MANUAL_GROUPS = [
  ['Patient', [
    ['familyName', 'Last name'], ['givenName', 'First name'], ['middleInitial', 'Middle initial'], ['birthDate', 'Birth date (YYYYMMDD)'],
    ['sex', 'Sex'], ['maritalStatus', 'Marital status (code)'], ['street', 'Street'], ['city', 'City'], ['state', 'State'], ['zip', 'Zip code'], ['phone', 'Phone'],
  ]],
  ['Identifiers', [
    ['mrn', 'Patient ID (MRN)'], ['accountNumber', 'Account number'], ['visitNumber', 'Visit number'],
  ]],
  ['Visit and location', [
    ['patientClass', 'Patient class'], ['unit', 'Unit'], ['room', 'Room'], ['bed', 'Bed'],
    ['doctorId', 'Doctor ID'], ['doctorFamily', 'Doctor last name'], ['doctorGiven', 'Doctor first name'],
    ['admitTime', 'Admit time (YYYYMMDDHHMMSS)'], ['admissionType', 'Admission type'], ['hospitalService', 'Hospital service'],
  ]],
  ['This message type only', [
    ['priorUnit', 'Previous unit (A02)', ['ADT^A02']], ['priorRoom', 'Previous room (A02)', ['ADT^A02']], ['priorBed', 'Previous bed (A02)', ['ADT^A02']],
    ['dischargeTime', 'Discharge time (A03)', ['ADT^A03']], ['dischargeDisposition', 'Discharge disposition (A03)', ['ADT^A03']],
    ['priorPatientId', 'Merged-away patient ID (MRG-1)', MERGE_TYPES], ['priorFamilyName', 'Merged-away last name (MRG-7)', MERGE_TYPES],
    ['priorGivenName', 'Merged-away first name (MRG-7)', MERGE_TYPES],
    ['allergen', 'Allergen (code or text)', ['ADT^A60']], ['allergyType', 'Allergen type (code)', ['ADT^A60']],
    ['allergySeverity', 'Allergy severity (code)', ['ADT^A60']],
    ['orderControl', 'Order control (ORC-1, e.g. NW)', ORDER_TYPES], ['placerOrderNumber', 'Placer order number', ORDER_TYPES],
    ['fillerOrderNumber', 'Filler order number', ORDER_TYPES], ['serviceCode', 'Test code (OBR-4)', ORDER_TYPES],
    ['serviceName', 'Test name (OBR-4)', ORDER_TYPES], ['orderTime', 'Order time (YYYYMMDDHHMMSS)', ORDER_TYPES],
    ['orderReason', 'Reason for study (OBR-31)', ['ORM^O01']],
    ['resultStatus', 'Result status (OBR-25, OBX-11, e.g. F)', RESULT_TYPES], ['resultValue', 'Value of the first result (OBX-5)', RESULT_TYPES],
    ['ackCode', 'Acknowledgment code (MSA-1: AA, AE, AR, CA, CE, CR)', ACK_TYPES], ['errorCode', 'Error code (ERR, e.g. 207)', ACK_TYPES],
    ['errorText', 'Error text', ACK_TYPES], ['ackControlId', 'Control ID being answered (MSA-2)', ACK_TYPES],
  ]],
];

// The fields the validator reports as required: PID-3 (patient ID), PID-5 (name) and PV1-2 (patient class).
const MANDATORY = new Set(['mrn', 'familyName', 'givenName', 'patientClass', 'orderControl', 'serviceCode', 'resultStatus', 'ackCode']);

// applicable: the field exists in the selected message type. A field can also be hidden by the
// "Show non-mandatory fields" switch; it is then still used.
const manualCells = []; // { key, events, cell, text, empty, group, required, applicable }

function buildManual() {
  const container = document.getElementById('manual-fields');
  for (const [title, fields] of MANUAL_GROUPS) {
    const group = el('fieldset', 'manual-group');
    group.append(el('legend', '', title));
    const grid = el('div', 'manual-grid');
    for (const [key, label, events] of fields) {
      const cell = el('div', 'manual-cell');
      const text = el('input');
      text.type = 'text';
      text.id = `m-${key}`;
      text.placeholder = 'random';
      text.maxLength = 80;
      text.autocomplete = 'off';
      const caption = el('label', 'manual-label', label);
      caption.htmlFor = text.id;
      const empty = el('input');
      empty.type = 'checkbox';
      empty.id = `m-${key}-empty`;
      const emptyLabel = el('label', 'manual-empty');
      emptyLabel.htmlFor = empty.id;
      emptyLabel.append(empty, document.createTextNode(' empty'));
      const item = { key, events: events || null, cell, text, empty, group, required: MANDATORY.has(key), applicable: true };
      empty.addEventListener('change', () => {
        setEmpty(item, empty.checked);
        syncAllEmpty();
      });
      cell.append(caption, text, emptyLabel);
      grid.append(cell);
      manualCells.push(item);
    }
    group.append(grid);
    container.append(group);
  }
  updateManualVisibility();
}

function updateManualVisibility() {
  const type = fieldValue('gen-type');
  const showOptional = showOptionalSwitch.checked;
  for (const item of manualCells) {
    // An ACK answers the message in the editor, so the patient and visit fields do not apply to it
    item.applicable = item.events ? item.events.includes(type) : type !== 'ACK';
    item.cell.hidden = !item.applicable || (!showOptional && !item.required);
  }
  for (const group of new Set(manualCells.map((item) => item.group))) {
    group.hidden = manualCells.filter((item) => item.group === group).every((item) => item.cell.hidden);
  }
  syncAllEmpty();
}

/** { key: "text" } for typed values, { key: null } for fields to leave empty; random fields are left out. */
function collectManual() {
  const values = {};
  for (const item of manualCells) {
    if (!item.applicable) continue;
    if (item.empty.checked) values[item.key] = null;
    else if (item.text.value.trim() !== '') values[item.key] = item.text.value;
  }
  return values;
}

function clearManual() {
  for (const item of manualCells) {
    setEmpty(item, false);
    item.text.value = '';
  }
  syncAllEmpty();
}

/** Put one field in or out of the "left empty" state. */
function setEmpty(item, on) {
  item.empty.checked = on;
  item.text.disabled = on;
  if (on) item.text.value = '';
  item.text.placeholder = on ? 'left empty' : 'random';
}

// The switch is on when every visible field is empty, and half-way when only some are.
const allEmptySwitch = document.getElementById('gen-all-empty');
const showOptionalSwitch = document.getElementById('manual-show-optional');
const hiddenNote = document.getElementById('manual-hidden-note');

/** Tell the user when fields that are out of sight still have a value or are set to empty. */
function updateHiddenNote() {
  const count = manualCells.filter((item) => item.applicable && item.cell.hidden && (item.empty.checked || item.text.value.trim() !== '')).length;
  let note = '';
  if (count === 1) note = '1 hidden field still applies';
  else if (count > 1) note = `${count} hidden fields still apply`;
  hiddenNote.textContent = note;
}

function syncAllEmpty() {
  const shown = manualCells.filter((item) => !item.cell.hidden);
  const emptyCount = shown.filter((item) => item.empty.checked).length;
  allEmptySwitch.checked = shown.length > 0 && emptyCount === shown.length;
  allEmptySwitch.indeterminate = emptyCount > 0 && emptyCount < shown.length;
  updateHiddenNote();
}

// Applies to every field, also those of other message types, so changing the type keeps the choice.
allEmptySwitch.addEventListener('change', () => {
  for (const item of manualCells) setEmpty(item, allEmptySwitch.checked);
  syncAllEmpty();
});

document.getElementById('gen-type').addEventListener('change', updateManualVisibility);
showOptionalSwitch.addEventListener('change', updateManualVisibility);
document.getElementById('manual-clear').addEventListener('click', clearManual);
buildManual();
