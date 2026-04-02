'use strict';
// preload.js — renderer と main の安全な橋渡し
// contextIsolation: true のため、Node.js API は直接使えない。
// ここで明示的に許可した関数だけが renderer から呼べる。
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // システムメトリクスを取得（/api/health の代替）
  getMetrics: () => ipcRenderer.invoke('get-metrics'),

  // サービス URL の死活チェック（/api/check?url=... の代替）
  checkService: (url) => ipcRenderer.invoke('check-service', url),
});
