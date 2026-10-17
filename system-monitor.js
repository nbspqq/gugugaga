// CPU / 内存采样。只依赖 os，不依赖 electron，方便单独测。
const os = require('os');

function cpuTimes() {
  let idle = 0;
  let total = 0;
  os.cpus().forEach((core) => {
    idle += core.times.idle;
    total += core.times.user + core.times.nice + core.times.sys + core.times.idle + core.times.irq;
  });
  return { idle, total };
}

function average(list) {
  if (!list.length) return 0;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function createMonitor(options) {
  const interval = (options && options.interval) || 1500;
  const windowSize = (options && options.windowSize) || 20;

  let prev = null;
  let timer = null;
  const cpuSamples = [];
  const memSamples = [];

  // 第一次调用没有上一次的时间片，CPU 只能是 0
  function sample() {
    const now = cpuTimes();
    let cpu = 0;
    if (prev) {
      const idleDelta = now.idle - prev.idle;
      const totalDelta = now.total - prev.total;
      if (totalDelta > 0) cpu = Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
    }
    prev = now;

    cpuSamples.push(cpu);
    if (cpuSamples.length > windowSize) cpuSamples.shift();

    const totalMem = os.totalmem();
    const usedMem = totalMem - os.freemem();
    const memPercent = (usedMem / totalMem) * 100;
    memSamples.push(memPercent);
    if (memSamples.length > windowSize) memSamples.shift();

    return {
      cpu: Math.round(cpu),
      cpuAvg: Math.round(average(cpuSamples)),
      mem: Math.round(memPercent),
      memAvg: Math.round(average(memSamples)),
      memUsedGB: Number((usedMem / 1073741824).toFixed(1)),
      memTotalGB: Number((totalMem / 1073741824).toFixed(1)),
      cores: os.cpus().length
    };
  }

  function start(onSample) {
    if (timer) return;
    onSample(sample());
    timer = setInterval(() => onSample(sample()), interval);
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  return { sample, start, stop };
}

module.exports = { createMonitor };
