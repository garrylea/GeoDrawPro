
const { app, BrowserWindow, ipcMain, dialog, globalShortcut, desktopCapturer, screen, protocol } = require('electron');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

// Global references
let mainWindow = null;
let snippetWindow = null;
let solverWindow = null; 
let currentScreenshotBuffer = null;
let fileToOpen = null;

// Handle File Association (macOS)
app.on('will-finish-launching', () => {
    app.on('open-file', (event, path) => {
        event.preventDefault();
        fileToOpen = path;
        if (mainWindow && !mainWindow.isDestroyed()) {
             mainWindow.webContents.send('OPEN_FILE_FROM_OS', path);
             if (mainWindow.isMinimized()) mainWindow.restore();
             mainWindow.focus();
        }
    });
});

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Someone tried to run a second instance, we should focus our window.
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            
            // Windows: File path is usually the last argument
            const filePath = commandLine.find(arg => arg.endsWith('.geo') || arg.endsWith('.json'));
            if (filePath) {
                 mainWindow.webContents.send('OPEN_FILE_FROM_OS', filePath);
            }
        }
    });
}


// Logging helper to print to Terminal AND Renderer Console
function log(msg) {
    const text = `[MainProcess] ${msg}`;
    console.log(text); // Terminal
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('MAIN_PROCESS_LOG', text); // Renderer DevTools
    }
}

app.whenReady().then(() => {
    protocol.handle('app-screenshot', (request) => {
        if (currentScreenshotBuffer) {
            return new Response(currentScreenshotBuffer, {
                headers: { 
                    'content-type': 'image/png',
                    'Access-Control-Allow-Origin': '*' 
                }
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
    width: 1400,
    height: 1000,
    title: "GeoDraw Pro",
    icon: iconPath, 
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, 
      webSecurity: false,
      additionalArguments: [`--api-key=${process.env.API_KEY || ''}`]
    },
  });

  // State flags
  mainWindow.forceClose = false;
  mainWindow.isCloseCheckPending = false;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (process.platform === 'darwin') {
      app.dock.show();
      app.focus({ steal: true });
    }
    mainWindow.focus();

    // Handle initial file open (macOS)
    if (fileToOpen) {
        mainWindow.webContents.send('OPEN_FILE_FROM_OS', fileToOpen);
        fileToOpen = null;
    } 
    // Handle initial file open (Windows/Linux)
    else if (process.platform !== 'darwin' && process.argv.length >= 2) {
        const filePath = process.argv.find(arg => arg.endsWith('.geo') || arg.endsWith('.json'));
        if (filePath) {
            mainWindow.webContents.send('OPEN_FILE_FROM_OS', filePath);
        }
    }
  });

  // --- CLOSE EVENT INTERCEPTION ---
  mainWindow.on('close', (e) => {
    log(`'close' event triggered. forceClose=${mainWindow.forceClose}, checkPending=${mainWindow.isCloseCheckPending}`);
    
    // 1. If we are forced to close (e.g. after Save), allow it.
    if (mainWindow.forceClose) {
        log('forceClose is TRUE. Allowing close.');
        return; 
    }
    
    // 2. Prevent default close to check for unsaved changes
    e.preventDefault();
    log('Default close prevented. Checking unsaved changes...');

    // 3. Avoid duplicate checks
    if (mainWindow.isCloseCheckPending) {
        log('Check is already pending. Ignoring.');
        return;
    }

    // 4. Send check to Renderer
    mainWindow.isCloseCheckPending = true;
    log('Sending CHECK_UNSAVED to renderer...');
    mainWindow.webContents.send('CHECK_UNSAVED');
  });

  mainWindow.on('closed', () => {
    log('Window closed.');
    mainWindow = null;
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
    show: false,
    transparent: true, 
    backgroundColor: '#00000000', 
    alwaysOnTop: true, 
    skipTaskbar: true,
    resizable: false,
    movable: false,
    enableLargerThanScreen: true,
    hasShadow: false,
    fullscreen: false, 
    focusable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false,
      backgroundThrottling: false 
    }
  });

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
      if (!app.isQuitting) {
          e.preventDefault();
          snippetWindow.hide();
          currentScreenshotBuffer = null;
      }
  });
}

