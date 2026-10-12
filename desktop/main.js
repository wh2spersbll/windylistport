// Desktop shell (Linux + Windows). Loads the live Windy List site.
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const SITE_URL = process.env.WINDYLIST_URL || 'https://windylist.pl';
const SITE_HOST = new URL(SITE_URL).host;

function isInternal(url) {
  try { return new URL(url).host === SITE_HOST; } catch { return false; }
}

// Present as a normal Chrome browser: some hosts serve bot-check/blank pages to "Electron" user agents.
const CHROME_VER = process.versions.chrome;
const UA = `Mozilla/5.0 (${process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VER} Safari/537.36`;
app.userAgentFallback = UA;
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');

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
  win.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => {
    if (isMain && code !== -3) {
      win.loadFile(path.join(__dirname, '..', 'www', 'offline.html'),
        { query: { code: String(code), desc: String(desc), url: String(url) } });
    }
  });
  // If the page loads but is blank/blocked, press F12 / Ctrl+Shift+I to open the console.
  win.webContents.on('before-input-event', (_e, i) => {
    if (i.type === 'keyDown' && (i.key === 'F12' || (i.control && i.shift && i.key.toUpperCase() === 'I')))
      win.webContents.toggleDevTools();
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
