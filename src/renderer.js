const api = window.pet;

// 一套服装 = 一组对齐好的姿势帧。加新造型只要往这里加一条，帧文件用同名前缀。
const OUTFITS = [
  {
    id: 'penguin',
    name: '企鹅黑',
    frames: {
      idle: '../assets/pet-penguin-open.png', // 手臂举起 · 睁眼
      idleBlink: '../assets/pet-penguin-blink.png', // 手臂举起 · 闭眼
      walk: '../assets/pet-penguin-walk.png', // 手臂放下 · 睁眼
      walkBlink: '../assets/pet-penguin-walk-blink.png', // 手臂放下 · 闭眼
      wink: '../assets/pet-penguin-wink.png' // 俏皮眨眼，打招呼时用
    }
  }
];

// 通用台词，等级台词在 game.js 的 TIERS 里
const LINES = ['陪我玩会儿嘛~', '你今天好忙呀…', '窗外的天好好看', '你在忙什么呀'];

const HIT_WIDTH = 142; // 可交互区域贴合身体外轮廓，透明边角不挡鼠标
const PET_TOP = 90;
const PET_BOTTOM = 94;
const BUBBLE_EXTRA = 66;
const WALK_SPEED = 88; // px/s
const EAT_SPEED = 420; // 去啃桌面图标的时候跑快点，不然横跨屏幕要二十秒
const FOLLOW_SPEED = 120; // 跟随鼠标时快一点
const FOLLOW_GAP = 150; // 跟到这个距离就停下，不贴脸
const FOLLOW_HYSTERESIS = 70; // 进出跟随的间距差，防止临界距离反复切姿势
const ACCEL = 340; // px/s²
const DECEL = 520;
const IDLE_SLEEP_MS = 45000;
const BLINK_MS = 115;
const LEAN_RANGE = 4; // 朝光标倾斜的最大位移
const EYE_OFFSET = 58; // 脸在盒子中心下方的位置，用来算倾斜方向
const HOVER_HALF_W = 80; // 悬停判定用矩形，跟宠物盒子对齐（用圆形的话头顶反而够不着）
const HOVER_HALF_H = 102;
const FOOT_TOP = 8; // 状态面板只认脚部：相对盒子中心往下这一段才算
const FOOT_BOTTOM = 122; // 下界往外放一点，站在屏幕底部时也够得着
const HOVER_PET_MS = 900; // 停多久算摸头
const PANEL_DELAY_MS = 180; // 悬停多久弹出状态面板，防手滑闪过
const PET_HALF = 100; // 宠物盒半高，用来把面板放到头顶

// 荡秋千：宠物吊在光标底下，绳子拴在脑袋上
const SWING_LEN = 132; // 绳子默认长度（光标到身体中心的距离）
const SWING_GRIP = 76; // 手抓着的位置离身体中心多远，绳子画到这儿就够
const SWING_G = 2400; // 重力加速度，决定摆动的快慢
const SWING_DAMP = 0.995; // 每帧的阻尼，不衰减就会一直晃下去
const SWING_ACC_MAX = 5000; // 光标加速度上限，免得抖一下就把它甩出去
const SWING_MAX = 1.05; // 最大摆角（弧度），约 60°
const SWING_AMP = 0.8; // 自己蹬腿最多蹬到这个摆幅（弧度），约 46°
// 摆到 SWING_AMP 对应的机械能就不蹬了。只看角速度不行——在中间位置补力的话会越荡越过
const SWING_ENERGY = (SWING_G / SWING_LEN) * (1 - Math.cos(SWING_AMP));
const SWING_PUMP = 3.2; // 自己蹬腿的力度
const SWING_MS = 120000; // 荡这么久就松手，免得一直挂在鼠标上没法操作
// 支点不直接用光标，而是用弹簧追着光标走。光标是 16ms 采一次的台阶信号，
// 直接当支点的话，绳子末端会一格一格地跳
const SWING_FOLLOW = 2500; // 弹簧刚度，越大跟得越紧
const SWING_DRAG = 2 * Math.sqrt(SWING_FOLLOW) * 0.9; // 接近临界阻尼，别来回弹
const SWING_STEP = 1 / 120; // 积分步长，掉帧时也要小步补

// 物理：拖拽甩出去后滑行一段，不做重力下落（不然松手就往屏幕底下掉）
const AIR = 0.9;
const WALL_BOUNCE = 0.45;
const MAX_THROW = 2400;
const REST_SPEED = 30;

const el = {
  pet: document.getElementById('pet'),
  body: document.getElementById('pet-body'),
  anim: document.getElementById('pet-anim'),
  tilt: document.getElementById('pet-tilt'),
  lean: document.getElementById('pet-lean'),
  layers: [document.getElementById('pet-img-a'), document.getElementById('pet-img-b')],
  propBack: document.getElementById('prop-back'),
  propFront: document.getElementById('prop-front'),
  bubble: document.getElementById('bubble'),
  timer: document.getElementById('timer'),
  zzz: document.getElementById('zzz'),
  rope: document.getElementById('rope'),
  ropeLine: document.getElementById('rope-line'),
  ropeGrip: document.getElementById('rope-grip'),
  menu: document.getElementById('menu'),
  panel: document.getElementById('panel'),
  game: document.getElementById('game'),
  picker: document.getElementById('picker'),
  pickerTitle: document.getElementById('picker-title'),
  pickerList: document.getElementById('picker-list'),
  pickerFoot: document.getElementById('picker-foot'),
  choice: document.getElementById('choice'),
  choiceOk: document.getElementById('choice-ok'),
  choiceCancel: document.getElementById('choice-cancel'),
  rpsPet: document.getElementById('rps-pet'),
  rpsYou: document.getElementById('rps-you'),
  rpsResult: document.getElementById('rps-result'),
  rpsScore: document.getElementById('rps-score'),
  tierName: document.getElementById('tier-name'),
  wxLine: document.getElementById('wx-line'),
  cityList: document.getElementById('city-list'),
  channelList: document.getElementById('channel-list'),
  swingItem: document.querySelector('#menu [data-toggle="swing"]'),
  bars: {
    food: document.getElementById('bar-food'),
    mood: document.getElementById('bar-mood'),
    energy: document.getElementById('bar-energy'),
    bond: document.getElementById('bar-bond'),
    cpu: document.getElementById('bar-cpu'),
    mem: document.getElementById('bar-mem')
  },
  nums: {
    food: document.getElementById('num-food'),
    mood: document.getElementById('num-mood'),
    energy: document.getElementById('num-energy'),
    bond: document.getElementById('num-bond'),
    cpu: document.getElementById('num-cpu'),
    mem: document.getElementById('num-mem')
  },
  panelFoot: document.getElementById('panel-foot')
};

const state = {
  x: 0,
  y: 0,
  target: null,
  pose: 'idle', // idle（手臂举起）/ walk（手臂放下）
  eyes: 'open', // open / closed
  expression: null, // 临时表情覆盖，例如 wink
  frame: null,
  front: 0, // 当前显示的是哪一层精灵图
  action: 'idle',
  speed: 0, // 当前移动速度，靠加减速平滑过渡
  dirX: 0,
  dirY: -1,
  following: false, // 是否正在追光标（带迟滞，避免临界距离反复切帧）
  stuck: 0,
  onArrive: null, // 走到目标后的回调，活动系统要用
  poseHold: null, // 活动期间钉住的姿势（钓鱼/吃饭时手要放下）
  sleeping: false,
  dragging: false,
  dragged: 0,
  dragOffset: { x: 0, y: 0 },
  dragFrom: { x: 0, y: 0 },
  dragTrack: [],
  phys: { vx: 0, vy: 0, active: false },
  // 挂在鼠标上荡秋千：theta 是绳子偏离垂直方向的角度，正数表示宠物在光标右边
  swing: {
    on: false,
    theta: 0,
    w: 0,
    pivot: { x: 0, y: 0, vx: 0, vy: 0 }, // 绳子另一头，也就是弹簧跟出来的支点
    ax: 0,
    ay: 0,
    acc: 0, // 还没积掉的时间
    until: 0,
    said: 0
  },
  // 动态形变：倾斜角度和挤压比例，每帧朝目标值缓动
  tilt: { angle: 0, sx: 1, sy: 1 },
  tiltCss: '',
  fx: { kind: null, t: 0, dur: 0 },
  fidgetAt: 0,
  dragVX: 0,
  leanTarget: { x: 0, y: 0 },
  leanNow: { x: 0, y: 0 },
  leanCss: '',
  menuOpen: false,
  gameOpen: false,
  pickerOpen: false,
  eating: false, // 正在去啃 / 正在啃桌面图标，期间不许它自己安排别的活动
  paused: false,
  outfit: 0,
  lastInteract: Date.now(),
  cursor: { x: 0, y: 0 },
  system: null,
  config: { cities: [], channels: [] },
  weather: null, // 最近一次取到的天气，面板和气泡共用
  newsList: null,
  hoverMs: 0,
  hoverFoot: false, // 光标落在脚上，弹状态面板用
  footMs: 0,
  petted: false,
  panelShown: false,
  dizzyUntil: 0,
  bubbleUntil: 0,
  dirty: true
};

