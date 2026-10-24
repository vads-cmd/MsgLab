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

// Gives an element a stable test id (data-testid) so end-to-end tests can find it
function tid(node, id) {
  node.dataset.testid = id;
  return node;
}

function idPart(text) {
  const dashed = String(text).replaceAll(/[^\w-]+/g, '-');
  let start = 0;
  let end = dashed.length;
  while (start < end && dashed[start] === '-') start += 1;
  while (end > start && dashed[end - 1] === '-') end -= 1;
  return dashed.slice(start, end);
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
    panels[name].replaceChildren(tid(el('p', 'placeholder', PLACEHOLDERS[name]), `${name}-placeholder`));
  }
  setValidationLabel(0);
}

/* ---- validation tab ---- */

function renderValidation(result) {
  const children = [];

  const summary = tid(el('div', 'summary'), 'validation-summary');
  summary.append(tid(el('span', `badge ${result.valid ? 'ok' : 'bad'}`, result.valid ? 'Valid' : 'Not valid'), 'validation-badge'));
  const parts = [plural(result.counts.error, 'error'), plural(result.counts.warning, 'warning')];
  if (result.counts.info) parts.push(plural(result.counts.info, 'note'));
  if (result.messageType) parts.unshift(result.messageType);
  summary.append(tid(el('span', 'summary-text', parts.join(' · ')), 'validation-summary-text'));
  children.push(summary);

  if (result.issues.length === 0) {
    children.push(tid(el('p', 'placeholder', 'No problems found.'), 'validation-empty'));
  } else {
    const list = tid(el('ul', 'issues'), 'validation-issues');
    result.issues.forEach((issue, index) => {
      const name = `validation-issue-${index + 1}`;
      const item = tid(el('li', `issue ${issue.severity}`), name);
      item.append(tid(el('span', 'severity', issue.severity), `${name}-severity`));
      const body = tid(el('div', 'issue-body'), `${name}-body`);
      body.append(tid(el('div', 'issue-message', issue.message), `${name}-message`));
      body.append(tid(el('div', 'issue-where', [issue.path, `line ${issue.line}`].filter(Boolean).join(' · ')), `${name}-where`));
      item.append(body);
      list.append(item);
    });
    children.push(list);
  }

  panels.validation.replaceChildren(...children);
  setValidationLabel(result.counts.error + result.counts.warning);
}

/* ---- explain tab ---- */

function renderChips(field, prefix) {
  const comps = tid(el('div', 'f-comps'), `${prefix}-chips`);
  let count = 0;
  for (const rep of field.reps) {
    for (const c of rep.components) {
      count += 1;
      const chip = tid(el('span', 'chip'), `${prefix}-chip-${count}`);
      chip.append(tid(el('span', 'chip-name', c.name || `#${c.n}`), `${prefix}-chip-${count}-name`));
      chip.append(document.createTextNode(c.decoded ? ` ${c.value} (${c.decoded})` : ` ${c.value}`));
      comps.append(chip);
    }
  }
  return comps;
}

function renderFieldRow(field, segmentNumber) {
  const prefix = `explain-segment-${segmentNumber}-field-${idPart(field.path)}`;
  const row = tid(el('tr'), prefix);
  row.append(tid(el('td', 'f-path', field.path), `${prefix}-path`), tid(el('td', 'f-name', field.name), `${prefix}-name`));

  const value = tid(el('td', 'f-value'), `${prefix}-value`);
  value.append(tid(el('div', 'f-display', field.display), `${prefix}-display`));
  if (field.reps.some((rep) => rep.components.length > 1)) value.append(renderChips(field, prefix));
  row.append(value, tid(el('td', 'f-type', field.dt), `${prefix}-type`));
  return row;
}

function renderSegment(seg, number) {
  const prefix = `explain-segment-${number}`;
  const details = tid(el('details', 'segment'), prefix);
  details.open = true;
  const summary = tid(el('summary'), `${prefix}-summary`);
  summary.append(tid(el('span', 'seg-name', seg.name), `${prefix}-name`), tid(el('span', 'seg-desc', seg.description), `${prefix}-desc`));
  details.append(summary);

  if (seg.fields.length === 0) {
    details.append(tid(el('p', 'placeholder', seg.known ? 'No values in this segment.' : 'This segment is not in the built-in dictionary.'), `${prefix}-note`));
    return details;
  }

  const table = tid(el('table', 'fields'), `${prefix}-fields`);
  for (const field of seg.fields) table.append(renderFieldRow(field, number));
  details.append(table);
  return details;
}

