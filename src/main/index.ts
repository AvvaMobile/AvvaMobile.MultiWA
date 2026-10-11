import { app, BrowserWindow, nativeImage } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { startShell } from './app/ShellApp';

const APP_NAME = 'MultiWA';
app.setName(APP_NAME);
// Windows groups taskbar entries and attributes notifications by this id.
if (process.platform === 'win32') app.setAppUserModelId('com.avvamobile.multiwa');
// Profile (accounts, WhatsApp sessions, logs) lives in appData/AvvaMobile.MultiWA; MULTIWA_USER_DATA selects another one.
app.setPath('userData', process.env.MULTIWA_USER_DATA || join(app.getPath('appData'), 'AvvaMobile.MultiWA'));

// Global hardening for every webContents (local and remote).
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (e) => e.preventDefault());
});

// One instance per profile: a second launch focuses the running one instead of opening the same partitions twice.
if (!app.requestSingleInstanceLock()) app.exit(0);
let focusMainWindow: (() => void) | null = null;
app.on('second-instance', () => {
  if (focusMainWindow) return focusMainWindow();
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
});
process.on('SIGTERM', () => app.quit());

app.whenReady().then(async () => {
  const icon = join(__dirname, '../../build/icon.png');
  if (process.platform === 'darwin' && existsSync(icon)) app.dock?.setIcon(nativeImage.createFromPath(icon));
  ({ focusMainWindow } = await startShell());
});
