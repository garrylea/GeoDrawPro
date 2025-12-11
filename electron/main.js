const { app, BrowserWindow } = require('electron');
const path = require('path');

// Prevent garbage collection
let mainWindow;

function createWindow() {
  // Determine icon path based on environment
  // Note: Windows prefers .ico, Linux .png. Electron can often handle SVG used as window icon in some contexts,
  // but for production, you should convert public/icon.svg to icon.png and icon.ico.
  // Here we attempt to use the SVG for the runtime window icon.
  const isDev = !app.isPackaged;
  let iconPath;
  
  if (isDev) {
    iconPath = path.join(__dirname, '../public/icon.svg');
  } else {
    iconPath = path.join(__dirname, '../dist/icon.svg');
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