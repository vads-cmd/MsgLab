'use strict';

// The commands the File menu sends to the page, with their labels and shortcuts.
const FILE_COMMANDS = [
  { command: 'new', label: 'New message', accelerator: 'CmdOrCtrl+N' },
  { command: 'open', label: 'Open...', accelerator: 'CmdOrCtrl+O' },
  { command: 'save', label: 'Save', accelerator: 'CmdOrCtrl+S' },
  { command: 'saveAs', label: 'Save as...', accelerator: 'CmdOrCtrl+Shift+S' },
  { command: 'export', label: 'Export bulk list...', accelerator: 'CmdOrCtrl+E' },
];

/**
 * The menu as a plain template for Electron's Menu.buildFromTemplate.
 * send(command) is called when a File item is chosen; it is up to the caller to deliver it to the right window.
 */
function buildMenuTemplate({ send, isMac, appName, devTools }) {
  const fileItems = FILE_COMMANDS.map(({ command, label, accelerator }) => ({ label, accelerator, click: () => send(command) }));
  const file = {
    label: 'File',
    submenu: [
      ...fileItems.slice(0, 4),
      { type: 'separator' },
      fileItems[4],
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' },
    ],
  };
  const edit = {
    label: 'Edit',
    submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ],
  };
  const view = {
    label: 'View',
    submenu: [
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' },
      { role: 'togglefullscreen' },
      ...(devTools ? [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] : []),
    ],
  };
  const windowMenu = { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ role: 'front' }] : [{ role: 'close' }])] };
  const template = [file, edit, view, windowMenu];
  if (isMac) template.unshift({ label: appName, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] });
  return template;
}

module.exports = { FILE_COMMANDS, buildMenuTemplate };
