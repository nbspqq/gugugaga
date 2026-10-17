// 天气相关：城市表、天气码中文对照、文案拼装。
// 这里只做纯计算不发请求，网络那部分在 net-service.js，方便单独测。

// 右键菜单里的城市列表。不在列表里的城市走「自动定位」。
const CITIES = [
  '北京', '上海', '广州',
  '深圳', '杭州', '南京',
  '苏州', '成都', '重庆',
  '武汉', '西安', '长沙',
  '郑州', '天津', '青岛'
];

// 定位接口返回的是英文城市名，常见的换回中文
const CITY_EN = {
  Beijing: '北京',
  Shanghai: '上海',
  Guangzhou: '广州',
  Shenzhen: '深圳',
  Hangzhou: '杭州',
  Nanjing: '南京',
  Suzhou: '苏州',
  Chengdu: '成都',
  Chongqing: '重庆',
  Wuhan: '武汉',
  Xian: '西安',
  "Xi'an": '西安',
  Changsha: '长沙',
  Zhengzhou: '郑州',
  Tianjin: '天津',
  Qingdao: '青岛'
};

// WMO 天气代码，Open-Meteo 用的就是这一套
const CODES = {
  0: '晴',
  1: '晴间多云',
  2: '多云',
  3: '阴',
  45: '有雾',
  48: '雾凇',
  51: '小毛毛雨',
  53: '毛毛雨',
  55: '大毛毛雨',
  56: '冻毛毛雨',
  57: '冻毛毛雨',
  61: '小雨',
  63: '中雨',
  65: '大雨',
  66: '冻雨',
  67: '冻雨',
  71: '小雪',
  73: '中雪',
  75: '大雪',
  77: '雪粒',
  80: '阵雨',
  81: '阵雨',
  82: '强阵雨',
  85: '阵雪',
  86: '阵雪',
  95: '雷阵雨',
  96: '雷暴夹冰雹',
  99: '雷暴夹冰雹'
};

function codeText(code) {
  return CODES[code] || '未知';
}

function isRain(code) {
  if (code >= 51 && code <= 67) return true;
  if (code >= 80 && code <= 82) return true;
  return code >= 95;
}

function isSnow(code) {
  if (code >= 71 && code <= 77) return true;
  return code === 85 || code === 86;
}

function cnCity(name) {
  if (!name) return '';
  return CITY_EN[name] || name;
}

// 挑一句最有用的提醒，没有就不说
function tipFor(sample) {
  const cur = sample.current || {};
  if (isSnow(cur.code)) return '下雪了，路上小心';
  if (isRain(cur.code)) return '有雨，记得带伞';
  if (cur.feels >= 33) return '很热，多喝点水';
  if (cur.feels <= 3) return '挺冷的，穿厚一点';
  if (cur.wind >= 38) return '风有点大';
  if (cur.humidity >= 88) return '有点潮';
  return '';
}

function round(value) {
  return typeof value === 'number' ? Math.round(value) : null;
}

// 天气对应的随身小道具：下雪/冷就围围巾，下雨打伞，大热天扇扇子
function moodOf(current) {
  const cur = current || {};
  if (isSnow(cur.code)) return 'scarf';
  if (isRain(cur.code)) return 'umbrella';
  if (typeof cur.feels === 'number' && cur.feels <= 4) return 'scarf';
  if (typeof cur.feels === 'number' && cur.feels >= 31) return 'fan';
  return '';
}

// 把接口返回整理成几句：title 给状态面板（短），detail 是第二行，line 是现成的一整段
function describe(sample) {
  const city = cnCity(sample.city);
  const cur = sample.current || {};
  const today = sample.today || {};

  const now = round(cur.temp);
  const cond = codeText(cur.code);
  const tip = tipFor(sample);

  let detail;
  if (round(today.min) !== null && round(today.max) !== null) {
    detail = `今天 ${round(today.min)}~${round(today.max)}°`;
  } else {
    detail = `体感 ${round(cur.feels)}°`;
  }
  if (tip) detail += `，${tip}`;

  return {
    city: city,
    mood: moodOf(cur),
    title: `${city} ${now}° ${cond}`,
    detail: detail,
    line: `${city} ${now}° ${cond}\n${detail}`
  };
}

module.exports = { CITIES, CITY_EN, CODES, codeText, isRain, isSnow, cnCity, tipFor, moodOf, describe };
