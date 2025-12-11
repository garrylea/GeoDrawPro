const { app, BrowserWindow } = require('electron');
const path = require('path');

// Prevent garbage collection
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "GeoDraw Pro",
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simple migration. In production, use preload scripts.
      webSecurity: false // Optional: helps with loading local resources in some cases
    },
  });

  // Check if we are in development mode
  const isDev = !app.isPackaged;

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