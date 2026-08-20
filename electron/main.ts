import { app, BrowserWindow, session, Tray, Menu, globalShortcut, ipcMain, nativeImage } from 'electron';
import * as path from 'path';
import { spawn, ChildProcess } from 'child_process';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let backendProcess: ChildProcess | null = null;

const isDev = process.env.NODE_ENV !== 'production';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    minWidth: 400,
    minHeight: 500,
    show: false, // Don't show immediately
    titleBarStyle: 'hidden', // Modern frameless look
    titleBarOverlay: {
      color: '#0e121a',
      symbolColor: '#ffffff',
      height: 40
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Automatically grant microphone permissions
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media');
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return permission === 'media';
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // Open DevTools in Dev mode
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../frontend/dist/index.html'));
  }

  mainWindow.on('ready-to-show', () => {
    // Only show if we didn't start hidden (e.g. at system boot)
    const args = process.argv;
    if (!args.includes('--hidden')) {
      mainWindow?.show();
    }
  });

  // Intercept close event to minimize to tray instead
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
    return false;
  });
}

function createTray() {
  // Try to load a real icon later; use an empty nativeImage for now if missing
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  // For safety if icon doesn't exist, use an empty image
  const icon = nativeImage.createEmpty();
  
  tray = new Tray(icon);
  tray.setToolTip('ARVON Desktop Assistant');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Open ARVON', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Quit', click: () => {
      isQuitting = true;
      app.quit();
    }}
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow?.hide();
    } else {
      mainWindow?.show();
    }
  });
}

function registerHotkeys(shortcut: string) {
  globalShortcut.unregisterAll();
  try {
    globalShortcut.register(shortcut, () => {
      if (mainWindow?.isVisible()) {
        mainWindow?.hide();
      } else {
        mainWindow?.show();
        mainWindow?.focus();
      }
    });
  } catch (err) {
    console.error('Failed to register shortcut:', err);
  }
}

function startBackend() {
  if (isDev) {
    // In dev, we use concurrently in package.json
    return;
  }
  
  // In production, we must spawn the packaged backend
  // Assuming backend is transpiled into backend/dist/index.js
  const backendEntry = path.join(__dirname, '../../backend/dist/index.js');
  
  backendProcess = spawn('node', [backendEntry], {
    stdio: 'inherit',
    cwd: path.join(__dirname, '../../backend') // Ensure correct cwd for Piper
  });

  backendProcess.on('error', (err) => {
    console.error('Failed to start backend:', err);
  });
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
  createTray();
  registerHotkeys('CommandOrControl+Space');

  // IPC Listeners
  ipcMain.handle('update-settings', (event, settings) => {
    // Handle startup
    if (settings.startWithWindows !== undefined) {
      app.setLoginItemSettings({
        openAtLogin: settings.startWithWindows,
        args: ['--hidden'] // Tell the app to start minimized to tray
      });
    }
    // Handle hotkey
    if (settings.globalHotkey) {
      registerHotkeys(settings.globalHotkey);
    }
    return true;
  });

  ipcMain.on('quit-app', () => {
    isQuitting = true;
    app.quit();
  });

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (backendProcess) {
    backendProcess.kill();
  }
});
