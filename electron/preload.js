/**
 * Electron 预加载脚本
 * 向渲染进程暴露安全的桌面环境信息（不暴露完整 Node）
 */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.versions.electron
});
