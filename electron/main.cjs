/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow, shell } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');

const PORT = 3210;
let serverProcess = null;

function serverRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app-server')
    : path.join(__dirname, '..', '.next', 'standalone');
}

function startServer() {
  const root = serverRoot();
  const server = path.join(root, 'server.js');
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    HOSTNAME: '127.0.0.1',
    PORT: String(PORT),
    ELECTRON_RUN_AS_NODE: '1',
    MODULAR_RESUME_HR_TEST_BUILD: '1',
  };
  serverProcess = spawn(process.execPath, [server], {
    cwd: root,
    env,
    stdio: 'ignore',
    windowsHide: true,
  });
  serverProcess.on('exit', () => { serverProcess = null; });
}

function waitForServer(timeoutMs = 20000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get(`http://127.0.0.1:${PORT}`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) return reject(new Error('Local app server did not start.'));
        setTimeout(probe, 200);
      });
      req.setTimeout(1000, () => req.destroy());
    };
    probe();
  });
}

async function createWindow() {
  startServer();
  await waitForServer();
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) || /^mailto:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  await win.loadURL(`http://127.0.0.1:${PORT}`);
  win.show();
}

app.whenReady().then(createWindow).catch((error) => {
  console.error(error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});
