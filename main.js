'use strict';

const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { validate } = require('./src/hl7/validator');
const { explain } = require('./src/hl7/explainer');
const { generate } = require('./src/hl7/generator');
const { generateBulk } = require('./src/hl7/bulk');
const files = require('./src/files');
const mllp = require('./src/mllp');
const settingsStore = require('./src/settings');
const { buildMenuTemplate } = require('./src/menu');
const { ABOUT } = require('./src/about');

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

// Remembered settings (form choices and the last folder), kept in a small file in the app's data folder.
let controlSettings = {};
let defaultFolders = { save: null, export: null };
let favoriteTypes = [];
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let writing = Promise.resolve();
function persistSettings() {
  const snapshot = { controls: controlSettings, folder: lastFolder, folders: defaultFolders, favorites: favoriteTypes };
  // one write after the other, so two quick saves cannot mix
  writing = writing.then(() => settingsStore.saveSettings(settingsFile(), snapshot)).catch((err) => console.error('Could not save settings:', err.message));
  return writing;
}
function rememberFolder(folder) {
  lastFolder = folder;
  void persistSettings(); // never rejects: errors are logged inside, and nobody needs to wait for the write
}

// Light, dark or follow the system. Electron then also changes what the page's prefers-color-scheme says,
// so the stylesheet needs no extra rules, and the menus and dialogs follow too.
function applyTheme(value) {
  nativeTheme.themeSource = settingsStore.THEMES.has(value) ? value : 'system';
}

// Sending: the connection is made here, never in the page. Each request has an ID so it can be cancelled.
const runningSends = new Map();

async function runSend(payload, { needsMessage, action }) {
  const request = mllp.cleanRequest(payload, { needsMessage });
  if (request.error) return { ok: false, outcome: 'invalid-input', message: request.error, warnings: [] };
  const controller = new AbortController();
  runningSends.set(request.requestId, controller);
  try {
    return await action({ ...request.options, signal: controller.signal });
  } finally {
    runningSends.delete(request.requestId);
  }
}

ipcMain.handle('mllp:send', (_event, payload) => runSend(payload, { needsMessage: true, action: mllp.sendMessage }));
ipcMain.handle('mllp:test', (_event, payload) => runSend(payload, { needsMessage: false, action: mllp.testConnection }));
ipcMain.handle('mllp:cancel', (_event, requestId) => {
  runningSends.get(asText(requestId))?.abort();
});

ipcMain.handle('app:setTheme', (_event, value) => {
  applyTheme(value);
  return nativeTheme.themeSource;
});

ipcMain.handle('settings:load', () => ({ ids: [...settingsStore.REMEMBERED_CONTROLS], controls: controlSettings, folders: defaultFolders, favorites: favoriteTypes }));
ipcMain.handle('settings:setFavorites', (_event, list) => {
  favoriteTypes = settingsStore.cleanFavorites(list);
  return persistSettings().then(() => favoriteTypes);
});
ipcMain.handle('settings:save', (_event, controls) => {
  controlSettings = settingsStore.cleanSettings({ controls }).controls;
  return persistSettings().then(() => true);
});

// Where a Save or Export dialog starts: the default folder when it is set and still there,
// otherwise the folder used last, otherwise Documents.
async function isFolder(folder) {
  try {
    return (await fs.stat(folder)).isDirectory();
  } catch {
    return false;
  }
}

async function startFolder(kind) {
  const wanted = defaultFolders[kind];
  if (wanted && await isFolder(wanted)) return wanted;
  return lastFolder ?? app.getPath('documents');
}

// Choosing a default folder: the dialog is in the main process, the page only sees the result (to show it).
ipcMain.handle('settings:chooseFolder', async (event, kind) => {
  if (!settingsStore.FOLDER_KINDS.has(kind)) return { ok: false, error: 'Unknown folder setting.' };
  const chosen = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
    title: kind === 'save' ? 'Default folder for saving messages' : 'Default folder for exporting the bulk list',
    defaultPath: await startFolder(kind),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (chosen.canceled || chosen.filePaths.length === 0) return { ok: false, canceled: true };
  defaultFolders = { ...defaultFolders, [kind]: chosen.filePaths[0] };
  await persistSettings();
  return { ok: true, path: chosen.filePaths[0] };
});

ipcMain.handle('settings:clearFolder', async (_event, kind) => {
  if (!settingsStore.FOLDER_KINDS.has(kind)) return { ok: false, error: 'Unknown folder setting.' };
  defaultFolders = { ...defaultFolders, [kind]: null };
  await persistSettings();
  return { ok: true };
});

// About: the text comes from src/about.js, the version from package.json. The link is opened from here
// with the fixed address, so the page cannot ask for any other address to be opened.
ipcMain.handle('app:info', () => ({ ...ABOUT, version: app.getVersion() }));
ipcMain.handle('app:openRepository', async () => {
  await shell.openExternal(ABOUT.repository);
  return true;
});

