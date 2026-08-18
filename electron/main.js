/**
 * Electron 主进程 · 漫剧工坊桌面版
 * 桌面应用自启内置后端（同一数据库），局域网内手机/PWA 连本机 IP 即可数据互通
 */
const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

let mainWindow = null;
let serverProc = null;

// 后端服务端口（可通过环境变量覆盖）
const PORT = process.env.PORT || 8765;

/**
 * 启动内置 Node 后端
 * 通过 spawn 一个独立的 server 进程，确保 Express + sql.js + ws 正常加载
 */
function startServer() {
  const { spawn } = require('child_process');
  const serverPath = path.join(__dirname, '..', 'server.js');
  serverProc = spawn(process.execPath, [serverPath], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  serverProc.stdout.on('data', d => process.stdout.write(`[server] ${d}`));
  serverProc.stderr.on('data', d => process.stderr.write(`[server] ${d}`));
  serverProc.on('exit', code => console.log(`后端进程退出 code=${code}`));
}

/** 等待后端就绪 */
async function waitServer(maxTry = 40) {
  const http = require('http');
  for (let i = 0; i < maxTry; i++) {
    const ok = await new Promise(res => {
      const r = http.get(`http://127.0.0.1:${PORT}/api/health`, { timeout: 1000 }, x => res(x.statusCode === 200));
      r.on('error', () => res(false));
      r.on('timeout', () => { r.destroy(); res(false); });
    });
    if (ok) return true;
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: 'AI 漫剧工坊',
    backgroundColor: '#faf6ef',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 加载本地应用
  await waitServer();
  mainWindow.loadURL(`http://127.0.0.1:${PORT}/`);

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// 极简菜单
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const tpl = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

app.whenReady().then(async () => {
  startServer();
  buildMenu();
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProc) { serverProc.kill(); serverProc = null; }
});