function createSolverWindow() {
    if (solverWindow && !solverWindow.isDestroyed()) {
        solverWindow.show();
        solverWindow.focus();
        return;
    }

    solverWindow = new BrowserWindow({
        width: 500,
        height: 700,
        title: "Math Solver (Teacher Mode)",
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        }
    });

    const isDev = !app.isPackaged;
    const url = isDev 
        ? 'http://localhost:5173?mode=solver' 
        : `file://${path.join(__dirname, '../dist/index.html')}?mode=solver`;
    
    solverWindow.loadURL(url);

    solverWindow.on('closed', () => {
        solverWindow = null;
    });
}

app.on('ready', () => {
    createWindow();
    createSnippetWindow();

    if (process.platform === 'darwin') {
        app.dock.show();
        app.focus({ steal: true });
    } else {
        app.focus();
    }

    const snippetShortcut = 'CommandOrControl+Alt+C';
    globalShortcut.register(snippetShortcut, async () => {
        if (!snippetWindow || snippetWindow.isDestroyed()) createSnippetWindow();
        if (snippetWindow.isVisible()) {
            snippetWindow.hide();
            if (mainWindow) mainWindow.focus();
            return;
        }
        const display = screen.getPrimaryDisplay();
        const { width, height } = display.bounds;
        const scaleFactor = display.scaleFactor;
        try {
            const sources = await desktopCapturer.getSources({ 
                types: ['screen'], 
                thumbnailSize: { 
                    width: width * scaleFactor, 
                    height: height * scaleFactor 
                } 
            });
            const source = sources[0]; 
            if (source) {
                snippetWindow.setBounds({ x: 0, y: 0, width, height });
                currentScreenshotBuffer = source.thumbnail.toPNG();
                snippetWindow.webContents.send('CAPTURE_SCREEN');
                snippetWindow.show();
                snippetWindow.setIgnoreMouseEvents(false);
                setTimeout(() => { snippetWindow.focus(); }, 50);
            }
        } catch (e) {
            console.error(e);
            if (snippetWindow) snippetWindow.hide();
        }
    });

    const solverShortcut = 'CommandOrControl+Alt+Shift+M';
    globalShortcut.register(solverShortcut, () => {
        createSolverWindow();
    });
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
  } else {
    mainWindow.show();
  }
});

// --- ICO/ICNS Packaging Logic ---

function createIco(pngIcons) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // Reserved
    header.writeUInt16LE(1, 2); // Type (1 = ICO)
    header.writeUInt16LE(pngIcons.length, 4);

    const directories = [];
    const dataBlocks = [];
    let currentOffset = 6 + (16 * pngIcons.length);

    pngIcons.forEach(({ size, buffer }) => {
        const dir = Buffer.alloc(16);
        dir.writeUInt8(size >= 256 ? 0 : size, 0);
        dir.writeUInt8(size >= 256 ? 0 : size, 1);
        dir.writeUInt8(0, 2); // Color count
        dir.writeUInt8(0, 3); // Reserved
        dir.writeUInt16LE(1, 4); // Planes
        dir.writeUInt16LE(32, 6); // BPP
        dir.writeUInt32LE(buffer.length, 8);
        dir.writeUInt32LE(currentOffset, 12);
        
        directories.push(dir);
        dataBlocks.push(buffer);
        currentOffset += buffer.length;
    });

    return Buffer.concat([header, ...directories, ...dataBlocks]);
}