const timers = {
  bubble: null,
  click: null,
  action: null,
  blink: null,
  expression: null,
  anim: null,
  activity: null,
  choice: null,
  walk: null,
  report: 0,
  plan: null,
  saveTick: 0
};

// ---------- 姿势帧 ----------

function frames() {
  return OUTFITS[state.outfit].frames;
}

// idle / idleBlink / wink 都是"手臂举起"，walk / walkBlink 是"手臂放下"
function poseOf(key) {
  return key.indexOf('walk') === 0 ? 'walk' : 'idle';
}

function currentKey() {
  if (state.expression) return state.expression;
  if (state.pose === 'walk') return state.eyes === 'closed' ? 'walkBlink' : 'walk';
  return state.eyes === 'closed' ? 'idleBlink' : 'idle';
}

// 换姿势用两层交叉淡化，换眼睛（只有眼部不同）直接切，眨眼才干脆
function applyFrame() {
  const key = currentKey();
  if (state.frame === key) return;

  const prev = state.frame;
  state.frame = key;

  const next = el.layers[1 - state.front];
  const prevLayer = el.layers[state.front];
  const fade = Boolean(prev) && poseOf(prev) !== poseOf(key);

  next.style.transition = fade ? '' : 'none';
  void next.offsetWidth; // 让 transition 的设置先生效再改 opacity
  next.src = frames()[key];
  next.classList.add('show');
  prevLayer.classList.remove('show');
  state.front = 1 - state.front;
}

function setPose(pose) {
  state.pose = pose;
  applyFrame();
}

function setEyes(eyes) {
  state.eyes = eyes;
  applyFrame();
}

function preloadFrames() {
  Object.values(frames()).forEach((src) => {
    const img = new Image();
    img.src = src;
  });
}

// ---------- 位置与物理 ----------

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function bounds() {
  return {
    minX: 84,
    maxX: Math.max(84, window.innerWidth - 84),
    minY: 108,
    maxY: Math.max(108, window.innerHeight - 120)
  };
}

function moveTo(x, y) {
  const box = bounds();
  const nx = clamp(x, box.minX, box.maxX);
  const ny = clamp(y, box.minY, box.maxY);
  if (nx === state.x && ny === state.y) return;
  state.x = nx;
  state.y = ny;
  state.dirty = true;
}

function render() {
  el.pet.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
  state.dirty = false;
}

function playAnim(name, duration) {
  const node = el.anim;
  node.classList.remove('state-dizzy');
  void node.offsetWidth; // 强制回流，保证动画能重放
  node.classList.add(name);
  if (timers.anim) clearTimeout(timers.anim);
  timers.anim = setTimeout(() => node.classList.remove(name), duration);
}

function throwVelocity() {
  const track = state.dragTrack;
  if (track.length < 2) return null;
  const first = track[0];
  const last = track[track.length - 1];
  const seconds = (last.t - first.t) / 1000;
  if (seconds < 0.01) return null;
  return {
    vx: clamp((last.x - first.x) / seconds, -MAX_THROW, MAX_THROW),
    vy: clamp((last.y - first.y) / seconds, -MAX_THROW, MAX_THROW)
  };
}

function stepPhysics(dt) {
  const p = state.phys;
  if (!p.active) return false;

  const damp = Math.pow(AIR, dt * 60);
  p.vx *= damp;
  p.vy *= damp;

  if (Math.hypot(p.vx, p.vy) < REST_SPEED) {
    p.vx = 0;
    p.vy = 0;
    p.active = false;
    setAction('idle');
    landBounce();
    return false;
  }

  const box = bounds();
  let nx = state.x + p.vx * dt;
  let ny = state.y + p.vy * dt;
  let hitWall = false;

  if (nx < box.minX) {
    nx = box.minX;
    p.vx = Math.abs(p.vx) * WALL_BOUNCE;
    hitWall = true;
  } else if (nx > box.maxX) {
    nx = box.maxX;
    p.vx = -Math.abs(p.vx) * WALL_BOUNCE;
    hitWall = true;
  }

  if (ny < box.minY) {
    ny = box.minY;
    p.vy = Math.abs(p.vy) * WALL_BOUNCE;
    hitWall = true;
  } else if (ny > box.maxY) {
    ny = box.maxY;
    p.vy = -Math.abs(p.vy) * WALL_BOUNCE;
    hitWall = true;
  }

  state.x = nx;
  state.y = ny;
  state.dirty = true;

  if (hitWall && Date.now() > state.dizzyUntil) {
    state.dizzyUntil = Date.now() + 2200;
    playAnim('state-dizzy', 1700);
    landBounce();
    say('哇——撞到啦', 1600);
  }

  return true;
}

// ---------- 动态形变 ----------
// 倾斜、挤压、待机小动作都作用在 #pet-tilt，和 CSS 里的呼吸/跳跃互不干扰

// 曲线返回的是叠加在静止姿态上的增量，p 是进度 0..1，dir 是随机方向
const FIDGETS = {
  tilt: (p, dir) => ({ angle: dir * Math.sin(p * Math.PI) * 8 }),
  shake: (p) => ({ angle: Math.sin(p * Math.PI * 7) * 5 * (1 - p) }),
  stretch: (p) => ({ sx: -0.07 * Math.sin(p * Math.PI), sy: 0.12 * Math.sin(p * Math.PI) }),
  peek: (p, dir) => ({ x: dir * Math.sin(p * Math.PI) * 6 }),
  // 落地：先压扁再回弹，振幅按阻尼衰减
  land: (p) => {
    const k = Math.exp(-5 * p) * Math.cos(p * Math.PI * 3);
    return { sx: 0.16 * k, sy: -0.13 * k };
  }
};

function startFidget() {
  const kinds = ['tilt', 'shake', 'stretch', 'peek'];
  state.fx = {
    kind: kinds[Math.floor(Math.random() * kinds.length)],
    t: 0,
    dur: 0.7,
    dir: Math.random() < 0.5 ? -1 : 1
  };
}

function landBounce() {
  state.fx = { kind: 'land', t: 0, dur: 0.42 };
}

function tiltTarget() {
  if (state.sleeping) return { angle: 0, sx: 1, sy: 1 };

  // 被拎着走：身子甩在移动方向的后面，越快越斜
  if (state.dragging) {
    const v = state.dragVX;
    return {
      angle: clamp(-v / 110, -13, 13),
      sx: 1 - clamp(Math.abs(v) / 22000, 0, 0.035),
      sy: 1 + clamp(Math.abs(v) / 16000, 0, 0.05)
    };
  }

  // 甩出去在桌面上滑：越快越扁
  if (state.phys.active) {
    const p = state.phys;
    const speed = Math.hypot(p.vx, p.vy);
    return {
      angle: clamp(-p.vx / 70, -16, 16),
      sx: 1 + clamp(speed / 7000, 0, 0.1),
      sy: 1 - clamp(speed / 9000, 0, 0.09)
    };
  }

  // 挂在绳子上：身子跟着摆角歪一点，但吊着的东西不会跟绳子一样斜
  if (state.swing.on) return { angle: clamp(-state.swing.theta * 22, -16, 16), sx: 1, sy: 1 };

  if (state.action === 'walk') return { angle: state.dirX * 3.5, sx: 1, sy: 1 };
  return { angle: 0, sx: 1, sy: 1 };
}

