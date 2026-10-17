// 桌面图标的读写：列出桌上有什么、估算图标在屏幕上的位置、把文件叼进肚子和吐回桌面。
// 这一层不碰 Electron，方便单独测。
const fs = require('fs');
const path = require('path');

const BELLY_NAME = '咕嘎的肚子';

// 系统自己的缩略图配置文件，还有 unix 习惯的点开头文件，都不吃
const SKIP_NAMES = ['desktop.ini'];

// Windows 桌面默认自动排列，图标一格一格地填：先从上往下填满一列，再往右一列。
// 注册表里的 ItemPos 经常是空的（自动排列时不写），所以这里只求大致位置，够宠物走过去就行。
const CELL_W = 76;
const CELL_H = 82;
const PAD_X = 22;
const PAD_Y = 14;

const collator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

function isHiddenName(name) {
  if (SKIP_NAMES.indexOf(name.toLowerCase()) >= 0) return true;
  if (name.charAt(0) === '.') return true;
  return name === BELLY_NAME;
}

function kindOf(full) {
  try {
    return fs.statSync(full).isDirectory() ? 'dir' : 'file';
  } catch (err) {
    return null; // 读不到的（断掉的快捷方式之类）就当它不存在
  }
}

// 传几个桌面目录就扫几个，用户桌面和公共桌面会合成一份按名字排（和资源管理器一致）
function listIcons(dirs) {
  const items = [];

  for (const dir of dirs) {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch (err) {
      continue;
    }

    for (const name of names) {
      if (isHiddenName(name)) continue;
      const full = path.join(dir, name);
      const kind = kindOf(full);
      if (!kind) continue;
      items.push({ name: name, path: full, dir: dir, kind: kind });
    }
  }

  items.sort((a, b) => collator.compare(a.name, b.name));
  return items;
}

// 把列表摆到格子上。坐标是窗口坐标——窗口正好盖住工作区，所以左上角就是原点。
function layout(items, area) {
  const rows = Math.max(1, Math.floor((area.height - PAD_Y * 2) / CELL_H));
  const placed = [];

  for (let i = 0; i < items.length; i += 1) {
    const col = Math.floor(i / rows);
    const row = i % rows;
    placed.push({
      name: items[i].name,
      path: items[i].path,
      kind: items[i].kind,
      x: PAD_X + col * CELL_W + CELL_W / 2,
      y: PAD_Y + row * CELL_H + CELL_H / 2
    });
  }

  return placed;
}

// 存在的桌面目录才算数，没装公共桌面的机器上就只有一个
function desktopDirs(userDesktop, publicDesktop) {
  const dirs = [];
  const candidates = [userDesktop, publicDesktop];

  for (const dir of candidates) {
    if (!dir) continue;
    if (dirs.indexOf(dir) >= 0) continue;
    try {
      if (fs.statSync(dir).isDirectory()) dirs.push(dir);
    } catch (err) {
      // 没有就算了
    }
  }

  return dirs;
}

// 重名就往后面加个 (2)(3)，不覆盖肚子里的旧东西
function uniquePath(dir, name) {
  const ext = path.extname(name);
  const base = path.basename(name, ext);
  let candidate = path.join(dir, name);
  let n = 2;

  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, base + ' (' + n + ')' + ext);
    n += 1;
  }

  return candidate;
}

function move(from, to) {
  try {
    fs.renameSync(from, to);
    return null;
  } catch (err) {
    if (err.code !== 'EXDEV') return err;
  }

  // 跨盘时 rename 不行，只能先复制过去再删原文件
  try {
    fs.copyFileSync(from, to);
    fs.unlinkSync(from);
    return null;
  } catch (err) {
    return err;
  }
}

function readReason(err) {
  if (err.code === 'ENOENT') return '这东西已经不在了';
  if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') return '被别的程序占着，吃不动';
  if (err.code === 'ENOTEMPTY') return '里面还有东西，搬不动';
  return '没搬动（' + (err.code || err.message) + '）';
}

function eat(filePath, bellyDir) {
  const name = path.basename(filePath);

  try {
    fs.mkdirSync(bellyDir, { recursive: true });
  } catch (err) {
    return { ok: false, error: '建不了肚子文件夹' };
  }

  const to = uniquePath(bellyDir, name);
  const err = move(filePath, to);
  if (err) return { ok: false, error: readReason(err) };

  return { ok: true, name: name, from: filePath, to: to };
}

function spit(name, bellyDir, desktopDir) {
  const from = path.join(bellyDir, name);

  try {
    fs.mkdirSync(desktopDir, { recursive: true });
  } catch (err) {
    return { ok: false, error: '找不到桌面' };
  }

  if (!fs.existsSync(from)) return { ok: false, error: '肚子里没这个' };

  const to = uniquePath(desktopDir, name);
  const err = move(from, to);
  if (err) return { ok: false, error: readReason(err) };

  return { ok: true, name: name, to: to };
}

module.exports = {
  BELLY_NAME,
  desktopDirs,
  listIcons,
  layout,
  eat,
  spit,
  uniquePath
};
