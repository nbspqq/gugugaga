const { app, BrowserWindow, Menu, Tray, nativeImage, screen, ipcMain } = require('electron');
const path = require('path');
const { createMonitor } = require('./system-monitor');
const { createService, CITIES, CHANNELS } = require('./net-service');
const icons = require('./desktop-icons');

// 光标轮询间隔：同时用于「眼睛跟随」和「点击穿透」的命中判定
const CURSOR_TICK = 16;

// 系统状态采样间隔，以及算平均值用的窗口长度（约 30 秒）
const monitor = createMonitor({ interval: 1500, windowSize: 20 });

// 天气 / 资讯都走这里，结果在服务里缓存
const net = createService({ timeout: 9000 });

let win = null;
let tray = null;
let cursorTimer = null;

let petRect = null; // 宠物在窗口内占据的区域 { x, y, w, h }
let interactive = false; // 窗口当前是否接收鼠标事件
let locked = false; // 拖拽中或菜单打开时，强制保持可交互
let paused = false; // 暂停自动活动
let uiState = {
  follow: false,
  sleeping: false,
  pomodoro: false,
  swing: false,
  watchSystem: true,
  eatAuto: false,
  water: true,
  hourly: true,
  weather: true,
  news: false
};

function createWindow() {
  const area = screen.getPrimaryDisplay().workArea;

  win = new BrowserWindow({
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // 窗口永远不拿焦点，被系统当成后台窗口的话动画会被降频，荡秋千就会一顿一顿
      backgroundThrottling: false
    }
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  interactive = false;

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  // 城市列表和资讯频道放在主进程，启动时下发一份给界面用
  win.webContents.on('did-finish-load', () => {
    if (!win || win.isDestroyed()) return;
    win.webContents.send('pet:config', { cities: CITIES, channels: CHANNELS });
  });
  win.once('ready-to-show', () => {
    win.showInactive();
    startCursorWatch();
    startSystemWatch();
  });
  win.on('closed', () => {
    win = null;
  });
}

// 整窗默认穿透，只有光标落在宠物身上时才接收事件
function applyInteractive(next) {
  if (!win || win.isDestroyed() || next === interactive) return;
  interactive = next;
  win.setIgnoreMouseEvents(!next, { forward: true });
}

function insidePet(x, y) {
  return (
    x >= petRect.x &&
    x <= petRect.x + petRect.w &&
    y >= petRect.y &&
    y <= petRect.y + petRect.h
  );
}

function startCursorWatch() {
  if (cursorTimer) return;
  let lastX = null;
  let lastY = null;

  cursorTimer = setInterval(() => {
    if (!win || win.isDestroyed() || !win.isVisible()) return;

    const cursor = screen.getCursorScreenPoint();
    const bounds = win.getBounds();
    const x = cursor.x - bounds.x;
    const y = cursor.y - bounds.y;

    // 鼠标没动就不用发，省下来的 IPC 留给动画
    if (x !== lastX || y !== lastY) {
      lastX = x;
      lastY = y;
      win.webContents.send('pet:cursor', { x, y });
    }

    if (!locked) {
      applyInteractive(Boolean(petRect) && insidePet(x, y));
    }
  }, CURSOR_TICK);
}

function showPet() {
  if (!win || win.isDestroyed()) return;
  win.showInactive();
}

// ---------- CPU / 内存 ----------

function pushSystemSample(sample) {
  if (!win || win.isDestroyed() || !win.isVisible()) return;
  win.webContents.send('pet:system', sample);
}

function startSystemWatch() {
  monitor.start(pushSystemSample);
}

function hidePet() {
  if (!win || win.isDestroyed()) return;
  win.hide();
}

function togglePet() {
  if (!win || win.isDestroyed()) return;
  if (win.isVisible()) hidePet();
  else showPet();
  buildTrayMenu();
}

function sendAction(name) {
  if (!win || win.isDestroyed()) return;
  if (!win.isVisible()) showPet();
  win.webContents.send('pet:action', name);
}

// 托盘只放开关和常驻功能；跟它玩的动作都在宠物右键菜单里
function buildTrayMenu() {
  if (!tray) return;

  const menu = Menu.buildFromTemplate([
    {
      label: '显示宠物',
      type: 'checkbox',
      checked: Boolean(win && !win.isDestroyed() && win.isVisible()),
      click: togglePet
    },
    { type: 'separator' },
    {
      label: '跟着鼠标走',
      type: 'checkbox',
      checked: uiState.follow,
      click: () => sendAction('toggle-follow')
    },
    {
      // 挂在鼠标上时右键够不着它，关不掉，所以托盘里必须留一个开关
      label: '挂在鼠标上荡秋千',
      type: 'checkbox',
      checked: uiState.swing,
      click: () => sendAction('swing')
    },
    {
      label: uiState.pomodoro ? '结束专注' : '开始专注 25 分钟',
      click: () => sendAction('pomodoro')
    },
    { type: 'separator' },
    {
      label: '每日天气简报',
      type: 'checkbox',
      checked: uiState.weather,
      click: () => sendAction('toggle-weather')
    },
    {
      label: '定时念新闻',
      type: 'checkbox',
      checked: uiState.news,
      click: () => sendAction('toggle-news')
    },
    {
      label: '喝水提醒',
      type: 'checkbox',
      checked: uiState.water,
      click: () => sendAction('toggle-water')
    },
    {
      label: '整点报时',
      type: 'checkbox',
      checked: uiState.hourly,
      click: () => sendAction('toggle-hourly')
    },
    {
      label: '关注电脑状态',
      type: 'checkbox',
      checked: uiState.watchSystem,
      click: () => sendAction('toggle-watch-system')
    },
    {
      label: '饿了自己啃桌面',
      type: 'checkbox',
      checked: uiState.eatAuto,
      click: () => sendAction('toggle-eat-auto')
    },
    { type: 'separator' },
    {
      label: '暂停自动活动',
      type: 'checkbox',
      checked: paused,
      click: (item) => {
        paused = item.checked;
        sendAction(paused ? 'pause-on' : 'pause-off');
      }
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ]);

  tray.setContextMenu(menu);
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('咕嘎 · 桌面宠物');
  tray.on('double-click', togglePet);
  buildTrayMenu();
}

// ---------- 天气 / 资讯 ----------
// 渲染进程的 CSP 不允许发外部请求，所有联网都从这里走
ipcMain.handle('pet:data', async (_event, payload) => {
  const ask = payload || {};
  try {
    if (ask.kind === 'weather') {
      const sample = await net.getWeather(ask.city, ask.coords);
      return { ok: true, data: Object.assign({}, sample, { text: net.describe(sample) }) };
    }
    if (ask.kind === 'news') {
      return { ok: true, data: await net.getNews(ask.channel) };
    }
    if (ask.kind === 'locate') {
      const here = await net.locate();
      if (!here) return { ok: false, error: '没认出你在哪' };
      return { ok: true, data: here };
    }
    return { ok: false, error: '不认识这种请求' };
  } catch (err) {
    return { ok: false, error: err.message || '取数据失败了' };
  }
});

// ---------- 桌面图标 ----------
// 吃掉的都进「我的文档\咕嘎的肚子」，只是搬走不删除，随时能吐回桌面

function desktopDirs() {
  const home = app.getPath('home');
  const pub = process.env.PUBLIC || 'C:\\Users\\Public';
  return icons.desktopDirs(path.join(home, 'Desktop'), path.join(pub, 'Desktop'));
}

function bellyDir() {
  return path.join(app.getPath('documents'), icons.BELLY_NAME);
}

ipcMain.handle('pet:icons', async () => {
  const area = screen.getPrimaryDisplay().workArea;
  const dirs = desktopDirs();
  return {
    ok: true,
    data: {
      icons: icons.layout(icons.listIcons(dirs), area),
      belly: icons.listIcons([bellyDir()]),
      bellyPath: bellyDir(),
      desktopDir: dirs[0] || ''
    }
  };
});

ipcMain.handle('pet:eat-icon', async (_event, payload) => {
  const ask = payload || {};
  if (!ask.path) return { ok: false, error: '不知道要吃哪个' };

  // 只认刚刚列出来的那些路径，免得界面把别的地方的东西递进来
  const allowed = icons.listIcons(desktopDirs());
  let found = null;
  for (const item of allowed) {
    if (item.path === ask.path) {
      found = item;
      break;
    }
  }
  if (!found) return { ok: false, error: '这东西已经不在桌面上了' };

  return icons.eat(found.path, bellyDir());
});

ipcMain.handle('pet:spit-icon', async (_event, payload) => {
  const ask = payload || {};
  if (!ask.name) return { ok: false, error: '不知道要吐哪个' };
  if (ask.name.indexOf('/') >= 0 || ask.name.indexOf('\\') >= 0) {
    return { ok: false, error: '名字不对' };
  }

  const dirs = desktopDirs();
  if (!dirs.length) return { ok: false, error: '找不到桌面' };
  return icons.spit(ask.name, bellyDir(), dirs[0]);
});

ipcMain.on('pet:rect', (_event, rect) => {
  if (rect && typeof rect.x === 'number') petRect = rect;
});

ipcMain.on('pet:lock', (_event, value) => {
  locked = Boolean(value);
  if (locked) applyInteractive(true);
});

ipcMain.on('pet:ui-state', (_event, next) => {
  if (!next) return;
  uiState = {
    follow: Boolean(next.follow),
    sleeping: Boolean(next.sleeping),
    pomodoro: Boolean(next.pomodoro),
    swing: Boolean(next.swing),
    watchSystem: Boolean(next.watchSystem),
    eatAuto: Boolean(next.eatAuto),
    water: Boolean(next.water),
    hourly: Boolean(next.hourly),
    weather: Boolean(next.weather),
    news: Boolean(next.news)
  };
  buildTrayMenu();
});

ipcMain.on('pet:command', (_event, name) => {
  if (name === 'hide') {
    hidePet();
    buildTrayMenu();
    return;
  }
  if (name === 'quit') {
    app.quit();
  }
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', showPet);

  app.whenReady().then(() => {
    createWindow();
    createTray();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    if (cursorTimer) {
      clearInterval(cursorTimer);
      cursorTimer = null;
    }
    monitor.stop();
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });
}