function updateTilt(dt) {
  const want = tiltTarget();
  const t = state.tilt;
  const k = 1 - Math.exp(-dt / 0.09);
  t.angle += (want.angle - t.angle) * k;
  t.sx += (want.sx - t.sx) * k;
  t.sy += (want.sy - t.sy) * k;

  let fx = null;
  if (state.fx.kind) {
    state.fx.t += dt;
    const p = state.fx.t / state.fx.dur;
    if (p >= 1) state.fx = { kind: null, t: 0, dur: 0 };
    else fx = FIDGETS[state.fx.kind](p, state.fx.dir);
  }

  const angle = t.angle + (fx && fx.angle ? fx.angle : 0);
  const sx = t.sx + (fx && fx.sx ? fx.sx : 0);
  const sy = t.sy + (fx && fx.sy ? fx.sy : 0);
  const x = fx && fx.x ? fx.x : 0;

  const css = `translate3d(${x.toFixed(2)}px, 0, 0) rotate(${angle.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;
  if (css !== state.tiltCss) {
    state.tiltCss = css;
    el.tilt.style.transform = css;
  }
}

// 眼睛追光标慢半拍，像真的在看
function updateLean(dt) {
  const now = state.leanNow;
  const k = 1 - Math.exp(-dt / 0.06);
  now.x += (state.leanTarget.x - now.x) * k;
  now.y += (state.leanTarget.y - now.y) * k;

  const css = `translate3d(${now.x.toFixed(2)}px, ${now.y.toFixed(2)}px, 0)`;
  if (css !== state.leanCss) {
    state.leanCss = css;
    el.lean.style.transform = css;
  }
}

// 闲着时偶尔动一下，不然只有呼吸太像标本
function maybeFidget(now) {
  if (!state.fidgetAt) state.fidgetAt = now + rand(5000, 11000);
  if (now < state.fidgetAt) return;
  state.fidgetAt = now + rand(8000, 17000);

  if (state.paused || state.sleeping || state.dragging || state.phys.active || state.menuOpen) return;
  if (state.action !== 'idle' || ACTIVITY.current) return;
  startFidget();
}

// ---------- 动作 ----------

function setAction(name, duration) {
  state.action = name;
  el.body.classList.remove('state-walk', 'state-jump', 'state-happy');

  if (name === 'walk') {
    el.body.classList.add('state-walk');
    setPose('walk');
  } else {
    if (name === 'jump') el.body.classList.add('state-jump');
    if (name === 'happy') el.body.classList.add('state-happy');
    if (!state.sleeping && !state.phys.active) setPose(state.poseHold || 'idle');
  }

  if (timers.action) {
    clearTimeout(timers.action);
    timers.action = null;
  }

  if (duration) {
    timers.action = setTimeout(() => {
      timers.action = null;
      if (state.action === name) setAction('idle');
    }, duration);
  }
}

// 重要消息有优先权：没播完之前，自动闲聊不许盖掉它
function say(text, duration = 2400, priority = true) {
  if (!priority && performance.now() < state.bubbleUntil) return;

  el.bubble.textContent = text;
  el.bubble.classList.remove('hidden');
  state.bubbleUntil = performance.now() + duration;
  if (timers.bubble) clearTimeout(timers.bubble);
  timers.bubble = setTimeout(() => el.bubble.classList.add('hidden'), duration);
  reportRect(performance.now(), true);
}

function pickLine() {
  const tierLines = Game.TIERS[Game.tier().index].lines;
  return Game.randomLine(Math.random() < 0.6 ? tierLines : LINES);
}

function spawnHeart() {
  const node = document.createElement('div');
  node.className = 'heart';
  node.textContent = '♥';
  el.pet.appendChild(node);
  setTimeout(() => node.remove(), 1200);
}

// ---------- 眨眼 ----------

function blink(times) {
  if (state.sleeping || state.paused || state.expression || state.eyes === 'closed') return;

  setEyes('closed');
  timers.blink = setTimeout(() => {
    if (state.sleeping) return;
    setEyes('open');
    if (times > 1) timers.blink = setTimeout(() => blink(times - 1), 140);
  }, BLINK_MS);
}

function maybeBlink() {
  if (Math.random() < 0.35) blink(Math.random() < 0.25 ? 2 : 1);
}

// ---------- 状态切换 ----------

function showExpression(name, duration) {
  state.expression = name;
  applyFrame();
  if (timers.expression) clearTimeout(timers.expression);
  timers.expression = setTimeout(() => {
    timers.expression = null;
    state.expression = null;
    applyFrame();
  }, duration);
}

function wake() {
  if (!state.sleeping) return;
  state.sleeping = false;
  el.anim.classList.remove('state-sleep');
  el.zzz.classList.add('hidden');
  setEyes('open');
  setAction('idle');
  refreshWeatherProp();
  pushUiState();
}

function fallAsleep() {
  interrupt();
  state.sleeping = true;
  state.target = null;
  state.speed = 0;
  setAction('idle');
  setPose('idle');
  setEyes('closed');
  el.anim.classList.add('state-sleep');
  el.zzz.classList.remove('hidden');
  clearProps(); // 睡着了就把家伙什收起来
  say(Game.randomLine(Game.TIRED_LINES), 3200);
  pushUiState();
}

function jump() {
  wake();
  setAction('jump', 700);
}

function greet() {
  interrupt();
  wake();
  setAction('happy', 520);
  showExpression('wink', 900);
  say(pickLine());
  state.lastInteract = Date.now();
}

function setPaused(value) {
  state.paused = value;
  if (value) {
    wake();
    state.target = null;
    setAction('idle');
    say('那我先歇会儿~', 2000);
  } else {
    say('我又精神啦！', 2000);
    scheduleNext(1200);
  }
}

// ---------- 玩法动作 ----------

function doFeed(foodId) {
  const res = Game.feed(foodId);
  if (!res.ok) {
    say(res.line, 2200);
    return;
  }
  interrupt();
  wake();
  setAction('happy', 520);
  say(res.line, 2400);
  spawnHeart();
  renderPanel();
  pushUiState();
}

function doPlay() {
  const res = Game.play();
  if (!res.ok) {
    say(res.line, 2400);
    return;
  }
  interrupt();
  wake();
  jump();
  say(res.line, 2600);
  spawnHeart();
  renderPanel();
  pushUiState();
}

function doPetHead() {
  const res = Game.petHead();
  setAction('happy', 520);
  say(res.line, 1500);
  spawnHeart();
}

function doToggle(key) {
  // 荡秋千是个临时的玩法，不写进存档，关掉程序就没了
  if (key === 'swing') {
    toggleSwing();
    syncMenu();
    return;
  }

  const next = !Game.prefs[key];
  Game.setPref(key, next);
  syncMenu();
  if (key === 'follow') say(next ? '我跟着你啦~' : '那不跟了', 1800);
  else if (key === 'water') say(next ? '会提醒你喝水的' : '好，不提醒了', 1800);
  else if (key === 'hourly') say(next ? '整点我会报时' : '不报时了', 1800);
  else if (key === 'watchSystem') say(next ? '我会盯着电脑状态的' : '好，不管电脑了', 1800);
  else if (key === 'weather' && !next) say('好，不报天气了', 1800);
  else if (key === 'news') say(next ? '我会时不时念条新闻' : '好，不念了', 1800);
  else if (key === 'eatAuto') say(next ? '饿了我就自己去桌上叼一个' : '好，不动你桌面了', 2400);
  pushUiState();
}

function togglePomodoro() {
  const p = Game.pomodoro();
  if (p.running) {
    Game.pomodoroStop();
    say('好，先不专注了', 2000);
  } else {
    Game.pomodoroStart('focus');
    jump();
    say('专注 25 分钟，开始！', 2600);
  }
  syncMenu();
  renderTimer();
  pushUiState();
}

// ---------- 养成事件 ----------

function consumeEvents(events) {
  events.forEach((event) => {
    if (event.type === 'hungry') {
      say(Game.randomLine(Game.HUNGRY_LINES), 3000);
    } else if (event.type === 'tired') {
      say(Game.randomLine(Game.TIRED_LINES), 3000);
    } else if (event.type === 'pomodoro-end') {
      jump();
      say(event.mode === 'focus' ? '专注结束，起来活动一下！' : '休息结束，继续加油！', 4200);
      renderTimer();
      syncMenu();
      pushUiState();
    } else if (event.type === 'water') {
      say('喝口水吧，别忘了~', 3400);
    } else if (event.type === 'briefing') {
      // 等开机那句问候说完再报天气
      setTimeout(() => tellWeather(dayGreeting()), 2800);
    } else if (event.type === 'news') {
      tellNews();
    } else if (event.type === 'hour') {
      say(`${event.hour} 点啦`, 2600);
    } else if (event.type === 'bond-up') {
      jump();
      say(`我们现在是${event.tier.name}了！`, 3400);
    }
  });
}

// ---------- 天气与资讯 ----------
// 联网都在主进程做，这里只负责取回来怎么讲。

function dayGreeting() {
  const hour = new Date().getHours();
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

// 还不知道城市就先按出口 IP 猜一个，猜不到就让用户自己选。
// 返回当时的位置快照，免得取天气的时候偏好已经被改掉了。
async function currentCity() {
  if (Game.prefs.city) return { city: Game.prefs.city, coords: Game.prefs.coords };

  const res = await api.fetchData({ kind: 'locate' });
  if (!res.ok || !res.data) return null;

  Game.setLocation(res.data.city, { latitude: res.data.latitude, longitude: res.data.longitude });
  syncMenu();
  return { city: res.data.city, coords: Game.prefs.coords };
}

// 只认最后一次请求：连续换城市的时候，先发的那个结果直接丢掉
let weatherToken = 0;
let newsToken = 0;

async function loadWeather(city, coords) {
  const token = (weatherToken += 1);
  const res = await api.fetchData({ kind: 'weather', city: city, coords: coords });
  if (token !== weatherToken) return null;

  if (!res.ok) return { error: res.error };
  state.weather = res.data;
  renderPanel();
  refreshWeatherProp();
  return res.data;
}

async function loadNews() {
  const token = (newsToken += 1);
  const res = await api.fetchData({ kind: 'news', channel: Game.prefs.newsChannel });
  if (token !== newsToken) return null;

  if (!res.ok) return [];
  state.newsList = res.data;
  return state.newsList;
}

async function tellWeather(greeting) {
  const place = await currentCity();
  if (!place) {
    say('我猜不准你在哪…\n右键选个城市吧', 3600);
    return;
  }

  const first = !state.weather;
  const data = await loadWeather(place.city, place.coords);
  if (!data) return;
  if (data.error) {
    say(`${data.error}…\n过会儿再试试`, 3000);
    return;
  }

  const head = greeting ? `${greeting}！${data.text.title}` : data.text.title;
  say(`${head}\n${data.text.detail}`, 7000);
  if (first) setAction('happy', 520);
}

async function tellNews() {
  const list = state.newsList || (await loadNews());
  if (list === null) return; // 被更新的请求顶掉了，不吭声
  if (!list.length) {
    say('新闻没取回来…\n过会儿再试试', 3000);
    return;
  }
  const item = list[Math.floor(Math.random() * list.length)];
  const points = item.extra ? `${item.extra} ` : '';
  say(points + item.title, 9000);
  setAction('happy', 520);
}

function showWeather() {
  interrupt();
  wake();
  say('让我看看外面…', 1800);
  tellWeather('');
}

function showNews() {
  interrupt();
  wake();
  tellNews();
}

// 开机后悄悄取一次天气：面板一展开就有内容，身上也能挂个应景的小道具
async function autoWeather() {
  if (!Game.prefs.weather) return;

  let data = state.weather;
  if (!data) {
    const place = await currentCity();
    if (!place) return;
    data = await loadWeather(place.city, place.coords);
  }
  if (!data || data.error) return;

  const mood = data.text && data.text.mood;
  const event = mood ? Game.checkWeatherMood(mood, Date.now()) : null;
  if (event) say(event.line, 4200, false);
}

// 换城市 / 重新定位之后清掉缓存，免得还念着旧地方
async function locateCity() {
  Game.setLocation('', null);
  state.weather = null;
  syncMenu();
  say('我找找你在哪…', 2000);
  await tellWeather('');
}

function pickCity(name) {
  Game.setLocation(name, null);
  state.weather = null;
  syncMenu();
  pushUiState();
  tellWeather('');
}

function pickChannel(id) {
  Game.setChannel(id);
  state.newsList = null;
  syncMenu();
  const found = state.config.channels.find((item) => item.id === id);
  say(found ? `换成「${found.name}」了` : '换好了', 2000);
}

function currentActivity() {
  // 打盹按睡觉算，精力恢复得快
  if (state.sleeping || ACTIVITY.stage === 'sleeping') return 'sleep';
  if (state.dragging || state.phys.active || state.speed > 5) return 'walk';
  return 'idle';
}

// ---------- 自主活动 ----------

function scheduleNext(delay) {
  if (timers.plan) clearTimeout(timers.plan);
  const wait = delay || 2600 + Math.random() * 5200;
  timers.plan = setTimeout(plan, wait);
}

// ---------- 宠物自己的生活 ----------
// 行为由内在状态驱动（饿了想找吃的、累了想睡、半夜犯困），不是随机播动画。

const ACTIVITY_NAMES = { wander: '溜达', fish: '钓鱼', eat: '吃东西', nap: '打盹', daze: '发呆' };

const PROP_MARKUP = {
  fishing: `<svg class="prop prop-fishing" viewBox="0 0 132 164" xmlns="http://www.w3.org/2000/svg">
    <path class="rod" d="M 4 152 C 44 114 78 68 104 20" />
    <path class="line" d="M 104 20 C 110 56 110 100 104 126" />
    <ellipse class="water" cx="104" cy="146" rx="24" ry="7" />
    <circle class="float" cx="104" cy="130" r="5" />
  </svg>`,
  bowl: `<svg class="prop prop-bowl" viewBox="0 0 58 42" xmlns="http://www.w3.org/2000/svg">
    <path class="bowl" d="M 6 14 Q 29 44 52 14 Z" />
    <ellipse class="bowl" cx="29" cy="14" rx="23" ry="7" />
    <ellipse class="food" cx="29" cy="14" rx="16" ry="5" />
  </svg>`,
  bed: `<svg class="prop prop-bed" viewBox="0 0 152 98" xmlns="http://www.w3.org/2000/svg">
    <rect class="quilt" x="6" y="16" width="140" height="80" rx="22" />
    <path class="fold" d="M 40 42 Q 52 54 40 68" />
    <path class="fold" d="M 112 42 Q 100 54 112 68" />
    <rect class="hem" x="6" y="16" width="140" height="20" rx="10" />
  </svg>`,
  daze: `<svg class="prop prop-daze" viewBox="0 0 66 26" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="18" r="3.4" />
    <circle cx="33" cy="18" r="3.4" />
    <circle cx="54" cy="18" r="3.4" />
  </svg>`,
  // 天气彩蛋，跟着当前天气挂在身上
  'weather-umbrella': `<svg class="prop prop-umbrella" viewBox="0 0 110 92" xmlns="http://www.w3.org/2000/svg">
    <path class="canopy" d="M 4 40 Q 55 -12 106 40 Q 90 28 74 40 Q 55 25 36 40 Q 20 28 4 40 Z" />
    <path class="shaft" d="M 55 22 L 55 74 Q 55 84 45 84" />
  </svg>`,
  'weather-scarf': `<svg class="prop prop-scarf" viewBox="0 0 92 34" xmlns="http://www.w3.org/2000/svg">
    <path class="scarf" d="M 10 6 Q 46 24 82 6 Q 88 18 82 26 Q 46 42 10 26 Q 4 16 10 6 Z" />
    <path class="scarf-tail" d="M 74 22 L 88 34 L 78 34 L 66 26 Z" />
  </svg>`,
  'weather-fan': `<svg class="prop prop-fan" viewBox="0 0 78 50" xmlns="http://www.w3.org/2000/svg">
    <path class="leaf" d="M 8 46 Q 39 -16 70 46 Z" />
    <path class="rib" d="M 39 46 L 39 6" />
    <path class="rib" d="M 39 46 L 14 32" />
    <path class="rib" d="M 39 46 L 64 32" />
  </svg>`
};

// 挡在宠物身后的道具（鱼竿、雨伞），其余都摆到身前
const BACK_PROPS = { fishing: true, 'weather-umbrella': true };

const ACTIVITY = { current: null, stage: null, rounds: 0 };

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function showProp(name) {
  clearProps();
  (BACK_PROPS[name] ? el.propBack : el.propFront).innerHTML = PROP_MARKUP[name];
}

// 闲下来的时候，把应景的小道具挂上（下雨打伞、冷天围巾、热天扇子）
function refreshWeatherProp() {
  if (ACTIVITY.current || state.sleeping || state.dragging) return;
  const text = state.weather && state.weather.text;
  const mood = text && text.mood;
  if (mood && PROP_MARKUP['weather-' + mood]) showProp('weather-' + mood);
}

function clearProps() {
  el.propBack.innerHTML = '';
  el.propFront.innerHTML = '';
}

function activityAlive(name) {
  return ACTIVITY.current === name;
}

function startActivity(name) {
  stopActivity(true);
  ACTIVITY.current = name;
  ACTIVITY.stage = 'go';
  ACTIVITY.rounds = 0;

  const starters = { wander: startWander, fish: startFish, eat: startEat, nap: startNap, daze: startDaze };
  (starters[name] || startDaze)();
  renderPanel();
}

function stopActivity(silent) {
  if (!ACTIVITY.current) return;
  clearTimeout(timers.activity);
  timers.activity = null;

  ACTIVITY.current = null;
  ACTIVITY.stage = null;
  ACTIVITY.rounds = 0;
  state.onArrive = null;
  state.target = null;
  state.poseHold = null;
  el.anim.classList.remove('state-chew', 'state-nap');
  el.zzz.classList.add('hidden');
  clearProps();
  refreshWeatherProp();
  if (state.eyes === 'closed' && !state.sleeping) setEyes('open');
  setAction('idle');
  renderPanel();

  if (!silent) scheduleNext();
}

// 用户一动手，就不许它再自己玩了
function interrupt() {
  if (!ACTIVITY.current) return;
  stopActivity(true);
  scheduleNext(3000);
}

function walkTo(x, y, onArrive) {
  state.target = { x, y };
  state.onArrive = onArrive;
}

function randomSpot(margin) {
  const box = bounds();
  const gap = margin || 0;
  return { x: rand(box.minX + gap, box.maxX - gap), y: rand(box.minY, box.maxY) };
}

function startWander() {
  const nextLeg = () => {
    if (!activityAlive('wander')) return;
    const spot = randomSpot();
    walkTo(spot.x, spot.y, arrive);
  };
  const arrive = () => {
    if (!activityAlive('wander')) return;
    ACTIVITY.rounds += 1;
    if (ACTIVITY.rounds >= 2 + Math.floor(Math.random() * 2)) {
      say(Game.randomLine(Game.ACTIVITY_LINES.wander), 2000, false);
      stopActivity();
      return;
    }
    nextLeg();
  };
  nextLeg();
}

function startFish() {
  const spot = randomSpot(40);
  walkTo(spot.x, spot.y, () => {
    if (!activityAlive('fish')) return;
    showProp('fishing');
    state.poseHold = 'walk'; // 手放下，像握着竿
    setPose('walk');
    ACTIVITY.stage = 'waiting';
    fishTick(3500 + Math.random() * 5000);
  });
}

function fishTick(delay) {
  timers.activity = setTimeout(() => {
    if (!activityAlive('fish')) return;
    ACTIVITY.rounds += 1;
    if (ACTIVITY.rounds >= 2 && Math.random() < 0.5) {
      fishCaught();
      return;
    }
    if (Math.random() < 0.4) say(Game.randomLine(Game.ACTIVITY_LINES.fishWait), 2200, false);
    fishTick(4000 + Math.random() * 7000);
  }, delay);
}

function fishCaught() {
  ACTIVITY.stage = 'caught';
  clearProps();
  state.poseHold = null;
  jump();
  spawnHeart();
  const result = Game.finishActivity('fish');
  say(Game.randomLine(result.lines), 2800);
  renderPanel();
  timers.activity = setTimeout(() => stopActivity(), 2800);
}

function startEat() {
  const spot = randomSpot(40);
  walkTo(spot.x, spot.y, () => {
    if (!activityAlive('eat')) return;
    showProp('bowl');
    state.poseHold = 'walk';
    setPose('walk');
    el.anim.classList.add('state-chew');
    ACTIVITY.stage = 'eating';

    timers.activity = setTimeout(() => {
      if (!activityAlive('eat')) return;
      el.anim.classList.remove('state-chew');
      clearProps();
      state.poseHold = null;
      const result = Game.finishActivity('eat');
      setAction('happy', 520);
      say(Game.randomLine(result.lines), 2600);
      renderPanel();
      timers.activity = setTimeout(() => stopActivity(), 2400);
    }, 4000 + Math.random() * 3000);
  });
}

function startNap() {
  const spot = randomSpot(40);
  walkTo(spot.x, spot.y, () => {
    if (!activityAlive('nap')) return;
    showProp('bed');
    setPose('idle');
    setEyes('closed');
    el.anim.classList.add('state-nap');
    el.zzz.classList.remove('hidden');
    ACTIVITY.stage = 'sleeping';

    timers.activity = setTimeout(() => {
      if (!activityAlive('nap')) return;
      el.anim.classList.remove('state-nap');
      el.zzz.classList.add('hidden');
      clearProps();
      setEyes('open');
      const result = Game.finishActivity('nap');
      setAction('happy', 520);
      say(Game.randomLine(result.lines), 2600);
      renderPanel();
      timers.activity = setTimeout(() => stopActivity(), 2400);
    }, 18000 + Math.random() * 30000);
  });
}

function startDaze() {
  showProp('daze');
  ACTIVITY.stage = 'dazing';
  state.speed = 0;
  setPose('idle');

  const total = 6000 + Math.random() * 9000;
  timers.activity = setTimeout(() => {
    if (!activityAlive('daze')) return;
    say(Game.randomLine(Game.ACTIVITY_LINES.daze), 2600, false);

    timers.activity = setTimeout(() => {
      if (!activityAlive('daze')) return;
      Game.finishActivity('daze');
      stopActivity();
    }, total * 0.6);
  }, total * 0.4);
}

function plan() {
  timers.plan = null;

  if (state.paused || state.dragging || state.menuOpen || state.pickerOpen || state.eating || state.phys.active || state.swing.on || ACTIVITY.current) {
    scheduleNext(3000);
    return;
  }

  if (state.sleeping) {
    if (Math.random() < 0.25) say(Game.randomLine(Game.TIRED_LINES), 2600, false);
    scheduleNext(5000);
    return;
  }

  if (Date.now() - state.lastInteract > IDLE_SLEEP_MS) {
    fallAsleep();
    scheduleNext(9000);
    return;
  }

  // 跟着鼠标走的时候不自己玩；被盯着看的时候也老实待着
  if (Game.prefs.follow || state.hovering) {
    scheduleNext(3000);
    return;
  }

  startActivity(Game.pickActivity());
}

// ---------- 挂在鼠标上荡秋千 ----------

// 绳子长度：屏幕下边留出脚的位置，不够就收短，别把宠物吊到看不见的地方。
// 光标已经贴到底边时收无可收，只能让它挂在光标上。
// 这里量的是支点而不是光标，不然绳长会跟着光标一格一格地变
function swingLength() {
  const room = window.innerHeight - 118 - state.swing.pivot.y;
  return clamp(room, 40, SWING_LEN);
}

function startSwing() {
  const s = state.swing;
  interrupt();
  wake();
  closeGame();

  s.on = true;
  s.pivot = { x: state.cursor.x, y: state.cursor.y, vx: 0, vy: 0 };
  s.ax = 0;
  s.ay = 0;
  s.acc = 0;
  // 从它现在待着的位置起摆，免得绳子一挂上就把宠物弹到光标正下方
  s.theta = clamp(Math.atan2(state.x - state.cursor.x, state.y - state.cursor.y), -SWING_MAX, SWING_MAX);
  s.w = 0;
  s.until = performance.now() + SWING_MS;
  s.said = 0;

  state.target = null;
  state.following = false;
  state.speed = 0;
  state.phys.active = false;
  state.phys.vx = 0;
  state.phys.vy = 0;
  state.poseHold = null;
  setAction('idle');
  setPose('idle'); // 手举起来，像抓着绳子
  clearProps();
  el.rope.classList.remove('hidden');
  say('抓住你啦，荡一个~', 2600);
  renderPanel();
  pushUiState();
}

function stopSwing(quiet) {
  const s = state.swing;
  if (!s.on) return;

  s.on = false;
  el.rope.classList.add('hidden');
  state.speed = 0;
  setAction('idle');
  moveTo(state.x, state.y); // 万一荡到屏幕外了，顺手拉回来
  renderPanel();
  pushUiState();

  if (!quiet) {
    say('手酸啦，先下来歇会儿~', 2400);
    scheduleNext(3000);
  }
}

function toggleSwing() {
  if (state.swing.on) stopSwing();
  else startSwing();
}

// 摆在当前角度和角速度下的机械能（除以绳长平方化简过的），用来判断还能不能继续蹬
function swingEnergy(s, len) {
  return (0.5 * s.w * s.w) + (SWING_G / len) * (1 - Math.cos(s.theta));
}

// 单摆：支点是光标，宠物吊在下面来回摆。
// 光标甩得越急，喂给摆的加速度越大，它就跟着飞得越高。
function stepSwing(dt) {
  const s = state.swing;
  if (!s.on) return false;

  if (performance.now() > s.until) {
    stopSwing();
    return false;
  }

  // 掉帧时一帧要补一大段，整段一次积分会让摆动忽快忽慢，切成小步慢慢补
  s.acc = Math.min(s.acc + dt, 0.12);
  while (s.acc >= SWING_STEP) {
    integrateSwing(SWING_STEP);
    s.acc -= SWING_STEP;
  }

  const len = swingLength();
  state.x = s.pivot.x + len * Math.sin(s.theta);
  state.y = s.pivot.y + len * Math.cos(s.theta);
  state.dirty = true;

  // 被甩得比自己荡还快的时候它会喊一嗓子
  const now = performance.now();
  if (Math.abs(s.w) > Math.sqrt(2 * SWING_ENERGY) + 0.4 && now - s.said > 7000) {
    s.said = now;
    say('哇——好高！', 1500, false);
  }

  return true;
}

function integrateSwing(h) {
  const s = state.swing;
  const len = swingLength();

  // 支点像挂在橡皮筋上一样追光标：光标突然起步时绳子先绷一下，宠物再跟上去。
  // 支点本身不截断加速度，不然猛地一甩它会跟不上、绳子被拉成一长条；
  // 截断只用在喂给摆的惯性力上
  const p = s.pivot;
  const fx = SWING_FOLLOW * (state.cursor.x - p.x) - SWING_DRAG * p.vx;
  const fy = SWING_FOLLOW * (state.cursor.y - p.y) - SWING_DRAG * p.vy;
  s.ax = clamp(fx, -SWING_ACC_MAX, SWING_ACC_MAX);
  s.ay = clamp(fy, -SWING_ACC_MAX, SWING_ACC_MAX);
  p.vx += fx * h;
  p.vy += fy * h;
  p.x += p.vx * h;
  p.y += p.vy * h;

  // θ'' = -(g·sinθ + aₓ·cosθ - a_y·sinθ) / L
  const acc = -(SWING_G * Math.sin(s.theta) + s.ax * Math.cos(s.theta) - s.ay * Math.sin(s.theta)) / len;
  s.w += acc * h;
  s.w *= Math.pow(SWING_DAMP, h * 60);

  // 摆到底别再硬顶着限位，不然会卡在极限位置好几帧
  const next = s.theta + s.w * h;
  if (next > SWING_MAX) {
    s.theta = SWING_MAX;
    s.w *= -0.35;
  } else if (next < -SWING_MAX) {
    s.theta = -SWING_MAX;
    s.w *= -0.35;
  } else {
    s.theta = next;
  }

  // 鼠标停住的时候它自己蹬腿：在最低点顺着运动方向加力，就越荡越高。
  // 能量够 SWING_ENERGY 就不蹬了，不然会一路荡到撞限位
  if (Math.hypot(p.vx, p.vy) < 120) {
    if (Math.abs(s.w) < 0.05 && Math.abs(s.theta) < 0.03) {
      s.w = 0.6; // 彻底停住了就蹬一脚启动
    } else if (swingEnergy(s, len) < SWING_ENERGY && Math.cos(s.theta) > 0.55) {
      const dir = Math.sign(s.w) || -Math.sign(s.theta) || 1;
      s.w += SWING_PUMP * dir * h;
    }
  }
}

// 绳子画在光标和它手抓的位置之间。支点弹簧落后光标一点，两头不再严格共线，
// 所以按光标到身体的实际方向截一段来画
function drawRope() {
  const s = state.swing;
  const len = swingLength();
  const reach = Math.min(SWING_GRIP, len - 12);
  const dx = state.x - state.cursor.x;
  const dy = state.y - state.cursor.y;
  const d = Math.hypot(dx, dy) || 1;
  const gx = state.x - (dx / d) * reach;
  const gy = state.y - (dy / d) * reach;

  el.ropeLine.setAttribute('d', `M ${state.cursor.x.toFixed(1)} ${state.cursor.y.toFixed(1)} L ${gx.toFixed(1)} ${gy.toFixed(1)}`);
  el.ropeGrip.setAttribute('cx', state.cursor.x.toFixed(1));
  el.ropeGrip.setAttribute('cy', state.cursor.y.toFixed(1));
}

// ---------- 喂它吃桌面图标 ----------
// 被吃掉的文件是搬进「我的文档\咕嘎的肚子」，不是删除，随时能吐回桌面。

let choicePending = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 吃之前先问一句，免得手一滑把东西叼走
function askChoice(text, okLabel, onOk) {
  closeChoice();
  say(text, 30000);
  el.choiceOk.textContent = okLabel;
  el.choice.classList.remove('hidden');
  choicePending = { onOk: onOk };
  api.setLock(true);
  placeCard(el.choice, 'head');

  timers.choice = setTimeout(() => {
    timers.choice = null;
    closeChoice();
  }, 30000);
}

function closeChoice() {
  if (!choicePending) return;
  choicePending = null;
  el.choice.classList.add('hidden');
  el.bubble.classList.add('hidden');
  if (timers.bubble) {
    clearTimeout(timers.bubble);
    timers.bubble = null;
  }
  if (timers.choice) {
    clearTimeout(timers.choice);
    timers.choice = null;
  }
  api.setLock(false);
}

// 走到某个点，到了就 resolve。目标被别的事情清掉时靠超时兜底，绝不把流程挂死
function walkNear(x, y) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (timers.walk) {
        clearTimeout(timers.walk);
        timers.walk = null;
      }
      resolve();
    };
    walkTo(x, y, finish);
    timers.walk = setTimeout(finish, 15000);
  });
}

async function eatIcon(item, warnText, warnMs) {
  state.eating = true;
  closePicker();
  interrupt();
  wake();

  // 自己啃的话先吱一声，说完这段时间你可以把开关关掉
  if (warnText) {
    say(warnText, warnMs);
    await sleep(warnMs);
    if (!Game.prefs.eatAuto || state.dragging) {
      state.eating = false;
      scheduleNext(3000);
      return;
    }
  }

  say('我要吃掉「' + item.name + '」咯…', 2200);
  await walkNear(item.x, item.y);

  setAction('idle');
  playAnim('state-chew', 1600);
  say('吧唧吧唧…', 1600);
  await sleep(1300);

  const res = await api.eatIcon({ path: item.path });
  state.eating = false;

  if (!res.ok) {
    say('咦…' + res.error, 3200);
    renderPanel();
    scheduleNext(3000);
    return;
  }

  const result = Game.eatIcon();
  setAction('happy', 600);
  spawnHeart();
  say('咕咚——「' + res.name + '」进肚子啦\n' + result.line, 4200);
  renderPanel();
  pushUiState();
  scheduleNext(4000);
}

function askEatIcon(item) {
  closePicker();
  askChoice('我要吃掉「' + item.name + '」\n可以吗？', '吃掉它', () => {
    closeChoice();
    eatIcon(item);
  });
}

async function spitIcon(item) {
  const res = await api.spitIcon({ name: item.name });
  if (!res.ok) {
    say('吐不动…' + res.error, 3200);
    return;
  }
  const result = Game.spitIcon();
  jump();
  say('「' + res.name + '」还给你\n' + result.line, 3600);
  renderPanel();
  pushUiState();
}

function askSpit(item) {
  closePicker();
  askChoice('把「' + item.name + '」吐回桌面？', '吐出来', () => {
    closeChoice();
    spitIcon(item);
  });
}

async function openPicker(mode) {
  closeMenu();
  interrupt();
  wake();
  state.pickerOpen = true;
  api.setLock(true);

  const belly = mode === 'belly';
  el.pickerTitle.textContent = belly ? '肚子里有这些' : '桌上有什么';
  el.pickerList.innerHTML = '';
  el.pickerFoot.textContent = '翻一翻…';
  el.picker.classList.remove('hidden');
  placeCard(el.picker, 'head');

  const res = await api.fetchIcons();
  if (!state.pickerOpen) return;

  const rows = res.ok ? (belly ? res.data.belly : res.data.icons) : [];
  if (!rows.length) {
    fillPickerEmpty(belly ? '肚子空空的' : '桌面上没找到能吃的');
    el.pickerFoot.textContent = belly ? '' : '只能吃桌面上的文件和快捷方式';
    return;
  }

  rows.forEach((row) => {
    const item = document.createElement('div');
    item.className = 'picker-item';
    item.textContent = row.kind === 'dir' ? row.name + '/' : row.name;
    item.title = row.name;
    item.addEventListener('click', () => {
      if (belly) askSpit(row);
      else askEatIcon(row);
    });
    el.pickerList.appendChild(item);
  });

  el.pickerFoot.textContent = belly ? '点了就吐回桌面 · ' + res.data.bellyPath : '点了就喂它吃';
  placeCard(el.picker, 'head');
}

function fillPickerEmpty(text) {
  const empty = document.createElement('div');
  empty.className = 'picker-empty';
  empty.textContent = text;
  el.pickerList.appendChild(empty);
}

function closePicker() {
  if (!state.pickerOpen) return;
  state.pickerOpen = false;
  el.picker.classList.add('hidden');
  api.setLock(false);
}

// 饿的时候自己去叼一个。开关默认关着，开了也隔很久才啃一次
async function tryAutoEat() {
  if (state.eating || state.sleeping || state.dragging || state.swing.on) return;
  if (state.menuOpen || state.pickerOpen) return;

  const res = await api.fetchIcons();
  if (!res.ok || !res.data.icons.length) return;

  const list = res.data.icons;
  const pick = list[Math.floor(Math.random() * list.length)];
  eatIcon(pick, '饿了…桌上那个「' + pick.name + '」看着能吃', 2800);
}

// ---------- 主循环 ----------

// moveTo 之外再要一个"实际挪了多少"的版本，用来判断是不是被边界卡住了
function moveBy(dx, dy) {
  const box = bounds();
  const nx = clamp(state.x + dx, box.minX, box.maxX);
  const ny = clamp(state.y + dy, box.minY, box.maxY);
  const moved = Math.hypot(nx - state.x, ny - state.y);
  if (moved > 0.01) {
    state.x = nx;
    state.y = ny;
    state.dirty = true;
  }
  return moved;
}

function approach(current, target, maxDelta) {
  const diff = target - current;
  if (Math.abs(diff) <= maxDelta) return target;
  return current + Math.sign(diff) * maxDelta;
}

// 跟随光标带迟滞：进入和退出用不同距离，否则光标停在临界处会疯狂切姿势
function updateFollow() {
  if (!Game.prefs.follow || state.dragging || state.phys.active || state.sleeping || state.menuOpen) {
    state.following = false;
    return;
  }
  const dist = Math.hypot(state.cursor.x - state.x, state.cursor.y - state.y);
  if (!state.following && dist > FOLLOW_GAP + FOLLOW_HYSTERESIS) state.following = true;
  else if (state.following && dist < FOLLOW_GAP) state.following = false;
}

// 走路由目标速度 + 加减速驱动，起步和刹车都是渐变的
function stepMove(dt) {
  let goal = null;
  if (state.following) goal = state.cursor;
  else if (state.target) goal = state.target;

  let wantSpeed = 0;
  if (goal && !state.dragging && !state.phys.active && !state.paused) {
    const dx = goal.x - state.x;
    const dy = goal.y - state.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 2) {
      state.dirX = dx / dist;
      state.dirY = dy / dist;
      wantSpeed = state.following ? FOLLOW_SPEED : state.eating ? EAT_SPEED : WALK_SPEED;
    }
  }

  const rate = wantSpeed > state.speed ? ACCEL : DECEL;
  state.speed = approach(state.speed, wantSpeed, rate * dt);

  if (state.speed < 2) {
    state.speed = 0;
    if (state.action === 'walk') setAction('idle');
    return;
  }

  const moved = moveBy(state.dirX * state.speed * dt, state.dirY * state.speed * dt);
  if (state.action !== 'walk') setAction('walk');

  // 目标在边界外时会被 clamp 住，一直"原地走"。超过 0.25 秒没挪动就放弃
  if (moved < 0.3) {
    state.stuck += dt;
    if (state.stuck > 0.25) {
      state.stuck = 0;
      state.speed = 0;
      state.onArrive = null;
      if (state.target) {
        state.target = null;
        interrupt();
      }
    }
    return;
  }
  state.stuck = 0;

  if (state.target && !state.following) {
    const dx = state.target.x - state.x;
    const dy = state.target.y - state.y;
    if (Math.hypot(dx, dy) < 6) {
      state.target = null;
      const arrive = state.onArrive;
      state.onArrive = null;
      if (arrive) arrive();
      else scheduleNext();
    }
  }
}

function stepHover(dt) {
  const busy = state.dragging || state.phys.active || state.swing.on;

  if (state.hovering && !busy) {
    state.hoverMs += dt * 1000;

    // 被你盯着看就停下来，别边跑边被看
    if (state.hoverMs > PANEL_DELAY_MS && state.target && !ACTIVITY.current) state.target = null;

    if (state.hoverMs > HOVER_PET_MS && !state.petted && !state.sleeping && !state.menuOpen) {
      state.petted = true;
      doPetHead();
      renderPanel();
    }
  } else {
    state.hoverMs = 0;
  }

  if (state.hoverFoot && !busy) state.footMs += dt * 1000;
  else state.footMs = 0;
}

function loop(now) {
  const dt = Math.max(0, Math.min(64, now - loop.last)) / 1000;
  loop.last = now;

  // 荡秋千的时候位置完全由绳子说了算，别的移动逻辑都得让开
  if (stepSwing(dt)) drawRope();
  else {
    stepPhysics(dt);
    updateFollow();
    stepMove(dt);
  }
  stepHover(dt);
  updatePanel();
  updateTilt(dt);
  updateLean(dt);
  maybeFidget(now);
  if (choicePending) placeCard(el.choice, 'head');

  if (state.dirty) render();
  reportRect(now);

  requestAnimationFrame(loop);
}
loop.last = performance.now();

// ---------- 上报可交互区域 ----------

function reportRect(now, force) {
  if (!force && now - timers.report < 80) return;
  timers.report = now;

  const showBubble = !el.bubble.classList.contains('hidden');
  const top = state.y - PET_TOP - (showBubble ? BUBBLE_EXTRA : 0);

  api.reportRect({
    x: state.x - HIT_WIDTH / 2,
    y: top,
    w: HIT_WIDTH,
    h: state.y + PET_BOTTOM - top
  });
}

// ---------- 朝光标倾斜 ----------

function lookAt(point) {
  const dx = point.x - state.x;
  const dy = point.y - (state.y + EYE_OFFSET);
  const dist = Math.hypot(dx, dy) || 1;
  const pull = Math.min(1, dist / 300);
  state.leanTarget.x = (dx / dist) * LEAN_RANGE * pull;
  state.leanTarget.y = (dy / dist) * LEAN_RANGE * pull;
}

// ---------- 界面 ----------

function renderPanel() {
  const stats = Game.stats;
  ['food', 'mood', 'energy', 'bond'].forEach((key) => {
    const full = key === 'bond' ? 1000 : 100;
    el.bars[key].style.width = `${clamp((stats[key] / full) * 100, 0, 100)}%`;
    el.nums[key].textContent = Math.round(stats[key]);
  });
  el.tierName.textContent = Game.tier().name;
  el.wxLine.textContent = state.weather ? state.weather.text.title : '天气 --';

  // 电脑状态显示瞬时值，报警看的是平均值
  const sys = state.system;
  if (sys) {
    el.bars.cpu.style.width = `${clamp(sys.cpu, 0, 100)}%`;
    el.nums.cpu.textContent = `${sys.cpu}%`;
    el.bars.mem.style.width = `${clamp(sys.mem, 0, 100)}%`;
    el.nums.mem.textContent = `${sys.mem}%`;
    const doing = state.swing.on
      ? '挂在鼠标上荡秋千'
      : ACTIVITY.current
        ? `正在${ACTIVITY_NAMES[ACTIVITY.current]}`
        : '闲着';
    el.panelFoot.textContent = `${doing} · 内存 ${sys.memUsedGB}/${sys.memTotalGB} GB · ${sys.cores} 核`;
  }
}

function renderTimer() {
  const p = Game.pomodoro();
  if (!p.running) {
    el.timer.classList.add('hidden');
    return;
  }
  const minutes = Math.floor(p.remainMs / 60000);
  const seconds = Math.floor((p.remainMs % 60000) / 1000);
  el.timer.textContent = `${p.mode === 'focus' ? '专注' : '休息'} ${minutes}:${String(seconds).padStart(2, '0')}`;
  el.timer.classList.remove('hidden');
}

function syncMenu() {
  el.swingItem.classList.toggle('on', state.swing.on);
  // 城市格子按名字标：自动定位到的城市如果正好在列表里，也能标出来
  markCurrent(el.cityList, 'city', Game.prefs.city);
  markCurrent(el.channelList, 'channel', Game.prefs.newsChannel);
}

function markCurrent(list, key, value) {
  for (const node of list.children) {
    node.classList.toggle('on', node.dataset[key] === value);
  }
}

// 城市列表和资讯频道由主进程下发，免得两边各维护一份
function buildMenuLists() {
  el.cityList.innerHTML = '';
  state.config.cities.forEach((name) => {
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.dataset.city = name;
    item.textContent = name;
    el.cityList.appendChild(item);
  });

  el.channelList.innerHTML = '';
  state.config.channels.forEach((channel) => {
    const item = document.createElement('div');
    item.className = 'menu-item';
    item.dataset.channel = channel.id;
    item.textContent = channel.short || channel.name;
    item.title = channel.name;
    el.channelList.appendChild(item);
  });
}

// 把卡片摆在宠物旁边。prefer 是优先放哪侧（'foot' 脚边 / 'head' 头顶），
// 那侧放不下就翻到另一侧；翻到头顶时还要让开正在说话的气泡。
function placeCard(node, prefer) {
  const box = node.getBoundingClientRect();
  const left = clamp(state.x - box.width / 2, 6, Math.max(6, window.innerWidth - box.width - 6));

  const headTop = state.y - PET_HALF - box.height - 10;
  const footTop = state.y + PET_BOTTOM + 8;
  let atFoot;

  if (prefer === 'foot') atFoot = footTop + box.height <= window.innerHeight - 6;
  else atFoot = headTop < 6;

  let top = atFoot ? footTop : headTop;
  if (!atFoot && !el.bubble.classList.contains('hidden')) {
    const bubbleTop = el.bubble.getBoundingClientRect().top;
    top = Math.min(top, bubbleTop - box.height - 8);
  }
  if (top < 6) top = 6;

  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
  node.classList.toggle('below', atFoot);
}

// 状态面板挂在脚边——鼠标本来就停在脚上，也躲开了头顶的气泡
function placePanel() {
  placeCard(el.panel, 'foot');
}

function placeGame() {
  placeCard(el.game, 'head');
}

// 光标停在脚上就弹出来，不用右键；右键菜单打开时也保持显示
function updatePanel() {
  const want = state.menuOpen || (state.hoverFoot && state.footMs > PANEL_DELAY_MS);
  if (want !== state.panelShown) {
    state.panelShown = want;
    el.panel.classList.toggle('hidden', !want);
    if (want) renderPanel();
  }
  if (want) placePanel();
}

function pushUiState() {
  api.uiState({
    follow: Game.prefs.follow,
    sleeping: state.sleeping,
    pomodoro: Game.pomodoro().running,
    swing: state.swing.on,
    watchSystem: Game.prefs.watchSystem,
    eatAuto: Game.prefs.eatAuto,
    water: Game.prefs.water,
    hourly: Game.prefs.hourly,
    weather: Game.prefs.weather,
    news: Game.prefs.news
  });
}

// ---------- 猜拳小游戏 ----------

const RPS_FIST = { rock: '✊', scissors: '✌️', paper: '✋' };
// result 是按宠物视角算的
const RPS_RESULT_TEXT = { win: '我赢啦', lose: '你赢啦', draw: '平局' };

function rpsScoreText(score) {
  if (!score.total) return '还没玩过';
  const tail = score.streak >= 2 ? ` · 连胜 ${score.streak}` : '';
  return `${score.win} 胜 ${score.lose} 负 ${score.draw} 平${tail}`;
}

function openGame() {
  closeMenu();
  interrupt();
  wake();
  state.gameOpen = true;
  api.setLock(true);

  el.rpsPet.textContent = RPS_FIST.rock;
  el.rpsYou.textContent = '?';
  el.rpsResult.textContent = '出个拳吧';
  el.rpsScore.textContent = rpsScoreText(Game.rps);
  el.game.classList.remove('hidden');
  placeGame();
}

function closeGame() {
  if (!state.gameOpen) return;
  state.gameOpen = false;
  el.game.classList.add('hidden');
  api.setLock(false);
}

function playRps(choice) {
  const res = Game.playRps(choice);
  const mine = Game.RPS_NAMES[choice];

  el.rpsPet.textContent = RPS_FIST[res.pet];
  el.rpsYou.textContent = RPS_FIST[choice];
  el.rpsResult.textContent = `${res.petName} 对 ${mine} · ${RPS_RESULT_TEXT[res.result]}`;
  el.rpsScore.textContent = rpsScoreText(res.score);
  placeGame();

  if (res.result === 'win') setAction('happy', 700);
  else if (res.result === 'lose') setAction('dizzy', 700);
  else setAction('jump', 700);

  say(res.line, 3000);
}

// ---------- 交互 ----------

function startDrag(event) {
  if (event.button !== 0 || state.menuOpen) return;
  stopSwing(true); // 被抓住了就算从绳子上下来
  interrupt();
  state.dragging = true;
  state.dragOffset = { x: state.x - event.clientX, y: state.y - event.clientY };
  state.dragFrom = { x: event.clientX, y: event.clientY };
  state.dragged = 0;
  state.dragTrack = [{ t: performance.now(), x: event.clientX, y: event.clientY }];
  state.dragVX = 0;
  state.phys.active = false;
  state.phys.vx = 0;
  state.phys.vy = 0;
  api.setLock(true);
  wake();
  state.target = null;
  setAction('idle');
}

function onDrag(event) {
  if (!state.dragging) return;
  moveTo(event.clientX + state.dragOffset.x, event.clientY + state.dragOffset.y);
  state.dragged = Math.max(
    state.dragged,
    Math.hypot(event.clientX - state.dragFrom.x, event.clientY - state.dragFrom.y)
  );

  const last = state.dragTrack[state.dragTrack.length - 1];
  const dt = (performance.now() - last.t) / 1000;
  if (dt > 0.004) {
    const v = (event.clientX - last.x) / dt;
    state.dragVX += (v - state.dragVX) * 0.45;
  }

  state.dragTrack.push({ t: performance.now(), x: event.clientX, y: event.clientY });
  if (state.dragTrack.length > 6) state.dragTrack.shift();
}

function endDrag() {
  if (!state.dragging) return;
  state.dragging = false;
  api.setLock(false);

  const velocity = throwVelocity();
  state.dragTrack = [];
  if (velocity && Math.hypot(velocity.vx, velocity.vy) > 140) {
    state.phys.vx = velocity.vx;
    state.phys.vy = velocity.vy;
    state.phys.active = true;
  } else if (state.dragged > 4) {
    landBounce();
    scheduleNext(2000);
  }
}

function onPetClick() {
  if (state.dragged > 4) return;
  if (timers.click) return;
  timers.click = setTimeout(() => {
    timers.click = null;
    greet();
  }, 230);
}

function onPetDoubleClick() {
  if (timers.click) {
    clearTimeout(timers.click);
    timers.click = null;
  }
  interrupt();
  jump();
  spawnHeart();
}

function openMenu(event) {
  event.preventDefault();
  closeGame();
  state.menuOpen = true;
  api.setLock(true);

  const menu = el.menu;
  menu.classList.remove('hidden');
  syncMenu();

  const box = menu.getBoundingClientRect();
  menu.style.left = `${clamp(event.clientX, 4, Math.max(4, window.innerWidth - box.width - 4))}px`;
  menu.style.top = `${clamp(event.clientY, 4, Math.max(4, window.innerHeight - box.height - 4))}px`;
}

function closeMenu() {
  if (!state.menuOpen) return;
  state.menuOpen = false;
  el.menu.classList.add('hidden');
  api.setLock(false);
}

function runMenuAction(action) {
  closeMenu();
  state.lastInteract = Date.now();

  if (action === 'say-hi') greet();
  else if (action === 'jump') jump();
  else if (action === 'sleep') (state.sleeping ? wake() : fallAsleep());
  else if (action === 'play') doPlay();
  else if (action === 'rps') openGame();
  else if (action === 'weather') showWeather();
  else if (action === 'news') showNews();
  else if (action === 'eat-icon') openPicker('eat');
  else if (action === 'belly') openPicker('belly');
}

// ---------- 事件绑定 ----------

el.pet.addEventListener('mousedown', startDrag);
window.addEventListener('mousemove', onDrag);
window.addEventListener('mouseup', endDrag);
el.pet.addEventListener('click', onPetClick);
el.pet.addEventListener('dblclick', onPetDoubleClick);
el.pet.addEventListener('contextmenu', openMenu);

el.menu.addEventListener('click', (event) => {
  const item = event.target.closest('.menu-item');
  if (!item) return;
  if (item.dataset.activity) {
    closeMenu();
    state.lastInteract = Date.now();
    startActivity(item.dataset.activity);
    return;
  }
  if (item.dataset.food) {
    doFeed(item.dataset.food);
    return;
  }
  if (item.dataset.locate) {
    closeMenu();
    state.lastInteract = Date.now();
    locateCity();
    return;
  }
  if (item.dataset.city) {
    closeMenu();
    state.lastInteract = Date.now();
    pickCity(item.dataset.city);
    return;
  }
  if (item.dataset.channel) {
    closeMenu();
    state.lastInteract = Date.now();
    pickChannel(item.dataset.channel);
    return;
  }
  if (item.dataset.toggle) {
    doToggle(item.dataset.toggle);
    return;
  }
  if (item.dataset.action) runMenuAction(item.dataset.action);
});

el.game.addEventListener('click', (event) => {
  const fist = event.target.closest('.game-btn');
  if (fist) {
    playRps(fist.dataset.rps);
    return;
  }
  if (event.target.closest('[data-action="close-game"]')) closeGame();
});

el.picker.addEventListener('click', (event) => {
  if (event.target.closest('[data-action="close-picker"]')) closePicker();
});

el.choiceOk.addEventListener('click', () => {
  const pending = choicePending;
  if (!pending) return;
  closeChoice();
  pending.onOk();
});

el.choiceCancel.addEventListener('click', () => {
  if (!choicePending) return;
  closeChoice();
  say('好，那不动它', 1800);
});

window.addEventListener('mousedown', (event) => {
  if (state.menuOpen && !el.menu.contains(event.target) && !el.panel.contains(event.target)) closeMenu();
  if (state.gameOpen && !el.game.contains(event.target)) closeGame();
  if (state.pickerOpen && !el.picker.contains(event.target)) closePicker();
  if (choicePending && !el.choice.contains(event.target)) closeChoice();
});

window.addEventListener('blur', closeMenu);

api.onCursor((point) => {
  state.cursor = point;
  lookAt(point);

  const dx = point.x - state.x;
  const dy = point.y - state.y;

  // 只有光标靠近宠物才算「有人在互动」，否则它会一直睡不着
  if (Math.abs(dx) < 240 && Math.abs(dy) < 240) state.lastInteract = Date.now();

  state.hovering = Math.abs(dx) < HOVER_HALF_W && Math.abs(dy) < HOVER_HALF_H;

  // 状态面板只认脚部：光标从头顶扫过时不弹，免得糊住它正在说的话
  state.hoverFoot = Math.abs(dx) < HOVER_HALF_W && dy > FOOT_TOP && dy < FOOT_BOTTOM;

  if (!state.hovering) {
    state.hoverMs = 0;
    state.petted = false;
  }
  if (!state.hoverFoot) state.footMs = 0;
});

api.onAction((name) => {
  if (name === 'say-hi') greet();
  else if (name === 'jump') jump();
  else if (name === 'sleep') (state.sleeping ? wake() : fallAsleep());
  else if (name === 'play') doPlay();
  else if (name === 'weather') showWeather();
  else if (name === 'news') showNews();
  else if (name === 'eat-icon') openPicker('eat');
  else if (name === 'belly') openPicker('belly');
  else if (name === 'toggle-eat-auto') doToggle('eatAuto');
  else if (name === 'toggle-water') doToggle('water');
  else if (name === 'toggle-hourly') doToggle('hourly');
  else if (name === 'toggle-weather') doToggle('weather');
  else if (name === 'toggle-news') doToggle('news');
  else if (name.indexOf('feed:') === 0) doFeed(name.slice(5));
  else if (name === 'toggle-follow') doToggle('follow');
  else if (name === 'swing') doToggle('swing');
  else if (name === 'toggle-watch-system') doToggle('watchSystem');
  else if (name === 'pomodoro') togglePomodoro();
  else if (name === 'pause-on') setPaused(true);
  else if (name === 'pause-off') setPaused(false);
});

api.onConfig((config) => {
  state.config = config || { cities: [], channels: [] };
  buildMenuLists();
  syncMenu();
  // 城市已经知道了就先把天气取回来，面板一展开就有内容
  if (Game.prefs.city) loadWeather(Game.prefs.city, Game.prefs.coords);
});

api.onSystem((sample) => {
  state.system = sample;
  renderPanel();
});

// ---------- 启动 ----------

function init() {
  Game.load(Date.now());
  consumeEvents(Game.poll());

  // 初始可见性由代码兜底，不依赖 HTML 上的 class
  el.menu.classList.add('hidden');
  el.panel.classList.add('hidden');
  el.game.classList.add('hidden');
  el.rope.classList.add('hidden');
  el.picker.classList.add('hidden');
  el.choice.classList.add('hidden');

  const box = bounds();
  state.x = box.maxX;
  state.y = box.maxY;
  preloadFrames();
  applyFrame();
  render();
  reportRect(performance.now(), true);
  renderTimer();
  pushUiState();

  // 每秒推进一次养成数值，顺带看一眼电脑状态
  setInterval(() => {
    const now = Date.now();
    Game.tick(now, currentActivity());
    consumeEvents(Game.poll());
    renderTimer();

    const alert = Game.checkSystem(state.system, now);
    if (alert) {
      if (alert.type === 'report') say(alert.line, 3600);
      else {
        jump();
        say(alert.line, 4200);
      }
    }

    if (state.panelShown) renderPanel();
    if (Game.checkEatAuto(now)) tryAutoEat();
    timers.saveTick += 1;
    if (timers.saveTick % 30 === 0) Game.save();
  }, 1000);

  // 眨眼节奏：随机间隔，偶尔连眨两下
  setInterval(() => {
    if (!state.sleeping && !state.dragging && !state.paused) maybeBlink();
  }, 1600);

  window.addEventListener('beforeunload', () => Game.save());

  setTimeout(() => say('你好呀，我是咕嘎！', 2600), 700);
  // 过一会儿再悄悄把天气取回来，别跟开机问候撞一起
  setTimeout(autoWeather, 6000);
  scheduleNext(4000);
  requestAnimationFrame(loop);
}

init();
