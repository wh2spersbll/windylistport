// Desktop shell (Linux + Windows). Runs the bundled Windy List app UI (www/) which reads data from the site's API.
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const CHROME_VER = process.versions.chrome;
app.userAgentFallback = `Mozilla/5.0 (${process.platform === 'win32' ? 'Windows NT 10.0; Win64; x64' : 'X11; Linux x86_64'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VER} Safari/537.36`;
app.commandLine.appendSwitch('ozone-platform-hint', 'auto');

function createWindow() {
  const win = new BrowserWindow({
    width: 520, height: 900, minWidth: 360, minHeight: 560,
    backgroundColor: '#000000',
    title: 'Windy List',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));

  // Anything that isn't the bundled app opens in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url); }
  });
  // F12 / Ctrl+Shift+I toggles the developer console (for debugging).
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
