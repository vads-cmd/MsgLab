'use strict';

const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('node:path');
const { validate } = require('./src/hl7/validator');
const { explain } = require('./src/hl7/explainer');
const { generate } = require('./src/hl7/generator');
const { generateBulk } = require('./src/hl7/bulk');
const files = require('./src/files');

// The HL7 logic runs here in the main process; the page asks for it through the preload script.
const asText = (value) => (typeof value === 'string' ? value : '');
ipcMain.handle('hl7:validate', (_event, text) => validate(asText(text)));
ipcMain.handle('hl7:explain', (_event, text) => explain(asText(text)));

// Only the listed options are passed on; problems are returned as a message for the page to show.
ipcMain.handle('hl7:generate', (_event, options) => {
  const o = options && typeof options === 'object' ? options : {};
  try {
    return {
      ok: true,
      ...generate({
        type: asText(o.type),
        version: asText(o.version),
        sendingApp: asText(o.sendingApp),
        sendingFacility: asText(o.sendingFacility),
        receivingApp: asText(o.receivingApp),
        receivingFacility: asText(o.receivingFacility),
        processingId: asText(o.processingId),
        seed: asText(o.seed),
        source: asText(o.source),
        fields: o.fields,
      }),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Many messages at once. The page only gets the messages and a short summary back.
ipcMain.handle('hl7:generateBulk', (_event, options) => {
  const o = options && typeof options === 'object' ? options : {};
  try {
    return {
      ok: true,
      ...generateBulk({
        count: Number(o.count),
        types: Array.isArray(o.types) ? o.types.map(asText) : [],
        mode: asText(o.mode) || undefined,
        minutesBetween: o.minutesBetween === '' ? undefined : Number(o.minutesBetween),
        version: asText(o.version),
        sendingApp: asText(o.sendingApp),
        sendingFacility: asText(o.sendingFacility),
        receivingApp: asText(o.receivingApp),
        receivingFacility: asText(o.receivingFacility),
        processingId: asText(o.processingId),
        seed: asText(o.seed),
      }),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Saving. The page sends the text and the options; the file name comes from the dialog,
// so the page never chooses a path itself.
const savedPaths = new Map(); // window -> the file it was last saved to
let lastFolder = null;

ipcMain.handle('file:save', async (event, payload) => {
  const p = payload && typeof payload === 'object' ? payload : {};
  const win = BrowserWindow.fromWebContents(event.sender);
  try {
    const { data, warning } = files.prepareFile(asText(p.text), { lineEnding: p.lineEnding, encoding: p.encoding, mllp: p.mllp === true });
    let target = p.mode === 'save' ? savedPaths.get(event.sender.id) : undefined;
    if (!target) {
      const chosen = await dialog.showSaveDialog(win, {
        title: 'Save message',
        defaultPath: path.join(lastFolder ?? app.getPath('documents'), files.suggestFileName(asText(p.text))),
        filters: [{ name: 'HL7 messages', extensions: ['hl7'] }, { name: 'Text files', extensions: ['txt'] }, { name: 'All files', extensions: ['*'] }],
      });
      if (chosen.canceled || !chosen.filePath) return { ok: false, canceled: true };
      target = chosen.filePath;
    }
    await files.writeFile(target, data);
    savedPaths.set(event.sender.id, target);
    lastFolder = path.dirname(target);
    return { ok: true, fileName: path.basename(target), bytes: data.length, warning };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('file:forget', (event) => {
  savedPaths.delete(event.sender.id);
});

// Windows with changes that were not saved; the page reports this as the text is edited
const dirtyWindows = new Set();
ipcMain.handle('file:setDirty', (event, dirty) => {
  if (dirty === true) dirtyWindows.add(event.sender.id);
  else dirtyWindows.delete(event.sender.id);
});

const OPEN_FILTERS = [
  { name: 'HL7 messages', extensions: ['hl7', 'txt', 'dat', 'msg'] },
  { name: 'All files', extensions: ['*'] },
];

async function confirmDiscard(win, action) {
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: [action, 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Unsaved changes',
    message: 'The message has changes that were not saved.',
    detail: 'If you continue, the changes are lost.',
  });
  return response === 0;
}

// Opening: from the dialog (the file stays tied to the window, so Save writes back to it when it holds
// one message) or from dropped bytes (no path, so Save asks for a file).
async function openFor(event, readIt) {
  const win = BrowserWindow.fromWebContents(event.sender);
  const id = event.sender.id;
  try {
    if (dirtyWindows.has(id) && !(await confirmDiscard(win, 'Discard changes and open'))) return { ok: false, canceled: true };
    const opened = await readIt(win);
    if (!opened) return { ok: false, canceled: true };
    const tied = opened.path !== null && opened.read.messages.length === 1;
    if (tied) savedPaths.set(id, opened.path);
    else savedPaths.delete(id);
    dirtyWindows.delete(id);
    return { ok: true, fileName: opened.fileName, tied, ...opened.read };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

ipcMain.handle('file:open', (event) => openFor(event, async (win) => {
  const chosen = await dialog.showOpenDialog(win, {
    title: 'Open message',
    defaultPath: lastFolder ?? app.getPath('documents'),
    properties: ['openFile'],
    filters: OPEN_FILTERS,
  });
  if (chosen.canceled || chosen.filePaths.length === 0) return null;
  const file = chosen.filePaths[0];
  const read = files.readMessages(await files.readFile(file));
  lastFolder = path.dirname(file);
  return { path: file, fileName: path.basename(file), read };
}));

ipcMain.handle('file:openData', (event, payload) => openFor(event, async () => {
  const p = payload && typeof payload === 'object' ? payload : {};
  const bytes = ArrayBuffer.isView(p.data) ? Buffer.from(p.data.buffer, p.data.byteOffset, p.data.byteLength) : Buffer.from(p.data ?? []);
  return { path: null, fileName: path.basename(asText(p.name)) || 'dropped file', read: files.readMessages(bytes) };
}));

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'HL7 Workbench',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const id = win.webContents.id;
  win.on('close', (event) => {
    if (!dirtyWindows.has(id)) return;
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Close and discard the changes', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved changes',
      message: 'The message has changes that were not saved.',
    });
    if (choice !== 0) event.preventDefault();
  });
  win.on('closed', () => {
    dirtyWindows.delete(id);
    savedPaths.delete(id);
  });
  win.loadFile(path.join(__dirname, 'index.html')).catch((err) => {
    console.error('Could not load the page:', err);
  });
}

app.whenReady().then(() => {
  createWindow();
  // macOS: re-create the window when the dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}).catch((err) => {
  console.error('Could not start the app:', err);
  app.quit();
});

// Quit when all windows are closed, except on macOS where apps stay active until Cmd+Q
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
