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
    // When using asarUnpack, files are in .unpacked folder
    let appPath = app.getAppPath();
    if (appPath.endsWith('.asar')) {
      appPath = appPath + '.unpacked';
    }
    
    const serverPath = isDev
      ? path.join(__dirname, '..', 'server.ts')
      : path.join(appPath, 'dist', 'server.cjs');

    // Set environment variables for the server
    const env = {
      ...process.env,
      PORT: SERVER_PORT,
      NODE_ENV: 'production',
      ELECTRON: 'true',
      RESOURCES_PATH: process.resourcesPath,
      ELECTRON_RUN_AS_NODE: '1', // CRITICAL: Tells Electron to act like Node.js for this process
    };

    if (isDev) {
      // In dev, the server is likely already running via concurrently
      console.log('Running in Dev mode, assuming server is handled by concurrently');
      resolve();
      return;
    }

    console.log('Starting production server at:', serverPath);

    // In production, spawn the compiled server
    serverProcess = spawn(process.execPath, [serverPath], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: app.getAppPath(),
    });

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log('[Server]', output);
      if (output.includes('Server running') || output.includes('listening')) {
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      const errOutput = data.toString();
      console.error('[Server Error]', errOutput);
      // Even if there's an error (like a warning), if it's already listening we resolve
      if (errOutput.includes('Server running') || errOutput.includes('listening')) {
        resolve();
      }
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
    mainWindow.loadURL(`http://localhost:${SERVER_PORT}`).catch(err => {
      console.error('Initial load failed, will retry in 2s...', err);
      setTimeout(() => {
        mainWindow.loadURL(`http://localhost:${SERVER_PORT}`);
      }, 2000);
    });

    // Helpful for debugging production "black screen" issues
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Page failed to load:', errorCode, errorDescription);
      if (!isDev) {
        setTimeout(() => mainWindow.loadURL(`http://localhost:${SERVER_PORT}`), 3000);
      }
    });
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
