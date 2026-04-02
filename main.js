'use strict';
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// ── ウィンドウ作成 ──────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: process.env.KIOSK === '1',  // KIOSK=1 で全画面起動
    backgroundColor: '#0C1221',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // セキュリティ必須
      nodeIntegration: false,   // セキュリティ必須
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'station.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// ── CPU サンプリング（100ms 2回測定） ──────────────────────────
function getCpuSample() {
  return os.cpus().map(c => {
    const total = Object.values(c.times).reduce((a, b) => a + b, 0);
    return { total, idle: c.times.idle };
  });
}

// ── システムメトリクス取得 IPC ─────────────────────────────────
ipcMain.handle('get-metrics', async () => {
  const s1 = getCpuSample();
  await new Promise(r => setTimeout(r, 100));
  const s2 = getCpuSample();

  const cpuPct = s1.reduce((sum, c1, i) => {
    const c2 = s2[i];
    const dIdle  = c2.idle  - c1.idle;
    const dTotal = c2.total - c1.total;
    return sum + (dTotal > 0 ? (1 - dIdle / dTotal) * 100 : 0);
  }, 0) / s1.length;

  const mem   = os.freemem();
  const total = os.totalmem();

  let disk = null;
  try {
    const dfOut = execSync('df -B1 / 2>/dev/null', { timeout: 2000 }).toString();
    const parts = dfOut.trim().split('\n')[1].split(/\s+/);
    disk = {
      total_gb: Math.round(parseInt(parts[1]) / 1e9 * 10) / 10,
      used_gb:  Math.round(parseInt(parts[2]) / 1e9 * 10) / 10,
      use_pct:  Math.round(parseInt(parts[2]) / parseInt(parts[1]) * 100),
    };
  } catch (_) {}

  return {
    ok: true,
    hostname:     os.hostname(),
    uptime_s:     Math.floor(os.uptime()),
    cpu_pct:      Math.round(cpuPct),
    cpu_count:    os.cpus().length,
    load_avg:     os.loadavg().map(l => Math.round(l * 100) / 100),
    mem_used_mb:  Math.round((total - mem) / 1024 / 1024),
    mem_total_mb: Math.round(total / 1024 / 1024),
    disk,
    active_sessions: 0,
    node_version: process.version,
    platform:     os.platform(),
    timestamp:    new Date().toISOString(),
  };
});

// ── サービス死活チェック IPC ───────────────────────────────────
ipcMain.handle('check-service', async (_event, url) => {
  const t0 = Date.now();
  try {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const r     = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    clearTimeout(timer);
    return { ok: true, status: r.status, latency_ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, error: e.message, latency_ms: Date.now() - t0 };
  }
});
