const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

// Determine if we're in development or production (packaged)
const isDev = !app.isPackaged;

let mainWindow;
let splash;
let serverProcess;

const SERVER_PORT = 3000; // Match the current Express server's port

function createSplashScreen() {
  splash = new BrowserWindow({
    width: 420,
    height: 300,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    backgroundColor: '#0f0f14',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  splash.loadFile(path.join(__dirname, 'splash.html'));
}

// ─── Start the Express Backend ─────────────────────────────────────────────
function startBackendServer() {
  return new Promise((resolve, reject) => {
    // In production, we run the compiled server.cjs
    const serverPath = isDev
      ? path.join(__dirname, '..', 'server.ts')
      : path.join(process.resourcesPath, 'app', 'dist', 'server.cjs');

    // Set environment variables for the server
    const env = {
      ...process.env,
      PORT: SERVER_PORT,
      NODE_ENV: 'production',
      ELECTRON: 'true',
      RESOURCES_PATH: process.resourcesPath,
    };

    if (isDev) {
      // In dev, the server is likely already running via concurrently
      console.log('Running in Dev mode, assuming server is handled by concurrently');
      resolve();
      return;
    }

    console.log('Starting production server at:', serverPath);

    // In production, spawn the compiled server
    // Note: We use the Electron's node via process.execPath or a sidecar approach.
    // electron-builder usually packages the app such that we can use 'node' if it's in the path, 
    // or we can try to use electron's internal node.
    serverProcess = spawn(process.execPath, [serverPath], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: path.dirname(serverPath),
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[Server]', output);
      if (output.includes('Server running') || output.includes('listening')) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[Server Error]', data.toString());
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start server process:', err);
      reject(err);
    });

    // Timeout fallback
    setTimeout(resolve, 15000);
  });
}

// ─── Create the Application Window ─────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'NIFTY 100 AI Predictor',
    backgroundColor: '#0f0f14',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  // Load the app
  if (isDev) {
    // In dev, load from Vite dev server
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built frontend served by Express
    mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
  }

  // Show window when ready (avoids white flash)
  mainWindow.once('ready-to-show', () => {
    if (splash) {
      splash.close();
      splash = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  // Open external links in default browser, not in Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App Lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  createSplashScreen();
  
  try {
    await startBackendServer();
  } catch (err) {
    console.error('Failed to bootstrap backend:', err);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
});
