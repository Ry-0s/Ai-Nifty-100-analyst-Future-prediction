const { app, BrowserWindow, shell, dialog, utilityProcess, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

// Determine if we're in development or production (packaged)
const isDev = !app.isPackaged;

let mainWindow;
let splash;
let serverProcess;

const SERVER_PORT = 3388; // Unique port for the app to avoid conflicts

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
    const appPath = app.getAppPath();
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

    if (!isDev && !fs.existsSync(serverPath)) {
        const msg = `Critical Error: Server file not found at ${serverPath}. The application might have been installed incorrectly.`;
        console.error(msg);
        dialog.showErrorBox('Backend Launch Failure', msg);
        reject(new Error('Server missing'));
        return;
    }

    // In production, spawn the compiled server
    serverProcess = utilityProcess.fork(serverPath, [], {
      env,
      stdio: 'pipe',
      cwd: isDev ? process.cwd() : app.getAppPath(),
    });

    serverProcess.on('spawn', () => {
      console.log('Backend process spawned successfully.');
      // Short delay to give it time to bind to port
      setTimeout(resolve, 2000);
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
      if (errOutput.includes('Server running') || errOutput.includes('listening')) {
        resolve();
      }
    });

    serverProcess.on('exit', (code) => {
      console.log('Backend process exited with code:', code);
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start server process:', err);
      reject(err);
    });

    // Timeout fallback (longer than the spawn resolve)
    setTimeout(resolve, 10000);
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
  const loadURL = () => {
    // CRITICAL: Prevent crash if the app is closed while the timeout is running
    if (!mainWindow) return; 

    mainWindow.loadURL(`http://127.0.0.1:${SERVER_PORT}`).catch(err => {
      console.error('Initial load failed, will retry in 3s...', err);
      
      // CRITICAL: Force the window to show immediately so the user isn't stuck with an invisible RAM-eating process
      if (mainWindow && !mainWindow.isVisible()) {
          mainWindow.show();
      }

      mainWindow?.webContents?.executeJavaScript(`
        document.body.innerHTML = \`
          <div style='display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;color:white;font-family:sans-serif;background:#0f0f14;text-align:center;padding:20px;'>
            <div style='width:64px;height:64px;border:3px solid #ef4444;border-radius:50%;display:flex;align-items:center;justify-content:center;margin-bottom:24px;border-top-color:transparent;animation:spin 1s linear infinite;'>
               <span style='font-size:24px;font-weight:bold;'>!</span>
            </div>
            <h2 style='color:#ef4444;margin:0 0 8px 0;font-size:24px;'>Backend Server Not Reachable</h2>
            <p style='color:#a1a1aa;margin:0 0 24px 0;max-width:400px;line-height:1.5;'>
              The AI Prediction Engine (Local Server) is taking longer than expected to start. This happens during first run or if a firewall is blocking the connection.
            </p>
            <div style='display:flex;gap:12px;'>
                <button onclick='window.location.reload()' style='background:#ef4444;color:white;border:none;padding:10px 24px;border-radius:8px;font-weight:bold;cursor:pointer;transition:transform 0.1s active;'>
                   Retry Now
                </button>
                <button onclick='alert("Diagnostics:\\nPort: ${SERVER_PORT}\\nHost: 127.0.0.1\\nError: " + JSON.stringify(${JSON.stringify(err.message)}))' style='background:#27272a;color:#a1a1aa;border:none;padding:10px 24px;border-radius:8px;font-weight:bold;cursor:pointer;'>
                   See Info
                </button>
            </div>
            <p style='margin-top:24px;font-size:11px;color:#3f3f46;font-family:monospace;'>Retrying automatically in 5 seconds...</p>
            <style>
              @keyframes spin { to { transform: rotate(360deg); } }
              button:active { transform: scale(0.96); }
            </style>
          </div>
        \`;
      `).catch(() => {});
      
      // Safely loop
      setTimeout(() => {
        if (mainWindow) loadURL();
      }, 5000);
    });
  };

  if (isDev) {
    // In dev, load from Vite dev server
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built frontend served by Express
    loadURL();

    // Helpful for debugging production "black screen" issues
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
      console.error('Page failed to load:', errorCode, errorDescription, validatedURL);
      // If it's a connection error, retry
      if (errorCode === -102 || errorCode === -105 || errorCode === -300) {
        setTimeout(loadURL, 3000);
      }
    });

    // If we've been on a black screen for too long, force a reload
    setTimeout(() => {
      if (mainWindow && !mainWindow.webContents.isLoading() && mainWindow.isVisible()) {
          // Check if we actually loaded something
          mainWindow.webContents.executeJavaScript('window.document.body.innerText').then(text => {
              if (!text || text.trim().length === 0) {
                  console.log('Detected empty screen, forcing reload...');
                  loadURL();
              }
          }).catch(() => {
              console.log('App not responsive, forcing reload...');
              loadURL();
          });
      }
    }, 10000);
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

  // Diagnostic shortcut to open DevTools in production
  globalShortcut.register('CommandOrControl+Shift+I', () => {
    if (mainWindow) {
        mainWindow.webContents.openDevTools();
    }
  });
  
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

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
