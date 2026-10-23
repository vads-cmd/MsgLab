'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { validate } = require('./src/hl7/validator');
const { explain } = require('./src/hl7/explainer');
const { generate } = require('./src/hl7/generator');
const { generateBulk } = require('./src/hl7/bulk');

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
