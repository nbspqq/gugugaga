// 联网取数据。放主进程是因为渲染进程的 CSP 不允许发外部请求。
// 不依赖 electron，可以单独跑测试。用到的都是免费、不要 key 的接口。
const https = require('https');
const zlib = require('zlib');
const weather = require('./weather');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DesktopPet/1.0';

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const LOCATE_URL = 'https://ipinfo.io/json';

// 只用科技/开发向的源。综合热榜里时政内容多，不适合放进宠物嘴里。
const CHANNELS = [
  { id: 'tech', name: '科技 · 少数派', short: '少数派' },
  { id: 'hn', name: '技术 · Hacker News', short: 'HN' }
];

const NEWS_URLS = {
  tech: 'https://sspai.com/feed',
  hn: 'https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=25'
};

const TTL = {
  weather: 20 * 60 * 1000,
  news: 15 * 60 * 1000
};

// ---------- 请求 ----------

function request(url, timeout, redirects) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': UA, Accept: '*/*' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (redirects > 4) {
          reject(new Error('重定向次数太多'));
          return;
        }
        const next = new URL(res.headers.location, url).toString();
        resolve(request(next, timeout, redirects + 1));
        return;
      }

      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('接口返回 ' + res.statusCode));
        return;
      }

      let stream = res;
      if (res.headers['content-encoding'] === 'gzip') stream = res.pipe(zlib.createGunzip());
      else if (res.headers['content-encoding'] === 'br') stream = res.pipe(zlib.createBrotliDecompress());

      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      stream.on('error', reject);
    });

    req.on('error', reject);
    // destroy 会触发一次 error，交给上面的 handler 收尾
    req.setTimeout(timeout, () => req.destroy(new Error('请求超时')));
  });
}

async function requestJson(url, timeout) {
  const text = await request(url, timeout, 0);
  return JSON.parse(text);
}

// ---------- 天气 ----------

async function geocode(name, timeout) {
  const url = `${GEO_URL}?name=${encodeURIComponent(name)}&count=1&language=zh&format=json`;
  const json = await requestJson(url, timeout);
  const first = (json.results || [])[0];
  if (!first) return null;
  return { name: first.name, latitude: first.latitude, longitude: first.longitude };
}

async function fetchWeather(city, coords, timeout) {
  let latitude = coords && coords.latitude;
  let longitude = coords && coords.longitude;
  let name = city;

  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    const found = await geocode(city, timeout);
    if (!found) throw new Error('没找到这个城市');
    latitude = found.latitude;
    longitude = found.longitude;
    name = found.name;
  }

  const query = [
    'latitude=' + latitude,
    'longitude=' + longitude,
    'current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m',
    'daily=temperature_2m_max,temperature_2m_min',
    'timezone=auto',
    'forecast_days=1'
  ].join('&');

  if (!name) name = '当前位置';

  const json = await requestJson(`${WEATHER_URL}?${query}`, timeout);
  const cur = json.current || {};
  const daily = json.daily || {};
  const maxList = daily.temperature_2m_max || [];
  const minList = daily.temperature_2m_min || [];

  return {
    city: name,
    current: {
      temp: cur.temperature_2m,
      feels: cur.apparent_temperature,
      humidity: cur.relative_humidity_2m,
      wind: cur.wind_speed_10m,
      code: cur.weather_code
    },
    today: {
      max: maxList[0],
      min: minList[0]
    }
  };
}

// 按出口 IP 粗略定位，只用来给个默认城市
async function locate(timeout) {
  const info = await requestJson(LOCATE_URL, timeout);
  const loc = String(info.loc || '').split(',');
  const latitude = Number(loc[0]);
  const longitude = Number(loc[1]);
  if (!latitude || !longitude) return null;
  return { city: weather.cnCity(info.city), latitude: latitude, longitude: longitude };
}

// ---------- 资讯 ----------

function decode(text) {
  return text
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

// RSS 2.0 结构很固定，按 <item> 切就够了
function parseRss(xml, limit) {
  const titles = [];
  const blocks = xml.split('<item>').slice(1);
  for (const block of blocks) {
    const found = block.match(/<title>([\s\S]*?)<\/title>/);
    if (!found) continue;
    const title = decode(found[1]);
    if (title) titles.push({ title: title, extra: '' });
    if (titles.length >= limit) break;
  }
  return titles;
}

function parseHackerNews(json) {
  const list = [];
  for (const hit of json.hits || []) {
    if (!hit.title) continue;
    list.push({ title: hit.title, extra: hit.points ? '▲ ' + hit.points : '' });
  }
  return list;
}

async function fetchNews(channel, timeout) {
  const text = await request(NEWS_URLS[channel], timeout, 0);
  if (channel === 'hn') return parseHackerNews(JSON.parse(text));
  return parseRss(text, 30);
}

// ---------- 对外 ----------

function createService(options) {
  const timeout = (options && options.timeout) || 9000;
  const cache = { weather: null, weatherKey: '', weatherAt: 0, news: {} };

  async function getWeather(city, coords) {
    const key = coords ? `${coords.latitude},${coords.longitude}` : String(city);
    const now = Date.now();
    if (cache.weatherKey === key && now - cache.weatherAt < TTL.weather) return cache.weather;

    const data = await fetchWeather(city, coords, timeout);
    cache.weather = data;
    cache.weatherKey = key;
    cache.weatherAt = now;
    return data;
  }

  async function getNews(channel) {
    const id = NEWS_URLS[channel] ? channel : 'tech';
    const hit = cache.news[id];
    const now = Date.now();
    if (hit && now - hit.at < TTL.news) return hit.list;

    const list = await fetchNews(id, timeout);
    cache.news[id] = { at: now, list: list };
    return list;
  }

  return {
    getWeather: getWeather,
    getNews: getNews,
    locate: () => locate(timeout),
    describe: weather.describe
  };
}

module.exports = { createService, CITIES: weather.CITIES, CHANNELS, request, parseRss, parseHackerNews };
