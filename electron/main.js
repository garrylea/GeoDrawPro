const { app, BrowserWindow, ipcMain, dialog, globalShortcut, desktopCapturer, screen, protocol, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

// Global references
let mainWindows = new Set(); // Support multiple windows
let snippetWindow = null;
let solverWindow = null; 
let currentScreenshotBuffer = null;
let fileToOpen = null;

// Handle File Association (macOS)
app.on('will-finish-launching', () => {
    app.on('open-file', (event, path) => {
        event.preventDefault();
        fileToOpen = path;
        const activeWindow = Array.from(mainWindows)[0];
        if (activeWindow && !activeWindow.isDestroyed()) {
             activeWindow.webContents.send('OPEN_FILE_FROM_OS', path);
             if (activeWindow.isMinimized()) activeWindow.restore();
             activeWindow.focus();
        } else {
            createWindow(path);
        }
    });
});

// Single Instance Lock REMOVED to allow multiple instances

// Logging helper
function log(msg, window) {
    const text = `[MainProcess] ${msg}`;
    console.log(text); 
    if (window && !window.isDestroyed()) {
        window.webContents.send('MAIN_PROCESS_LOG', text); 
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

    // Create Dock Menu for macOS
    if (process.platform === 'darwin') {
        const dockMenu = Menu.buildFromTemplate([
            {
                label: 'New Window',
                click() { createWindow(); }
            }
        ]);
        app.dock.setMenu(dockMenu);
    }
});

function createWindow(existingFilePath = null) {
  const isDev = !app.isPackaged;
  const iconPath = path.join(__dirname, '..', 'public', 'icon.png');

  let win = new BrowserWindow({
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

  mainWindows.add(win);

  // State flags per window
  win.forceClose = false;
  win.isCloseCheckPending = false;

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.once('ready-to-show', () => {
    win.maximize(); // Fill the screen (excluding OS bars)
    win.show();
    if (process.platform === 'darwin') {
      app.dock.show();
    }
    win.focus();

    const fileToUse = existingFilePath || fileToOpen;
    if (fileToUse) {
        win.webContents.send('OPEN_FILE_FROM_OS', fileToUse);
        if (!existingFilePath) fileToOpen = null;
    } 
    else if (process.platform !== 'darwin' && process.argv.length >= 2) {
        const filePath = process.argv.find(arg => arg.endsWith('.geo') || arg.endsWith('.json'));
        if (filePath) {
            win.webContents.send('OPEN_FILE_FROM_OS', filePath);
        }
    }
  });

  win.on('close', (e) => {
    log(`'close' event triggered. forceClose=${win.forceClose}, checkPending=${win.isCloseCheckPending}`, win);
    
    if (win.forceClose) return; 
    
    e.preventDefault();
    if (win.isCloseCheckPending) return;

    win.isCloseCheckPending = true;
    win.webContents.send('CHECK_UNSAVED');
  });

  win.on('closed', () => {
    mainWindows.delete(win);
    if (mainWindows.size === 0) {
        app.quit();
    }
  });

  return win;
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
            const activeWin = Array.from(mainWindows)[0];
            if (activeWin) activeWin.focus();
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
    app.quit();
});

app.on('activate', () => {
  if (mainWindows.size === 0) {
    createWindow();
  } else {
    const activeWin = Array.from(mainWindows)[0];
    if (activeWin) activeWin.show();
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
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (!senderWin) return { success: false };

    const pngIcons = icons.map(icon => ({
        size: icon.size,
        buffer: Buffer.from(icon.base64, 'base64')
    }));

    const extension = format;
    const { canceled, filePath } = await dialog.showSaveDialog(senderWin, {
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
        } else if (format === 'png') {
            outputBuffer = pngIcons[0].buffer;
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
        const activeWin = Array.from(mainWindows)[0];
        if (activeWin) activeWin.focus();
    }
});

ipcMain.on('OPEN_SOLVER', () => { createSolverWindow(); });

// --- UNSAVED CHANGES LOGIC ---

ipcMain.on('UNSAVED_CHECK_RESULT', async (event, isDirty) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (!senderWin) return;

    if (!isDirty) {
        senderWin.forceClose = true;
        senderWin.isCloseCheckPending = false; 
        senderWin.close();
        return;
    }

    const choice = await dialog.showMessageBox(senderWin, {
        type: 'question',
        buttons: ['Save', "Don't Save", 'Cancel'],
        title: 'Unsaved Changes',
        message: 'Do you want to save changes before closing?',
        defaultId: 0,
        cancelId: 2
    });
    
    senderWin.isCloseCheckPending = false;

    if (choice.response === 0) { 
        senderWin.webContents.send('ACTION_SAVE');
    } 
    else if (choice.response === 1) { 
        senderWin.destroy();
    } 
});

ipcMain.on('SAVE_COMPLETE', (event) => {
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (senderWin) senderWin.destroy();
});

ipcMain.handle('save-dialog', async (event, data) => {
  const senderWin = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePath } = await dialog.showSaveDialog(senderWin, {
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
  const senderWin = BrowserWindow.fromWebContents(event.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(senderWin, {
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
