/* Simulation de l'API Google (classeur, cache, verrou, courrier, réseau, propriétés) autour du VRAI Code.gs.
   Sert aux tests de bout en bout : le navigateur parle à un serveur HTTP local qui exécute doPost du vrai code, sans réseau Google. */
const vm = require('vm'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
function createGas() {
  const sheets = {}; const mails = []; const cache = {}; const props = {}; const fetches = []; const stats = { formats: 0, reads: 0, writes: 0 };
  let quota = 100, fetchReply = () => ({ code: 201, body: '{"sid":"SM1"}' });
  function mkSheet(name) {
    const g = []; // g[r][c], index 0-based
    const sh = {
      name, _g: g,
      getName: () => name,
      getMaxRows: () => Math.max(g.length, 1000),
      setFrozenRows() {},
      deleteRow(n) { g.splice(n - 1, 1); },
      getDataRange: () => ({ getValues: () => { stats.reads++; const rows = g.reduce((m, r, i) => r.some(v => v !== '' && v !== undefined) ? i + 1 : m, 0), cols = g.reduce((m, r) => { let k = 0; r.forEach((v, i) => { if (v !== '' && v !== undefined) k = i + 1; }); return Math.max(m, k); }, 0);
        if (!rows) return [['']]; return Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (_, j) => { const v = (g[i] || [])[j]; return v === undefined ? '' : v; })); } }),
      getRange(r, c, nr = 1, nc = 1) { return {
        setValues: vals => { stats.writes++; vals.forEach((row, i) => { g[r - 1 + i] = g[r - 1 + i] || []; row.forEach((v, j) => { g[r - 1 + i][c - 1 + j] = v; }); }); },
        setFontWeight() { return this; }, setBackground() { return this; }, setFontColor() { return this; }, setNumberFormat() { stats.formats++; return this; }
      }; }
    };
    return sh;
  }
  const book = { getSheets: () => Object.values(sheets), insertSheet: n => (sheets[n] = mkSheet(n)) };
  const pad2 = n => String(n).padStart(2, '0');
  const ctx = {
    console, Date, Math, Object, Array, String, Number, JSON, isNaN, Error, Set, Map, encodeURIComponent, parseInt,
    SpreadsheetApp: { getActiveSpreadsheet: () => book },
    Utilities: {
      getUuid: () => crypto.randomUUID(), computeDigest: (a, d) => Array.from(crypto.createHash('sha256').update(d).digest()),
      base64Encode: b => Buffer.from(b).toString('base64'), Charset: { UTF_8: 'utf8' }, DigestAlgorithm: { SHA_256: 'sha256' },
      formatDate: (d, tz, f) => { const y = d.getFullYear(), m = pad2(d.getMonth() + 1), j = pad2(d.getDate()), h = pad2(d.getHours()); return f === 'yyyy-MM-dd' ? `${y}-${m}-${j}` : f === 'yyyyMMddHH' ? `${y}${m}${j}${h}` : `${y}${m}${j}`; }
    },
    Session: { getScriptTimeZone: () => 'Africa/Dakar' },
    CacheService: { getScriptCache: () => ({ get: k => cache[k] ?? null, put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    MailApp: { sendEmail: m => { if (m.to === 'panne@ecole.sn') throw new Error('Adresse refusée'); mails.push(m); quota--; }, getRemainingDailyQuota: () => quota },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: k => { delete props[k]; } }) },
    UrlFetchApp: { fetch: (url, o) => { fetches.push({ url, o }); const r = fetchReply(url, o); return { getResponseCode: () => r.code, getContentText: () => r.body }; } },
    ScriptApp: {}, HtmlService: {},
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => { const o = { _t: t, _m: '', setMimeType(m) { o._m = m; return o; }, getContent: () => t, getMimeType: () => o._m }; return o; } }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'dist/gas/Code.gs'), 'utf8'), ctx);
  return { ctx, sheets, mails, props, fetches, cache };
}
module.exports = { createGas };
