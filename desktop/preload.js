const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('wlHttp', (url, headers) => ipcRenderer.invoke('wl:http', url, headers));
