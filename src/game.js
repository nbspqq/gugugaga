// 养成数值与玩法逻辑。这一层不碰 DOM，只负责算数和存档，方便单独测。
const Game = (function () {
  const SAVE_KEY = 'desktop-pet.save.v1';

  // 每分钟自然衰减
  const DECAY = { food: 0.9, mood: 0.55, energy: 0.35 };
  // 衰减下限：桌面宠物不该被"饿死"，掉到这里就停住等人回来
  const FLOOR = { food: 12, mood: 15, energy: 10 };
  // 离线最多按 8 小时计，免得放一晚上回来数据太难看
  const MAX_OFFLINE_MS = 8 * 60 * 60 * 1000;

  // 每分钟精力变化
  const ACTIVITY_ENERGY = { walk: -0.9, idle: 0.25, sleep: 2.5 };

  const HUNGRY_AT = 25;
  const TIRED_AT = 20;
  // 饿/困不是一锤子买卖，隔一段时间再唠叨一次，但不刷屏
  const HUNGRY_COOLDOWN_MS = 15 * 60 * 1000;
  const TIRED_COOLDOWN_MS = 20 * 60 * 1000;

  const FOCUS_MIN = 25;
  const BREAK_MIN = 5;
  const WATER_EVERY_MS = 45 * 60 * 1000;

  // 天气简报每天一次，只在白天报；新闻两小时最多念一条
  const BRIEF_START_HOUR = 6;
  const BRIEF_END_HOUR = 22;
  const NEWS_EVERY_MS = 2 * 60 * 60 * 1000;
  const NEWS_FIRST_MS = 20 * 60 * 1000;

  // 自己去啃桌面图标：饱食掉到这个数以下才会动手，两次之间隔够久，免得天天啃
  const EAT_AUTO_FOOD = 45;
  const EAT_AUTO_EVERY_MS = 40 * 60 * 1000;

  // 系统状态提醒：看平均值得更稳，瞬时尖峰不报
  const CPU_ALERT = 85;
  const MEM_ALERT = 88;
  const CPU_COOLDOWN_MS = 10 * 60 * 1000;
  const MEM_COOLDOWN_MS = 15 * 60 * 1000;
  const REPORT_EVERY_MS = 30 * 60 * 1000;
  const FIRST_REPORT_MS = 12 * 60 * 1000;

  const FOODS = [
    { id: 'fish', name: '小鱼干', food: 22, mood: 8, bond: 3, line: '小鱼干！这个最棒了！' },
    { id: 'pudding', name: '布丁', food: 16, mood: 12, bond: 3, line: '布丁布丁～滑溜溜的' },
    { id: 'apple', name: '苹果', food: 14, mood: 4, bond: 2, line: '咔嚓咔嚓…有点酸诶' }
  ];

  const TIERS = [
    { min: 0, name: '刚认识', lines: ['你是…新来的吗？', '你好呀，多陪我一会儿嘛'] },
    { min: 120, name: '有点熟', lines: ['今天也见到你啦', '我知道你会来的', '要不要休息一下？'] },
    { min: 350, name: '好朋友', lines: ['你回来啦！我等好久了', '嘿嘿，摸摸头！', '陪你一起上班~'] },
    { min: 700, name: '挚友', lines: ['你不在的时候我好想你', '今天也要好好加油哦', '一直在一起吧！'] }
  ];

  const IDLE_LINES = ['陪我玩会儿嘛~', '有点饿了诶', '窗外的天好好看', '你在忙什么呀'];
  const HUNGRY_LINES = ['肚子咕咕叫了…', '有吃的吗？', '好饿呀，喂我一口嘛'];
  const TIRED_LINES = ['有点困了…', '眼皮好重…', '让我打个盹好不好'];

  // 猜拳：石头赢剪刀、剪刀赢布、布赢石头
  const RPS_NAMES = { rock: '石头', scissors: '剪刀', paper: '布' };
  const RPS_BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
  const RPS_LINES = {
    win: ['哈哈，我赢啦！', '嘿，你输咯~', '再来一把？我还没玩够'],
    lose: ['啊…居然输了', '不算不算，再来！', '哼，这次算你走运'],
    draw: ['平局！心有灵犀呀', '想一块去了', '哎哟，出一模一样']
  };

  // 天气彩蛋的碎碎念，同一个天气四十分钟最多念一次
  const MOOD_LINES = {
    umbrella: ['外面下雨了，记得带伞呀', '下雨天最适合窝在家里', '你出门带伞了没？'],
    scarf: ['外面好冷…你多穿点', '冷得我直哆嗦', '手好凉，帮我捂捂嘛'],
    fan: ['今天好热，给你扇扇风', '热化了…不想动', '这么热要多喝水哦']
  };
  const MOOD_EVERY_MS = 40 * 60 * 1000;

  // 吃桌面图标（真把文件叼进「咕嘎的肚子」）
  const EAT_ICON_LINES = ['桌面上的东西也挺香', '咔嚓咔嚓…有点硬', '嗯，这个能吃！', '嚼起来像数据'];
  const SPIT_LINES = ['这个不好吃，还给你', '嗝…拿走吧', '吐出来啦'];

  // 宠物自己会做的事。台词和收益分开配，方便加新活动
  const ACTIVITY_LINES = {
    fish: ['钓到啦！好大一条！', '今晚有着落了', '嘿嘿，运气不错'],
    fishWait: ['还没上钩…', '耐心一点…', '水面好安静'],
    eat: ['吧唧吧唧…', '自己找的零食最香', '吃饱啦~'],
    nap: ['睡饱了！', '哈——好舒服', '梦见你了'],
    daze: ['……', '什么也没干，真好', '云飘过去了'],
    wander: ['溜达一圈', '散散步~']
  };

  const ACTIVITY_GAIN = {
    fish: { mood: 12, food: 5, bond: 1 },
    eat: { food: 14, mood: 6, bond: 1 },
    nap: { energy: 26, mood: 5, bond: 1 },
    daze: { mood: 4 },
    wander: { mood: 3, energy: -3 }
  };

  let data = null;
  let queue = [];

  function defaults(now) {
    return {
      stats: { food: 82, mood: 78, energy: 88, bond: 0 },
      prefs: {
        follow: false,
        water: true,
        hourly: true,
        watchSystem: true,
        weather: true,
        news: false,
        eatAuto: false,
        city: '',
        coords: null,
        newsChannel: 'tech'
      },
      pomodoro: { mode: null, endsAt: 0 },
      rps: { win: 0, lose: 0, draw: 0, total: 0, streak: 0, best: 0 },
      updatedAt: now,
      lastHour: new Date(now).getHours(),
      lastBriefDay: '',
      nextWaterAt: now + WATER_EVERY_MS,
      nextHungryAt: 0,
      nextTiredAt: 0,
      nextCpuAlertAt: 0,
      nextMemAlertAt: 0,
      nextReportAt: now + FIRST_REPORT_MS,
      nextNewsAt: now + NEWS_EVERY_MS,
      nextMoodAt: 0,
      nextEatAt: 0,
      eatenCount: 0,
      spitCount: 0,
      fedCount: 0,
      playCount: 0
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function drop(value, amount, floor) {
    return Math.max(floor, value - amount);
  }

  function load(now) {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.stats) {
          data = Object.assign(defaults(now), parsed);
          data.stats = Object.assign(defaults(now).stats, parsed.stats);
          data.prefs = Object.assign(defaults(now).prefs, parsed.prefs);
          data.rps = Object.assign(defaults(now).rps, parsed.rps);
          return;
        }
      }
    } catch (err) {
      data = null;
    }
    data = defaults(now);
  }

  function save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (err) {
      // 存档失败不影响运行，忽略
    }
  }

  function push(event) {
    queue.push(event);
  }

  function poll() {
    const list = queue;
    queue = [];
    return list;
  }

  function tier() {
    let found = TIERS[0];
    let index = 0;
    TIERS.forEach((item, i) => {
      if (data.stats.bond >= item.min) {
        found = item;
        index = i;
      }
    });
    return { index, name: found.name, min: found.min };
  }

  function addBond(amount) {
    const before = tier().index;
    data.stats.bond = clamp(data.stats.bond + amount, 0, 1000);
    const after = tier();
    if (after.index > before) push({ type: 'bond-up', tier: after });
  }

  function gain(stat, amount) {
    data.stats[stat] = clamp(data.stats[stat] + amount, 0, 100);
  }

  // ---------- 时间推进 ----------

  function tick(now, activity) {
    if (!data) return;

    let ms = now - data.updatedAt;
    if (ms < 0) ms = 0;
    if (ms > MAX_OFFLINE_MS) ms = MAX_OFFLINE_MS;
    const minutes = ms / 60000;

    if (minutes > 0) {
      data.stats.food = drop(data.stats.food, DECAY.food * minutes, FLOOR.food);
      // 饿着的时候心情掉得更快
      const moodRate = data.stats.food < HUNGRY_AT ? DECAY.mood * 2 : DECAY.mood;
      data.stats.mood = drop(data.stats.mood, moodRate * minutes, FLOOR.mood);

      const rate = ACTIVITY_ENERGY[activity] || ACTIVITY_ENERGY.idle;
      const energyDelta = rate * Math.min(minutes, 60);
      data.stats.energy = clamp(data.stats.energy + energyDelta, FLOOR.energy, 100);

      data.updatedAt = now;
    }

    if (data.stats.food < HUNGRY_AT && now >= data.nextHungryAt) {
      data.nextHungryAt = now + HUNGRY_COOLDOWN_MS;
      push({ type: 'hungry' });
    }

    if (data.stats.energy < TIRED_AT && now >= data.nextTiredAt) {
      data.nextTiredAt = now + TIRED_COOLDOWN_MS;
      push({ type: 'tired' });
    }

    if (data.pomodoro.mode && now >= data.pomodoro.endsAt) {
      const finished = data.pomodoro.mode;
      data.pomodoro = { mode: null, endsAt: 0 };
      push({ type: 'pomodoro-end', mode: finished });
    }

    if (data.prefs.water && now >= data.nextWaterAt) {
      data.nextWaterAt = now + WATER_EVERY_MS;
      push({ type: 'water' });
    }

    const hour = new Date(now).getHours();
    if (data.prefs.hourly && hour !== data.lastHour) {
      data.lastHour = hour;
      push({ type: 'hour', hour });
    }

    // 每天第一次照面报一次天气，太晚或太早就不吵了
    if (data.prefs.weather) {
      const day = new Date(now).toDateString();
      if (data.lastBriefDay !== day && hour >= BRIEF_START_HOUR && hour < BRIEF_END_HOUR) {
        data.lastBriefDay = day;
        push({ type: 'briefing' });
      }
    }

    if (data.prefs.news && now >= data.nextNewsAt) {
      data.nextNewsAt = now + NEWS_EVERY_MS;
      push({ type: 'news' });
    }
  }

  // ---------- 玩法动作 ----------

  function feed(foodId) {
    if (data.stats.food >= 96) {
      return { ok: false, line: '吃不下啦，肚子好饱…' };
    }
    const food = FOODS.find((item) => item.id === foodId) || FOODS[0];
    gain('food', food.food);
    gain('mood', food.mood);
    addBond(food.bond);
    data.fedCount += 1;
    save();
    return { ok: true, food, line: food.line };
  }

  function play() {
    if (data.stats.energy < 18) {
      return { ok: false, line: '没力气了…让我先睡会儿' };
    }
    gain('mood', 22);
    gain('energy', -14);
    gain('food', -4);
    addBond(5);
    data.playCount += 1;
    save();
    return { ok: true, line: '哇——再玩一次！' };
  }

  function petHead() {
    gain('mood', 3);
    addBond(1);
    return { ok: true, line: ['嘿嘿…', '好舒服~', '再摸摸嘛'][Math.floor(Math.random() * 3)] };
  }

  function setPref(key, value) {
    data.prefs[key] = value;
    const now = Date.now();
    if (key === 'water' && value) data.nextWaterAt = now + WATER_EVERY_MS;
    if (key === 'watchSystem' && value) data.nextReportAt = now + FIRST_REPORT_MS;
    // 刚打开就立刻见到效果，别等两小时
    if (key === 'weather' && value) data.lastBriefDay = '';
    if (key === 'news' && value) data.nextNewsAt = now + NEWS_FIRST_MS;
    if (key === 'eatAuto' && value) data.nextEatAt = 0;
    save();
  }

  // coords 只有自动定位时才有，手动选城市就按城市名去查
  function setLocation(city, coords) {
    data.prefs.city = city || '';
    data.prefs.coords = coords || null;
    save();
  }

  function setChannel(id) {
    data.prefs.newsChannel = id;
    save();
  }

  // ---------- 猜拳 ----------

  // 返回值里的 result 是按宠物视角算的：win 表示它赢了你
  function playRps(choice) {
    const pet = randomLine(Object.keys(RPS_BEATS));
    let result;
    if (pet === choice) result = 'draw';
    else if (RPS_BEATS[pet] === choice) result = 'win';
    else result = 'lose';

    const score = data.rps;
    score.total += 1;

    if (result === 'win') {
      score.win += 1;
      score.streak += 1;
      if (score.streak > score.best) score.best = score.streak;
      gain('mood', 6);
      addBond(2);
    } else if (result === 'lose') {
      score.lose += 1;
      score.streak = 0;
      gain('mood', -2);
    } else {
      score.draw += 1;
    }
    save();

    return {
      pet: pet,
      petName: RPS_NAMES[pet],
      result: result,
      line: randomLine(RPS_LINES[result]),
      score: { total: score.total, win: score.win, lose: score.lose, draw: score.draw, streak: score.streak, best: score.best }
    };
  }

  // 天气彩蛋：应景的小道具挂上了，就隔一阵子念一句；同一种天气不刷屏
  function checkWeatherMood(mood, now) {
    if (!data || !data.prefs.weather || !mood) return null;
    if (now < data.nextMoodAt) return null;
    data.nextMoodAt = now + MOOD_EVERY_MS;
    save();
    return { mood: mood, line: randomLine(MOOD_LINES[mood] || ['…']) };
  }

  // ---------- 吃桌面图标 ----------

  // 搬文件的事在主进程做，这里只管吃下去之后长了多少肉
  function eatIcon() {
    gain('food', 16);
    gain('mood', 8);
    addBond(3);
    data.eatenCount += 1;
    save();
    return { line: randomLine(EAT_ICON_LINES) };
  }

  function spitIcon() {
    data.spitCount += 1;
    gain('mood', 3);
    save();
    return { line: randomLine(SPIT_LINES) };
  }

  // 饿到一定程度并且离上次够久了，才允许它自己去啃。开关在主界面那个勾上
  function checkEatAuto(now) {
    if (!data.prefs.eatAuto) return false;
    if (data.stats.food >= EAT_AUTO_FOOD) return false;
    if (now < data.nextEatAt) return false;
    data.nextEatAt = now + EAT_AUTO_EVERY_MS;
    save();
    return true;
  }

  // ---------- 电脑状态 ----------

  function reportLine(sample) {
    if (sample.cpuAvg >= 60) return `CPU 有点高，${sample.cpuAvg}% 呢`;
    if (sample.memAvg >= 75) return `内存用了 ${sample.memUsedGB}/${sample.memTotalGB} GB 啦`;
    if (sample.cpuAvg < 25 && sample.memAvg < 65) {
      return `现在很轻松，CPU ${sample.cpuAvg}%、内存 ${sample.memAvg}%`;
    }
    return `CPU ${sample.cpuAvg}%、内存 ${sample.memAvg}%，还行~`;
  }

  function checkSystem(sample, now) {
    if (!data || !data.prefs.watchSystem || !sample) return null;

    if (sample.cpuAvg >= CPU_ALERT && now >= data.nextCpuAlertAt) {
      data.nextCpuAlertAt = now + CPU_COOLDOWN_MS;
      return { type: 'cpu', line: `CPU 跑到 ${sample.cpuAvg}% 了，有点忙哦` };
    }
    if (sample.memAvg >= MEM_ALERT && now >= data.nextMemAlertAt) {
      data.nextMemAlertAt = now + MEM_COOLDOWN_MS;
      return { type: 'mem', line: `内存用了 ${sample.memUsedGB}/${sample.memTotalGB} GB，快满了` };
    }
    if (now >= data.nextReportAt) {
      data.nextReportAt = now + REPORT_EVERY_MS;
      return { type: 'report', line: reportLine(sample) };
    }
    return null;
  }

  // ---------- 番茄钟 ----------

  function pomodoro() {
    const p = data.pomodoro;
    if (!p.mode) return { mode: null, running: false, remainMs: 0 };
    return { mode: p.mode, running: true, remainMs: Math.max(0, p.endsAt - Date.now()) };
  }

  function pomodoroStart(mode) {
    const minutes = mode === 'break' ? BREAK_MIN : FOCUS_MIN;
    data.pomodoro = { mode, endsAt: Date.now() + minutes * 60000 };
    save();
    return pomodoro();
  }

  function pomodoroStop() {
    data.pomodoro = { mode: null, endsAt: 0 };
    save();
  }

  function pomodoroToggle() {
    if (data.pomodoro.mode) {
      pomodoroStop();
      return { mode: null, running: false };
    }
    return pomodoroStart('focus');
  }

  function randomLine(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  // ---------- 自主活动 ----------

  // 权重由当前状态决定：饿了优先找吃的，累了优先睡，半夜基本都在犯困
  function activityWeights(now) {
    const s = data.stats;
    const hour = new Date(now).getHours();
    const night = hour >= 23 || hour < 6;

    const weights = { wander: 26, fish: 26, daze: 18, eat: 8, nap: 6 };

    if (s.food < 55) {
      weights.eat = 70;
      weights.wander = 12;
      weights.fish = 12;
    }

    if (s.energy < 45) {
      weights.nap = 76;
      weights.wander = 10;
      weights.fish = 10;
    }

    if (night) {
      weights.nap += 60;
      weights.daze = 30;
      weights.fish = 6;
      weights.wander = 6;
    }

    return weights;
  }

  function pickActivity(now) {
    const weights = activityWeights(now || Date.now());
    let total = 0;
    Object.keys(weights).forEach((key) => {
      total += weights[key];
    });

    let roll = Math.random() * total;
    let picked = 'daze';
    for (const key of Object.keys(weights)) {
      roll -= weights[key];
      if (roll <= 0) {
        picked = key;
        break;
      }
    }
    return picked;
  }

  // 活动结束结算：加数值、返回台词
  function finishActivity(name) {
    const delta = ACTIVITY_GAIN[name];
    if (delta) {
      Object.keys(delta).forEach((stat) => {
        if (stat === 'bond') addBond(delta[stat]);
        else gain(stat, delta[stat]);
      });
    }
    save();
    return { lines: ACTIVITY_LINES[name] || ['…'] };
  }

  return {
    FOODS,
    TIERS,
    RPS_NAMES,
    IDLE_LINES,
    HUNGRY_LINES,
    TIRED_LINES,
    ACTIVITY_LINES,
    pickActivity,
    activityWeights,
    finishActivity,
    load,
    save,
    tick,
    poll,
    feed,
    play,
    petHead,
    playRps,
    checkWeatherMood,
    eatIcon,
    spitIcon,
    checkEatAuto,
    tier,
    setPref,
    setLocation,
    setChannel,
    checkSystem,
    pomodoro,
    pomodoroStart,
    pomodoroStop,
    pomodoroToggle,
    randomLine,
    get stats() {
      return data.stats;
    },
    get prefs() {
      return data.prefs;
    },
    get rps() {
      return data.rps;
    },
    get fedCount() {
      return data.fedCount;
    },
    get eatenCount() {
      return data.eatenCount;
    },
    get spitCount() {
      return data.spitCount;
    }
  };
})();
