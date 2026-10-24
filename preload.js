'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The only functions the page can call. Add new ones here as the app grows.
contextBridge.exposeInMainWorld('hl7', {
  validate: (text) => ipcRenderer.invoke('hl7:validate', text),
  explain: (text) => ipcRenderer.invoke('hl7:explain', text),
  generate: (options) => ipcRenderer.invoke('hl7:generate', options),
  generateBulk: (options) => ipcRenderer.invoke('hl7:generateBulk', options),
  saveMessage: (payload) => ipcRenderer.invoke('file:save', payload),
  forgetFile: () => ipcRenderer.invoke('file:forget'),
  openFile: () => ipcRenderer.invoke('file:open'),
  openFileData: (payload) => ipcRenderer.invoke('file:openData', payload),
  setDirty: (dirty) => ipcRenderer.invoke('file:setDirty', dirty),
});
