import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';

export async function startShell(): Promise<{ focusMainWindow: () => void }> {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 560,
    title: 'MultiWA',
    backgroundColor: '#111b21',
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/shell.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, spellcheck: false },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(`${process.env.ELECTRON_RENDERER_URL}/shell/index.html`);
  else await win.loadFile(join(__dirname, '../renderer/shell/index.html'));
  app.on('window-all-closed', () => app.quit());
  return {
    focusMainWindow: () => {
      if (win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    },
  };
}
