'use strict';
// Načtení a uložení config.json (v kořeni aplikace). Chybějící klíče se doplní výchozími hodnotami.
const fs = require('fs');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(APP_DIR, 'config.json');

const DEFAULTS = {
  port: 8000,                    // port serveru (když je obsazený, zkusí se další)
  allowLan: true,                // false = server poslouchá jen na 127.0.0.1
  pin: '',                       // neprázdný = jiná zařízení než tento počítač musí zadat PIN
  maxConcurrentDownloads: 2,     // kolik stahování poběží současně (zbytek čeká ve frontě)
  maxDurationMinutes: 240,       // delší videa se odmítnou
  maxFileSizeMB: 4096,           // max. velikost jednoho staženého souboru
  maxPlaylistItems: 100,         // max. počet videí najednou z playlistu
  fileTtlMinutes: 60,            // hotové soubory se smažou nejpozději po této době
  deleteAfterSaveMinutes: 2,     // po úplném stažení do zařízení se soubor smaže po této době
  openBrowser: true,             // po startu otevřít prohlížeč (jen s parametrem --open)
  allowedHosts: []               // další povolené názvy hostitele v hlavičce Host (např. "muj-pc.local")
};

function clampInt(v, min, max, def) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function normalize(raw) {
  const c = { ...DEFAULTS, ...(raw && typeof raw === 'object' ? raw : {}) };
  c.port = clampInt(c.port, 1, 65535, DEFAULTS.port);
  c.allowLan = c.allowLan !== false;
  c.pin = typeof c.pin === 'string' || typeof c.pin === 'number' ? String(c.pin).trim() : '';
  c.maxConcurrentDownloads = clampInt(c.maxConcurrentDownloads, 1, 10, DEFAULTS.maxConcurrentDownloads);
  c.maxDurationMinutes = clampInt(c.maxDurationMinutes, 1, 24 * 60, DEFAULTS.maxDurationMinutes);
  c.maxFileSizeMB = clampInt(c.maxFileSizeMB, 1, 1024 * 1024, DEFAULTS.maxFileSizeMB);
  c.maxPlaylistItems = clampInt(c.maxPlaylistItems, 1, 5000, DEFAULTS.maxPlaylistItems);
  c.fileTtlMinutes = clampInt(c.fileTtlMinutes, 1, 7 * 24 * 60, DEFAULTS.fileTtlMinutes);
  c.deleteAfterSaveMinutes = clampInt(c.deleteAfterSaveMinutes, 0, 24 * 60, DEFAULTS.deleteAfterSaveMinutes);
  c.openBrowser = c.openBrowser !== false;
  c.allowedHosts = Array.isArray(c.allowedHosts) ? c.allowedHosts.map(h => String(h).toLowerCase()) : [];
  return c;
}

function load() {
  let raw = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (e) {
      console.error(`! config.json nelze přečíst (${e.message}) – používám výchozí nastavení.`);
    }
  } else {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2) + '\n');
  }
  return normalize(raw);
}

// Uloží jen jeden klíč, zbytek souboru (i komentáře uživatele v hodnotách) ponechá.
function saveKey(key, value) {
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch { /* nový soubor */ }
  raw[key] = value;
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(raw, null, 2) + '\n');
}

module.exports = { APP_DIR, CONFIG_PATH, DEFAULTS, load, saveKey };
