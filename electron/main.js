
const { app, BrowserWindow, ipcMain, dialog, globalShortcut, desktopCapturer, screen, protocol } = require('electron');
const fs = require('fs');
const path = require('path');

// Prevent garbage collection
let mainWindow;
let snippetWindow;
// Global buffer to store the latest screenshot in memory (avoiding IPC transfer)
let currentScreenshotBuffer = null;

// Register the custom protocol immediately when ready
app.whenReady().then(() => {
    protocol.handle('app-screenshot', (request) => {
        // URL format: app-screenshot://current?t=123456
        if (currentScreenshotBuffer) {
            return new Response(currentScreenshotBuffer, {
                headers: { 'content-type': 'image/png' }
            });
        }
        return new Response('No image data', { status: 404 });
    });
});

function createWindow() {
  const isDev = !app.isPackaged;
  let iconPath;
  
  if (isDev) {
    iconPath = path.join(__dirname, '../public/icon.png');
  } else {
    iconPath = path.join(__dirname, '../dist/icon.png');
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "GeoDraw Pro",
    icon: iconPath, 
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, 
      webSecurity: false 
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools(); // Optional: Keep DevTools closed by default for cleaner exit testing
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    // CRITICAL FIX: Force the app to quit when the main window is closed.
    // This triggers the 'before-quit' event, setting app.isQuitting = true,
    // which allows the hidden snippetWindow to actually close instead of just hiding.
    app.quit();
  });
}

function createSnippetWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.bounds;

  snippetWindow = new BrowserWindow({
    width, height,
    x: 0, y: 0,
    frame: false,
    show: false, // Keep hidden initially
    transparent: true, 
    backgroundColor: '#00000000', 
    alwaysOnTop: true, 
    skipTaskbar: true,
    resizable: false,
    movable: false,
    enableLargerThanScreen: true,
    hasShadow: false,
    fullscreen: false, 
    focusable: true, // Allow focus
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      backgroundThrottling: false 
    }
  });

  // macOS specific level setting
  if (process.platform === 'darwin') {
      snippetWindow.setAlwaysOnTop(true, 'pop-up-menu'); 
      snippetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }

  const isDev = !app.isPackaged;
  const url = isDev 
      ? 'http://localhost:5173?mode=snippet' 
      : `file://${path.join(__dirname, '../dist/index.html')}?mode=snippet`;
  
  snippetWindow.loadURL(url);

  snippetWindow.on('close', (e) => {
      // Only prevent close if the app is NOT quitting.
      // When app.quit() is called (e.g. from mainWindow closed), app.isQuitting will be true.
      if (!app.isQuitting) {
          e.preventDefault();
          snippetWindow.hide();
          currentScreenshotBuffer = null;
      }
  });
}

app.on('ready', () => {
    console.log('[DEBUG] App is ready, initializing windows...');
    createWindow();
    createSnippetWindow();

    const shortcutKey = 'CommandOrControl+Alt+C';
    console.log(`[DEBUG] Attempting to register shortcut: ${shortcutKey}`);
    
    const ret = globalShortcut.register(shortcutKey, async () => {
        console.log(`[DEBUG] 🚀 Shortcut ${shortcutKey} triggered!`);

        if (!snippetWindow || snippetWindow.isDestroyed()) {
            createSnippetWindow();
        }

        // TOGGLE LOGIC (ESCAPE ROUTE)
        if (snippetWindow.isVisible()) {
            console.log('[DEBUG] Window is visible, hiding (Safety Toggle)...');
            snippetWindow.hide();
            if (mainWindow) mainWindow.focus();
            return;
        }
        
        const display = screen.getPrimaryDisplay();
        const { width, height } = display.bounds;
        const scaleFactor = display.scaleFactor;

        try {
            // Get screen sources
            const sources = await desktopCapturer.getSources({ 
                types: ['screen'], 
                thumbnailSize: { 
                    width: width * scaleFactor, 
                    height: height * scaleFactor 
                } 
            });
            
            const source = sources[0]; 
            
            if (source) {
                // Resize window to match screen exactly
                snippetWindow.setBounds({ x: 0, y: 0, width, height });
                
                // Store buffer in memory
                currentScreenshotBuffer = source.thumbnail.toPNG();
                
                // Notify renderer
                snippetWindow.webContents.send('CAPTURE_SCREEN');
                
                // CRITICAL SEQUENCE:
                snippetWindow.show();
                
                // FORCE MOUSE EVENTS ON
                snippetWindow.setIgnoreMouseEvents(false);
                
                // Delayed focus to ensure it sticks after show/animation
                setTimeout(() => {
                    snippetWindow.focus();
                }, 50);
                
            } else {
                console.error("[DEBUG] ❌ No screen source found.");
            }
        } catch (e) {
            console.error('[DEBUG] ❌ Failed to capture screen:', e);
            if (snippetWindow) snippetWindow.hide();
        }
    });

    if (!ret) {
        console.error('[DEBUG] ❌ globalShortcut registration failed!');
    } else {
        console.log('[DEBUG] ✅ globalShortcut registered successfully');
    }
});

app.on('before-quit', () => {
    app.isQuitting = true;
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// --- IPC Handlers ---

// LOGGING TUNNEL: Prints logs from Renderer directly to your Terminal
ipcMain.on('RENDERER_LOG', (event, message) => {
    console.log(`[SNIPPET_RENDERER] ${message}`);
});

ipcMain.on('CLOSE_SNIPPET', () => {
    console.log('[DEBUG] IPC: CLOSE_SNIPPET received');
    if (snippetWindow) {
        snippetWindow.hide();
        currentScreenshotBuffer = null; 
        if (mainWindow) mainWindow.focus();
    }
});

ipcMain.on('SNIPPET_READY', () => {
   console.log('[DEBUG] Renderer is ready');
});

ipcMain.handle('save-dialog', async (event, data) => {
  if (!mainWindow) return { success: false };
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Project',
    defaultPath: 'project.geo',
    filters: [{ name: 'GeoDraw Project', extensions: ['geo', 'json'] }]
  });
  if (canceled || !filePath) return { success: false };
  try {
    fs.writeFileSync(filePath, data);
    return { success: true, filePath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-dialog', async (event) => {
  if (!mainWindow) return { canceled: true };
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Project',
    properties: ['openFile'],
    filters: [{ name: 'GeoDraw Project', extensions: ['geo', 'json'] }]
  });
  if (canceled || filePaths.length === 0) return { canceled: true };
  try {
    const data = fs.readFileSync(filePaths[0], 'utf-8');
    return { canceled: false, data, filename: path.basename(filePaths[0]) };
  } catch (e) {
    return { canceled: false, error: e.message };
  }
});
