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
  newMessage: () => ipcRenderer.invoke('file:new'),
  onMenuCommand: (callback) => ipcRenderer.on('menu:command', (_event, command) => callback(command)),
  setFavorites: (list) => ipcRenderer.invoke('settings:setFavorites', list),
  chooseFolder: (kind) => ipcRenderer.invoke('settings:chooseFolder', kind),
  clearFolder: (kind) => ipcRenderer.invoke('settings:clearFolder', kind),
  setTheme: (value) => ipcRenderer.invoke('app:setTheme', value),
  sendMessage: (payload) => ipcRenderer.invoke('mllp:send', payload),
  testConnection: (payload) => ipcRenderer.invoke('mllp:test', payload),
  cancelSend: (requestId) => ipcRenderer.invoke('mllp:cancel', requestId),
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openRepository: () => ipcRenderer.invoke('app:openRepository'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (controls) => ipcRenderer.invoke('settings:save', controls),
  exportMessages: (payload) => ipcRenderer.invoke('file:export', payload),
  onExportProgress: (callback) => ipcRenderer.on('export:progress', (_event, progress) => callback(progress)),
});
