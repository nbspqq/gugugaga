const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  // 上报宠物占用的区域，主进程据此决定鼠标是否穿透
  reportRect: (rect) => ipcRenderer.send('pet:rect', rect),
  // 拖拽中 / 菜单打开时锁定可交互状态
  setLock: (value) => ipcRenderer.send('pet:lock', value),
  // 把养成状态同步给主进程，托盘菜单要用
  uiState: (state) => ipcRenderer.send('pet:ui-state', state),
  command: (name) => ipcRenderer.send('pet:command', name),
  // 天气 / 资讯 / 定位，交给主进程去联网
  fetchData: (payload) => ipcRenderer.invoke('pet:data', payload),
  // 桌面图标：列出来、叼进肚子、吐回桌面
  fetchIcons: () => ipcRenderer.invoke('pet:icons'),
  eatIcon: (payload) => ipcRenderer.invoke('pet:eat-icon', payload),
  spitIcon: (payload) => ipcRenderer.invoke('pet:spit-icon', payload),
  onCursor: (handler) => ipcRenderer.on('pet:cursor', (_event, point) => handler(point)),
  onSystem: (handler) => ipcRenderer.on('pet:system', (_event, sample) => handler(sample)),
  onConfig: (handler) => ipcRenderer.on('pet:config', (_event, config) => handler(config)),
  onAction: (handler) => ipcRenderer.on('pet:action', (_event, name) => handler(name))
});
