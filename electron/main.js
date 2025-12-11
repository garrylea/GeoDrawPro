
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

// Prevent garbage collection
let mainWindow;

function createWindow() {
  // Determine icon path based on environment
  // We prefer .png for Windows/Linux taskbars. 
  // Ensure you have placed the generated 'icon.png' in the 'public' folder.
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
    icon: iconPath, // Set the window icon
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simple migration. In production, use preload scripts.
      webSecurity: false // Optional: helps with loading local resources in some cases
    },
  });

  if (isDev) {
    // In development, load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    // Open DevTools automatically in dev
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built index.html
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// IPC Handlers for Native File Dialogs
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
    console.error('Failed to save file:', e);
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
    console.error('Failed to open file:', e);
    return { canceled: false, error: e.message };
  }
});

app.on('ready', createWindow);

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
