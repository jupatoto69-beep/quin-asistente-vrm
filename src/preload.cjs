const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assistant', {
  ready: () => ipcRenderer.invoke('assistant:ready'),
  chat: (text) => ipcRenderer.invoke('assistant:chat', text),
  onReplyChunk: (callback) => ipcRenderer.on('assistant:reply-chunk', (_event, chunk) => callback(chunk)),
  speak: (text) => ipcRenderer.invoke('assistant:speak', text),
  transcribe: (wav) => ipcRenderer.invoke('assistant:transcribe', wav),
  microphone: (requested) => ipcRenderer.invoke('assistant:microphone', requested),
  getVoice: () => ipcRenderer.invoke('preferences:get-voice'),
  setVoice: (enabled) => ipcRenderer.invoke('preferences:set-voice', enabled),
  hasAvatar: () => ipcRenderer.invoke('preferences:has-avatar'),
  saveAvatar: (data) => ipcRenderer.invoke('preferences:save-avatar', data),
  resetAvatar: () => ipcRenderer.invoke('preferences:reset-avatar'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  close: () => ipcRenderer.invoke('window:close'),
  passThrough: () => ipcRenderer.invoke('window:pass-through'),
  onPassThrough: (callback) => ipcRenderer.on('window:pass-through', (_event, enabled) => callback(enabled)),
});