function createIcns(pngIcons) {
    // Map size to ICNS type identifiers
    const ICNS_TYPES = {
        16: 'icp4', 32: 'icp5', 64: 'icp6', 128: 'ic07', 
        256: 'ic08', 512: 'ic09', 1024: 'ic10'
    };

    const blocks = [];
    let totalSize = 8; // Header size ('icns' + length)

    pngIcons.forEach(({ size, buffer }) => {
        const typeId = ICNS_TYPES[size];
        if (!typeId) return;

        const blockHeader = Buffer.alloc(8);
        blockHeader.write(typeId, 0, 4, 'ascii');
        blockHeader.writeUInt32BE(buffer.length + 8, 4);
        
        blocks.push(blockHeader);
        blocks.push(buffer);
        totalSize += (buffer.length + 8);
    });

    const fileHeader = Buffer.alloc(8);
    fileHeader.write('icns', 0, 4, 'ascii');
    fileHeader.writeUInt32BE(totalSize, 4);

    return Buffer.concat([fileHeader, ...blocks]);
}

// --- IPC Handlers ---

ipcMain.handle('EXPORT_APP_ICON', async (event, { format, icons }) => {
    if (!mainWindow) return { success: false };

    const pngIcons = icons.map(icon => ({
        size: icon.size,
        buffer: Buffer.from(icon.base64, 'base64')
    }));

    const extension = format;
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: `Export ${format.toUpperCase()} Icon`,
        defaultPath: `app-icon.${extension}`,
        filters: [{ name: `${format.toUpperCase()} Icon`, extensions: [extension] }]
    });

    if (canceled || !filePath) return { success: false };

    try {
        let outputBuffer;
        if (format === 'ico') {
            outputBuffer = createIco(pngIcons);
        } else if (format === 'icns') {
            outputBuffer = createIcns(pngIcons);
        } else {
            throw new Error("Unsupported format");
        }

        fs.writeFileSync(filePath, outputBuffer);
        return { success: true };
    } catch (e) {
        console.error(e);
        return { success: false, error: e.message };
    }
});

ipcMain.on('RENDERER_LOG', (event, message) => {
    console.log(`[RENDERER] ${message}`);
});

ipcMain.on('CLOSE_SNIPPET', () => {
    if (snippetWindow) {
        snippetWindow.hide();
        currentScreenshotBuffer = null; 
        if (mainWindow) mainWindow.focus();
    }
});

ipcMain.on('OPEN_SOLVER', () => { createSolverWindow(); });

// --- UNSAVED CHANGES LOGIC ---

ipcMain.on('UNSAVED_CHECK_RESULT', async (event, isDirty) => {
    if (!mainWindow) return;

    log(`UNSAVED_CHECK_RESULT received. isDirty=${isDirty}`);

    // If no changes, standard close
    if (!isDirty) {
        log('No changes. Force closing.');
        mainWindow.forceClose = true;
        mainWindow.isCloseCheckPending = false; 
        mainWindow.close();
        return;
    }

    // Show Dialog
    log('Showing Dialog...');
    const choice = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['Save', "Don't Save", 'Cancel'],
        title: 'Unsaved Changes',
        message: 'Do you want to save changes before closing?',
        defaultId: 0,
        cancelId: 2
    });
    
    log(`Dialog User Choice: ${choice.response} (0=Save, 1=Don't, 2=Cancel)`);

    // Reset pending flag
    mainWindow.isCloseCheckPending = false;

    if (choice.response === 0) { 
        // === SAVE ===
        log('User chose SAVE. Sending ACTION_SAVE.');
        mainWindow.webContents.send('ACTION_SAVE');
        // We wait for SAVE_COMPLETE
    } 
    else if (choice.response === 1) { 
        // === DON'T SAVE ===
        log('User chose DON\'T SAVE. DESTROYING WINDOW.');
        // Using destroy() bypasses the close event loop completely
        mainWindow.destroy();
    } 
    else { 
        // === CANCEL ===
        log('User chose CANCEL. Staying in app.');
        // Do nothing. Window stays open.
    }
});

ipcMain.on('SAVE_COMPLETE', (event) => {
    if (!mainWindow) return;
    log('SAVE_COMPLETE received. Destroying window.');
    // Using destroy() ensures we exit without triggering any more checks
    mainWindow.destroy();
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
