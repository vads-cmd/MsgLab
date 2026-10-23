'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { validate } = require('./src/hl7/validator');
const { explain } = require('./src/hl7/explainer');
const { generate } = require('./src/hl7/generator');

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
        fields: o.fields,
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
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  // macOS: re-create the window when the dock icon is clicked and no windows are open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS where apps stay active until Cmd+Q
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
