'use strict';
// PIN pro přístup z jiných zařízení. Tento počítač (localhost) PIN nikdy nepotřebuje.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { APP_DIR } = require('./config');

const SECRET_PATH = path.join(APP_DIR, '.secret');
const COOKIE = 'ytd_auth';
let secret;

function loadSecret() {
  try {
    const s = fs.readFileSync(SECRET_PATH, 'utf8').trim();
    if (/^[0-9a-f]{64}$/.test(s)) return s;
  } catch { /* vytvoříme */ }
  const s = crypto.randomBytes(32).toString('hex');
  try { fs.writeFileSync(SECRET_PATH, s, { mode: 0o600 }); } catch { /* jen v paměti */ }
  return s;
}

function token(pin) {
  if (!secret) secret = loadSecret();
  // Token závisí na PINu – změnou PINu v configu se odhlásí všechna zařízení.
  return crypto.createHmac('sha256', secret).update('pin:' + pin).digest('hex');
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function isAuthed(req, cfg, isLocal) {
  if (isLocal || !cfg.pin) return true;
  const c = parseCookies(req.headers.cookie)[COOKIE];
  return !!c && safeEqual(c, token(cfg.pin));
}

// Omezení pokusů: 5 chybných pokusů z jedné IP = 5 minut blokace.
const attempts = new Map();
function checkPin(ip, pin, cfg) {
  const now = Date.now();
  const a = attempts.get(ip) || { count: 0, until: 0 };
  if (a.until > now) return { ok: false, retryAfter: Math.ceil((a.until - now) / 1000) };
  if (cfg.pin && safeEqual(String(pin || ''), cfg.pin)) {
    attempts.delete(ip);
    return { ok: true, cookie: `${COOKIE}=${token(cfg.pin)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 30}` };
  }
  a.count++;
  if (a.count >= 5) { a.until = now + 5 * 60 * 1000; a.count = 0; }
  attempts.set(ip, a);
  return { ok: false, retryAfter: a.until > now ? Math.ceil((a.until - now) / 1000) : 0 };
}

module.exports = { isAuthed, checkPin };