ipcMain.handle('file:save', async (event, payload) => {
  const p = payload && typeof payload === 'object' ? payload : {};
  const win = BrowserWindow.fromWebContents(event.sender);
  try {
    const { data, warning } = files.prepareFile(asText(p.text), { lineEnding: p.lineEnding, encoding: p.encoding, mllp: p.mllp === true });
    let target = p.mode === 'save' ? savedPaths.get(event.sender.id) : undefined;
    if (!target) {
      const chosen = await dialog.showSaveDialog(win, {
        title: 'Save message',
        defaultPath: path.join(await startFolder('save'), files.suggestFileName(asText(p.text))),
        filters: [{ name: 'HL7 messages', extensions: ['hl7'] }, { name: 'Text files', extensions: ['txt'] }, { name: 'All files', extensions: ['*'] }],
      });
      if (chosen.canceled || !chosen.filePath) return { ok: false, canceled: true };
      target = chosen.filePath;
    }
    await files.writeFile(target, data);
    savedPaths.set(event.sender.id, target);
    rememberFolder(path.dirname(target));
    return { ok: true, fileName: path.basename(target), bytes: data.length, warning };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('file:forget', (event) => {
  savedPaths.delete(event.sender.id);
});

// Exporting the messages of the bulk list: one file (save dialog) or several (folder dialog).
// The page sends only the texts and the options; the place comes from the dialog.
ipcMain.handle('file:export', async (event, payload) => {
  const p = payload && typeof payload === 'object' ? payload : {};
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!Array.isArray(p.messages) || p.messages.some((text) => typeof text !== 'string')) return { ok: false, error: 'The messages must be a list of text.' };
  try {
    const options = { lineEnding: p.lineEnding, encoding: p.encoding, mllp: p.mllp === true, batch: p.batch === true };
    const plan = files.planExport(p.messages, { mode: p.mode });
    const prepared = files.prepareExportFiles(plan, options);
    if (p.mode === 'one') {
      const chosen = await dialog.showSaveDialog(win, {
        title: 'Export messages',
        defaultPath: path.join(await startFolder('export'), prepared[0].fileName),
        filters: [{ name: 'HL7 messages', extensions: ['hl7'] }, { name: 'Text files', extensions: ['txt'] }, { name: 'All files', extensions: ['*'] }],
      });
      if (chosen.canceled || !chosen.filePath) return { ok: false, canceled: true };
      await files.writeFile(chosen.filePath, prepared[0].data);
      rememberFolder(path.dirname(chosen.filePath));
      return { ok: true, files: 1, bytes: prepared[0].data.length, where: path.basename(chosen.filePath), messages: plan[0].texts.length };
    }
    const chosen = await dialog.showOpenDialog(win, {
      title: p.mode === 'each' ? 'Choose a folder for the message files' : 'Choose a folder for the files',
      defaultPath: await startFolder('export'),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (chosen.canceled || chosen.filePaths.length === 0) return { ok: false, canceled: true };
    const folder = chosen.filePaths[0];
    const existing = await files.existingFiles(folder, prepared);
    if (existing.length > 0) {
      const { response } = await dialog.showMessageBox(win, {
        type: 'warning',
        buttons: ['Replace', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        title: 'Files already exist',
        message: `${existing.length} of the ${prepared.length} files already exist in this folder.`,
        detail: `${existing.slice(0, 5).join('\n')}${existing.length > 5 ? '\n...' : ''}`,
      });
      if (response !== 0) return { ok: false, canceled: true };
    }
    const written = await files.writeExport(folder, prepared, (done, total) => {
      if (done % 50 === 0 || done === total) event.sender.send('export:progress', { done, total });
    });
    rememberFolder(folder);
    return { ok: true, ...written, where: path.basename(folder), messages: plan.reduce((sum, file) => sum + file.texts.length, 0) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
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

// New message: asks first when there are unsaved changes; the page then clears the editor.
ipcMain.handle('file:new', async (event) => {
  const id = event.sender.id;
  if (dirtyWindows.has(id) && !(await confirmDiscard(BrowserWindow.fromWebContents(event.sender), 'Discard changes and start new'))) return { ok: false, canceled: true };
  savedPaths.delete(id);
  dirtyWindows.delete(id);
  return { ok: true };
});

// The File menu: the chosen command goes to the window that has the focus, and the page does the work.
function sendMenuCommand(command) {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.webContents.send('menu:command', command);
}

function setUpMenu() {
  const template = buildMenuTemplate({ send: sendMenuCommand, isMac: process.platform === 'darwin', appName: app.name, devTools: !app.isPackaged });
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
  rememberFolder(path.dirname(file));
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
    title: ABOUT.name,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // The page never opens new windows or leaves index.html; links go through the main process
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
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

app.whenReady().then(async () => {
  const saved = await settingsStore.loadSettings(settingsFile());
  controlSettings = saved.controls;
  lastFolder = saved.folder;
  defaultFolders = saved.folders;
  favoriteTypes = saved.favorites;
  applyTheme(controlSettings['app-theme']);
  setUpMenu();
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
