'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const CACHE_PATH = process.env.CK_MONTHLY_COST_CACHE_PATH
  || path.join(os.homedir(), '.claude', 'cache', 'monthly-cost.json');

function currentMonthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function currentDayKey(d = new Date()) {
  return `${currentMonthKey(d)}-${String(d.getDate()).padStart(2, '0')}`;
}

// Daily per-session buckets live under a reserved top-level key, distinct from
// "YYYY-MM" month keys so monthlyTotal() (which indexes a single month) is unaffected.
const DAILY_KEY = '__daily';
const DAILY_RETAIN_DAYS = 3; // today + small grace for midnight-spanning sessions

function pruneDaily(daily, now) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - DAILY_RETAIN_DAYS);
  for (const day of Object.keys(daily)) {
    if (day < currentDayKey(cutoff)) delete daily[day];
  }
}

function readCache() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return {};
    const parsed = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCacheAtomic(data) {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    const tmp = `${CACHE_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, CACHE_PATH);
  } catch {}
}

function upsertSessionCost(sessionId, costUSD, now = new Date()) {
  if (!sessionId || typeof costUSD !== 'number' || !Number.isFinite(costUSD) || costUSD < 0) return;
  const cache = readCache();
  const month = currentMonthKey(now);
  const day = currentDayKey(now);
  if (!cache[month] || typeof cache[month] !== 'object') cache[month] = {};
  if (!cache[DAILY_KEY] || typeof cache[DAILY_KEY] !== 'object') cache[DAILY_KEY] = {};
  if (!cache[DAILY_KEY][day] || typeof cache[DAILY_KEY][day] !== 'object') cache[DAILY_KEY][day] = {};

  const monthUnchanged = cache[month][sessionId] === costUSD;
  const dayUnchanged = cache[DAILY_KEY][day][sessionId] === costUSD;
  if (monthUnchanged && dayUnchanged) return;

  cache[month][sessionId] = costUSD;
  cache[DAILY_KEY][day][sessionId] = costUSD;
  pruneDaily(cache[DAILY_KEY], now);
  writeCacheAtomic(cache);
}

function todayTotal(now = new Date()) {
  const daily = readCache()[DAILY_KEY];
  const day = daily && daily[currentDayKey(now)];
  if (!day) return 0;
  let total = 0;
  for (const v of Object.values(day)) {
    if (typeof v === 'number' && Number.isFinite(v)) total += v;
  }
  return total;
}

function monthlyTotal(now = new Date()) {
  const cache = readCache();
  const month = cache[currentMonthKey(now)];
  if (!month) return 0;
  let total = 0;
  for (const v of Object.values(month)) {
    if (typeof v === 'number' && Number.isFinite(v)) total += v;
  }
  return total;
}

module.exports = { upsertSessionCost, monthlyTotal, todayTotal, currentMonthKey, currentDayKey };
