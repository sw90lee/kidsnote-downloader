const { contextBridge, ipcRenderer } = require('electron');
const os = require('os');
const path = require('path');

contextBridge.exposeInMainWorld('electronAPI', {
  login: (credentials) => ipcRenderer.invoke('login', credentials),
  getID: (params) => ipcRenderer.invoke('getID', params),
  download: (params) => ipcRenderer.invoke('download', params),
  selectDownloadPath: () => ipcRenderer.invoke('select-download-path'),
  onLog: (callback) => ipcRenderer.on('log', (event, message) => callback(message))
});


contextBridge.exposeInMainWorld('os', {
  homedir: () => os.homedir()
});

contextBridge.exposeInMainWorld('path', {
  join: (...args) => path.join(...args)
});

console.log('Preload script loaded');