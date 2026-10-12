// Desktop shell (Linux + Windows). Loads the live Windy List site.
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const SITE_URL = process.env.WINDYLIST_URL || 'https://windylist.pl';
const SITE_HOST = new URL(SITE_URL).host;

function isInternal(url) {
  try { return new URL(url).host === SITE_HOST; } catch { return false; }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 420, minHeight: 600,
    backgroundColor: '#121218',
    title: 'Windy List',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  win.loadURL(SITE_URL);

  // Keep the site in-app; send everything else to the system browser.
  // (reCAPTCHA/Discord frames are subframes and unaffected.)
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternal(url)) return { action: 'allow' };
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isInternal(url)) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
  // Offline / server down -> friendly retry page.
  win.webContents.on('did-fail-load', (_e, code, _d, _u, isMain) => {
    if (isMain && code !== -3) win.loadFile(path.join(__dirname, '..', 'www', 'offline.html'));
  });
}

const lock = app.requestSingleInstanceLock();
if (!lock) app.quit();
else {
  app.on('second-instance', () => {
    const [w] = BrowserWindow.getAllWindows();
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
