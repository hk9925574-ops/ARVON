import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  chrome: () => process.versions.chrome,
  electron: () => process.versions.electron,
});

contextBridge.exposeInMainWorld('electronAPI', {
  updateSettings: (settings: any) => ipcRenderer.invoke('update-settings', settings),
  quitApp: () => ipcRenderer.send('quit-app'),
});