function renderExplain(result) {
  if (result.empty) {
    panels.explain.replaceChildren(tid(el('p', 'placeholder', PLACEHOLDERS.explain), 'explain-placeholder'));
    return;
  }
  const children = [];
  if (result.narrative) children.push(tid(el('p', 'narrative', result.narrative), 'explain-narrative'));
  if (result.facts.length) {
    const list = tid(el('dl', 'facts'), 'explain-facts');
    result.facts.forEach((fact, index) => {
      const name = `explain-fact-${index + 1}`;
      list.append(tid(el('dt', '', fact.label), `${name}-label`), tid(el('dd', '', fact.value), `${name}-value`));
    });
    children.push(list);
  }
  result.segments.forEach((seg, index) => children.push(renderSegment(seg, index + 1)));
  panels.explain.replaceChildren(...children);
}

/* ---- wiring ---- */

// "4 segments - 212 characters" under the message
function updateStats() {
  const text = input.value;
  const segments = text.split(/\r\n|\r|\n/).filter((line) => line.trim() !== '').length;
  document.getElementById('message-stats').textContent = segments === 0 ? '' : `${plural(segments, 'segment')} - ${plural(text.length, 'character')}`;
}

// Line numbers: one number per real line, as tall as that line is once wrapped
const gutter = document.getElementById('message-gutter');
const gutterInner = gutter.firstElementChild;
const mirror = document.getElementById('message-mirror');

function updateLineNumbers() {
  const lines = input.value.split('\n');
  const style = getComputedStyle(input);
  mirror.style.width = `${input.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)}px`;
  mirror.replaceChildren(...lines.map((line) => el('div', '', line === '' ? '\u200B' : line)));
  gutter.style.width = `${String(lines.length).length}ch`;
  gutterInner.replaceChildren(...lines.map((_, index) => {
    const row = tid(el('div', '', String(index + 1)), `message-line-${index + 1}`);
    row.style.height = `${mirror.children[index].getBoundingClientRect().height}px`;
    return row;
  }));
  gutterInner.style.transform = `translateY(${-input.scrollTop}px)`;
}
input.addEventListener('scroll', () => {
  gutterInner.style.transform = `translateY(${-input.scrollTop}px)`;
});
if (typeof ResizeObserver === 'function') new ResizeObserver(updateLineNumbers).observe(input);

async function run() {
  updateStats();
  updateLineNumbers();
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
      panels[name].replaceChildren(tid(el('p', 'placeholder', `Something went wrong: ${err.message}`), `${name}-error`));
    }
  }
}

