// const { contextBridge, ipcRenderer } = require('electron');
// const os = require('os');
// const path = require('path');

// contextBridge.exposeInMainWorld('electronAPI', {
//   login: (credentials) => ipcRenderer.invoke('login', credentials),
//   getID: (params) => ipcRenderer.invoke('getID', params),
//   download: (params) => ipcRenderer.invoke('download', params),
//   selectDownloadPath: () => ipcRenderer.invoke('select-download-path'),
//   onLog: (callback) => ipcRenderer.on('log', (event, message) => callback(message))
// });


// contextBridge.exposeInMainWorld('os', {
//   homedir: () => os.homedir()
// });

// contextBridge.exposeInMainWorld('path', {
//   join: (...args) => path.join(...args)
// });

// console.log('Preload script loaded');

const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded'); // 디버깅용

// Renderer 프로세스에서 사용할 API 노출
contextBridge.exposeInMainWorld('electronAPI', {
  login: (credentials) => {
    console.log('electronAPI.login called with:', credentials);
    return ipcRenderer.invoke('login', credentials);
  },
  getID: (params) => {
    console.log('electronAPI.getID called with:', params);
    return ipcRenderer.invoke('getID', params);
  },
  download: (params) => {
    console.log('electronAPI.download called with:', params);
    return ipcRenderer.invoke('download', params);
  },
  selectDownloadPath: () => {
    console.log('electronAPI.selectDownloadPath called');
    return ipcRenderer.invoke('select-download-path');
  },
  onLog: (callback) => ipcRenderer.on('log', (event, message) => callback(message))
});

// Node.js 모듈들도 노출 (기존 코드에서 사용하고 있음)
contextBridge.exposeInMainWorld('os', {
  homedir: () => require('os').homedir()
});

contextBridge.exposeInMainWorld('path', {
  join: (...args) => require('path').join(...args)
});

console.log('Context bridge APIs exposed'); // 디버깅용