tabs.forEach((tab) => tab.addEventListener('click', () => selectTab(tab.dataset.tab)));
input.addEventListener('input', () => {
  clearTimeout(timer);
  updateLineNumbers();
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

/** Shows a problem in a status line. */
function showFailure(element, message) {
  element.classList.add('error');
  element.textContent = message;
}

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
    if (!result.ok) {
      showFailure(genStatus, result.error);
      return;
    }
    replacedText = type === 'ACK' ? previous : null;
    restoreButton.hidden = replacedText === null;
    detachFile();
    input.value = result.text;
    input.scrollTop = 0;
    const manualNote = result.manual.length ? ` · ${plural(result.manual.length, 'manual value')}` : '';
    genStatus.textContent = `Generated ${result.type} (v${result.version}) · seed ${result.seed}${manualNote}`;
    fileStatus.classList.remove('error');
    fileStatus.textContent = genStatus.textContent;
    showView('editor');
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
  document.title = `${changedSinceSave && savedName ? '* ' : ''}${name}MsgLab`;
  // the same in the pane title: the file name, and a note while it has changes that were not saved
  const label = document.getElementById('message-name');
  const note = changedSinceSave ? ' (not saved)' : '';
  label.textContent = savedName ? `${savedName}${note}` : '';
  label.classList.toggle('changed', changedSinceSave && savedName !== '');
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
    if (!result.ok) {
      showFailure(fileStatus, result.error);
      return;
    }
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
  updateFormatSummary();
  showView('editor');
  replacedText = null;
  restoreButton.hidden = true;
  input.value = messages[0].text;
  input.scrollTop = 0;
  const many = messages.length > 1;
  if (many) {
    showBulkResult({ summary: `${result.fileName}: ${plural(messages.length, 'message')}${result.batch ? ' (batch file)' : ''}`, messages });
  }
  if (result.tied) {
    savedName = result.fileName;
    changedSinceSave = false;
    updateTitle();
    syncDirty();
  } else {
    detachFile();
  }
  const listed = many ? ` - ${plural(messages.length, 'message')}, listed in the Bulk view; the first one is shown` : '';
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
    if (!result.ok) {
      showFailure(fileStatus, result.error);
      return false;
    }
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

/* ---- bulk generation ---- */

const bulkForm = document.getElementById('bulk-form');
const bulkStatus = document.getElementById('bulk-status');
const bulkResult = document.getElementById('bulk-result');
const SHOWN_ROWS = 200; // the table lists the first rows only; "Copy all" always copies everything
let bulkMessages = [];

/* ---- favourite message types ---- */

// The list of types comes from the page; the dropdown is rebuilt from it with the favourites on top,
// and the other types grouped by family (ADT, ORM, ORU ...), so a long list stays easy to scan.
const typeSelect = document.getElementById('gen-type');
const favButton = document.getElementById('gen-fav');
const ALL_TYPES = Array.from(typeSelect.options, (option) => ({ value: option.value, text: option.textContent }));
const FAMILY_LABELS = { ADT: 'ADT - Patient administration', ORM: 'ORM - Orders', ORU: 'ORU - Observation results', ACK: 'ACK - Acknowledgements' };
let favorites = [];

const familyOf = (value) => value.split('^')[0];

function typeGroups() {
  const favs = ALL_TYPES.filter((type) => favorites.includes(type.value));
  const rest = ALL_TYPES.filter((type) => !favorites.includes(type.value));
  const groups = favs.length > 0 ? [['\u2605 Favorites', favs]] : [];
  for (const family of new Set(rest.map((type) => familyOf(type.value)))) {
    groups.push([FAMILY_LABELS[family] ?? family, rest.filter((type) => familyOf(type.value) === family)]);
  }
  return groups;
}

function updateFavoriteButton() {
  const on = favorites.includes(typeSelect.value);
  const label = on ? 'Remove from favorites' : 'Add to favorites';
  favButton.textContent = on ? '\u2605' : '\u2606';
  favButton.setAttribute('aria-pressed', String(on));
  favButton.setAttribute('aria-label', label);
  favButton.title = label;
  favButton.classList.toggle('on', on);
}

function renderTypeOptions() {
  const current = typeSelect.value;
  typeSelect.replaceChildren(...typeGroups().map(([label, types]) => {
    const group = tid(el('optgroup'), `gen-type-group-${idPart(label)}`);
    group.label = label;
    group.append(...types.map((type) => {
      const option = tid(el('option', '', type.text), `gen-type-option-${idPart(type.value)}`);
      option.value = type.value;
      return option;
    }));
    return group;
  }));
  typeSelect.value = current;
  updateFavoriteButton();
  buildBulkTypes();
}

function setFavorites(list) {
  favorites = list.filter((value) => ALL_TYPES.some((type) => type.value === value));
  renderTypeOptions();
}

favButton.addEventListener('click', () => {
  const value = typeSelect.value;
  favorites = favorites.includes(value) ? favorites.filter((item) => item !== value) : [...favorites, value];
  renderTypeOptions();
  window.hl7.setFavorites(favorites).catch(console.error);
});
typeSelect.addEventListener('change', updateFavoriteButton);

// The bulk list shows the favourites first; ticks are kept when the list is rebuilt
function buildBulkTypes() {
  const box = document.getElementById('bulk-types');
  const first = box.children.length === 0;
  const ticked = new Set(Array.from(box.querySelectorAll('input:checked'), (check) => check.value));
  const types = ALL_TYPES.filter((type) => type.value !== 'ACK'); // an ACK answers one given message
  types.sort((a, b) => Number(favorites.includes(b.value)) - Number(favorites.includes(a.value)));
  box.replaceChildren(...types.map((type) => {
    const name = `bulk-type-${idPart(type.value)}`;
    const label = tid(el('label'), `${name}-label`);
    const check = tid(el('input'), name);
    check.type = 'checkbox';
    check.value = type.value;
    check.checked = first ? type.value === 'ADT^A01' : ticked.has(type.value);
    const star = favorites.includes(type.value) ? '\u2605 ' : '';
    label.append(check, document.createTextNode(` ${star}${type.value}`));
    return label;
  }));
  document.getElementById('bulk-types-favs').disabled = !types.some((type) => favorites.includes(type.value));
}

// Quick ways to tick the list, which grows as more message types are added
function tickTypes(wanted) {
  for (const check of document.querySelectorAll('#bulk-types input')) check.checked = wanted(check.value);
}
document.getElementById('bulk-types-all').addEventListener('click', () => tickTypes(() => true));
document.getElementById('bulk-types-none').addEventListener('click', () => tickTypes(() => false));
document.getElementById('bulk-types-favs').addEventListener('click', () => tickTypes((value) => favorites.includes(value)));

function showBulkResult(result) {
  bulkMessages = result.messages;
  const counts = `${plural(result.count, 'message')} for ${plural(result.patients, 'patient')} · seed ${result.seed}`;
  document.getElementById('bulk-summary').textContent = result.summary ?? counts;
  document.getElementById('bulk-copy-status').textContent = '';
  const rows = [];
  bulkMessages.slice(0, SHOWN_ROWS).forEach((message, index) => {
    const name = `bulk-row-${index + 1}`;
    const row = tid(el('tr'), name);
    const open = tid(el('button', '', 'Show'), `bulk-show-${index + 1}`);
    open.type = 'button';
    open.addEventListener('click', () => {
      input.value = message.text;
      input.scrollTop = 0;
      replacedText = null;
      restoreButton.hidden = true;
      detachFile();
      clearTimeout(timer);
      run().catch(console.error);
      showView('editor');
    });
    const action = tid(el('td'), `${name}-action`);
    action.append(open);
    row.append(
      tid(el('td', '', String(index + 1)), `${name}-number`),
      tid(el('td', '', message.type), `${name}-type`),
      tid(el('td', '', message.patient), `${name}-patient`),
      tid(el('td', '', message.time), `${name}-time`),
      tid(el('td', '', message.controlId), `${name}-control-id`),
      action,
    );
    rows.push(row);
  });
  if (bulkMessages.length > SHOWN_ROWS) {
    const more = tid(el('tr'), 'bulk-more');
    more.append(tid(el('td', '', `... and ${bulkMessages.length - SHOWN_ROWS} more (all are included when you copy)`), 'bulk-more-text'));
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
    if (!result.ok) {
      showFailure(bulkStatus, result.error);
      return;
    }
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

/* ---- exporting the list ---- */

const exportBatch = document.getElementById('export-batch');
const exportMode = document.getElementById('export-mode');
const exportStatus = document.getElementById('export-status');

// The batch header applies to files with several messages, and it cannot be combined with MLLP
function syncExportControls() {
  const mllp = document.getElementById('file-mllp').checked;
  const single = exportMode.value === 'each';
  exportBatch.disabled = mllp || single;
  let hint = '';
  if (mllp) hint = 'A batch header cannot be combined with MLLP';
  else if (single) hint = 'Files with a single message get no batch header';
  exportBatch.title = hint;
}
exportMode.addEventListener('change', syncExportControls);
document.getElementById('file-mllp').addEventListener('change', syncExportControls);
syncExportControls();

window.hl7.onExportProgress(({ done, total }) => {
  exportStatus.textContent = `Writing files: ${done} of ${total}`;
});

async function exportMessages() {
  exportStatus.classList.remove('error');
  exportStatus.textContent = '';
  const button = document.getElementById('export-run');
  button.disabled = true;
  try {
    const result = await window.hl7.exportMessages({
      messages: bulkMessages.map((message) => message.text),
      mode: exportMode.value,
      batch: exportBatch.checked && !exportBatch.disabled,
      lineEnding: fieldValue('file-eol'),
      encoding: fieldValue('file-encoding'),
      mllp: document.getElementById('file-mllp').checked,
    });
    if (result.canceled) return;
    if (!result.ok) {
      showFailure(exportStatus, result.error);
      return;
    }
    exportStatus.textContent = `Exported ${plural(result.messages, 'message')} to ${plural(result.files, 'file')} in ${result.where}`;
  } catch (err) {
    exportStatus.classList.add('error');
    exportStatus.textContent = err.message;
  } finally {
    button.disabled = false;
  }
}

document.getElementById('export-run').addEventListener('click', () => exportMessages().catch(console.error));

renderTypeOptions();

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
    const groupId = `manual-group-${idPart(title).toLowerCase()}`;
    const group = tid(el('fieldset', 'manual-group'), groupId);
    group.append(tid(el('legend', '', title), `${groupId}-title`));
    const grid = tid(el('div', 'manual-grid'), `${groupId}-grid`);
    for (const [key, label, events] of fields) {
      const cell = tid(el('div', 'manual-cell'), `manual-${key}`);
      const text = tid(el('input'), `manual-${key}-value`);
      text.type = 'text';
      text.id = `m-${key}`;
      text.placeholder = 'random';
      text.maxLength = 80;
      text.autocomplete = 'off';
      const caption = tid(el('label', 'manual-label', label), `manual-${key}-label`);
      caption.htmlFor = text.id;
      const empty = tid(el('input'), `manual-${key}-empty`);
      empty.type = 'checkbox';
      empty.id = `m-${key}-empty`;
      const emptyLabel = tid(el('label', 'manual-empty'), `manual-${key}-empty-label`);
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

/* ---- remembered settings ---- */

// The main process says which controls are remembered; their values are applied once
// everything else is set up, and saved shortly after each change.
async function setUpSettings() {
  const { ids, controls, folders, favorites: favoriteList } = await window.hl7.loadSettings();
  setFavorites(favoriteList ?? []);
  showFolder('save', folders.save);
  showFolder('export', folders.export);
  const remembered = new Set(ids);
  for (const [id, value] of Object.entries(controls)) {
    const control = document.getElementById(id);
    if (!control) continue;
    if (control.type === 'checkbox') control.checked = value === true;
    else if (typeof value === 'string' && (control.tagName !== 'SELECT' || [...control.options].some((option) => option.value === value))) control.value = value;
    else continue;
    control.dispatchEvent(new Event('change', { bubbles: true }));
  }
  let timer = null;
  const save = () => {
    const current = {};
    for (const id of remembered) {
      const control = document.getElementById(id);
      if (control) current[id] = control.type === 'checkbox' ? control.checked : control.value;
    }
    window.hl7.saveSettings(current).catch(console.error);
  };
  const later = (event) => {
    if (!remembered.has(event.target.id)) return;
    clearTimeout(timer);
    timer = setTimeout(save, 400);
  };
  document.addEventListener('change', later);
  document.addEventListener('input', later);
}

// The theme is applied by the main process (it changes what prefers-color-scheme reports)
document.getElementById('app-theme').addEventListener('change', (event) => {
  window.hl7.setTheme(event.target.value).catch(console.error);
});

setUpSettings().catch(console.error);

/* ---- File menu ---- */

// The shortcuts belong to the menu (Ctrl/Cmd+N, O, S, Shift+S, E); it sends the command here.
async function newMessage() {
  const result = await window.hl7.newMessage();
  if (!result.ok) return;
  input.value = '';
  replacedText = null;
  restoreButton.hidden = true;
  fileStatus.classList.remove('error');
  fileStatus.textContent = '';
  detachFile();
  clearTimeout(timer);
  run().catch(console.error);
  input.focus();
}

function exportFromMenu() {
  if (bulkMessages.length === 0) {
    exportStatus.classList.add('error');
    exportStatus.textContent = 'There is no list to export. Generate messages in the Bulk view, or open a file with several messages.';
    showView('bulk');
    return Promise.resolve();
  }
  return exportMessages();
}

// Save, Open and New work on the message, so the Editor view is brought forward first
const inEditor = (action) => () => {
  showView('editor');
  return action();
};
const MENU_COMMANDS = {
  about: showAbout,
  new: inEditor(newMessage),
  open: inEditor(openFromDialog),
  save: inEditor(() => saveMessage('save')),
  saveAs: inEditor(() => saveMessage('saveAs')),
  export: () => {
    showView('bulk');
    return exportFromMenu();
  },
};

window.hl7.onMenuCommand((command) => {
  const action = Object.hasOwn(MENU_COMMANDS, command) ? MENU_COMMANDS[command] : null;
  if (action) action().catch(console.error);
});

/* ---- views (the sidebar) ---- */

const navItems = Array.from(document.querySelectorAll('.nav-item'));

function showView(name) {
  const target = document.getElementById(`view-${name}`);
  if (!target) return;
  for (const view of document.querySelectorAll('.view')) view.hidden = view !== target;
  for (const item of navItems) {
    const active = item.dataset.view === name;
    item.classList.toggle('active', active);
    if (active) item.setAttribute('aria-current', 'page');
    else item.removeAttribute('aria-current');
  }
}

for (const item of navItems) item.addEventListener('click', () => showView(item.dataset.view));

// The Editor shows the file format that Save will use; the choice itself lives in Settings
const FORMAT_NAMES = { cr: 'CR', lf: 'LF', crlf: 'CRLF', 'utf-8': 'UTF-8', 'windows-1252': 'Windows-1252' };

function updateFormatSummary() {
  const parts = [FORMAT_NAMES[fieldValue('file-eol')], FORMAT_NAMES[fieldValue('file-encoding')]];
  if (document.getElementById('file-mllp').checked) parts.push('MLLP');
  document.getElementById('file-format').textContent = parts.join(' - ');
}

for (const id of ['file-eol', 'file-encoding', 'file-mllp']) document.getElementById(id).addEventListener('change', updateFormatSummary);
document.getElementById('file-format').addEventListener('click', () => showView('settings'));
updateFormatSummary();

/* ---- default folders ---- */

const FOLDER_UNSET = 'Not set - the last used folder is used';

function showFolder(kind, folder) {
  const output = document.getElementById(`folder-${kind}`);
  output.textContent = folder || FOLDER_UNSET;
  output.title = folder || '';
  output.classList.toggle('unset', !folder);
}

async function changeFolder(kind, action) {
  const status = document.getElementById('folder-status');
  status.classList.remove('error');
  status.textContent = '';
  const result = await action();
  if (result.canceled) return;
  if (!result.ok) {
    showFailure(status, result.error);
    return;
  }
  showFolder(kind, result.path ?? null);
}

for (const kind of ['save', 'export']) {
  document.getElementById(`folder-${kind}-choose`).addEventListener('click', () => changeFolder(kind, () => window.hl7.chooseFolder(kind)).catch(console.error));
  document.getElementById(`folder-${kind}-clear`).addEventListener('click', () => changeFolder(kind, () => window.hl7.clearFolder(kind)).catch(console.error));
}

/* ---- About ---- */

const aboutDialog = document.getElementById('about');

async function showAbout() {
  const info = await window.hl7.getAppInfo();
  document.getElementById('about-name').textContent = info.name;
  document.getElementById('about-version').textContent = `Version ${info.version}`;
  document.getElementById('about-license').textContent = info.license;
  document.getElementById('about-owner').textContent = info.owner;
  const link = document.getElementById('about-repo');
  link.textContent = info.repository;
  link.href = info.repository;
  aboutDialog.showModal();
}

// The link is opened by the main process (always the repository address), never by the page itself
document.getElementById('about-repo').addEventListener('click', (event) => {
  event.preventDefault();
  window.hl7.openRepository().catch(console.error);
});

// The logo in the header opens it too (the Help menu has the same item)
document.getElementById('about-open').addEventListener('click', () => showAbout().catch(console.error));

// A click on the dark area around the window closes it
aboutDialog.addEventListener('click', (event) => {
  if (event.target === aboutDialog) aboutDialog.close();
});
