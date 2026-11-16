'use strict';
// YT Downloader – lokální webový server. Spuštění: node server/index.js [--open]
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const config = require('./config');
const bins = require('./bins');
const ytdlp = require('./ytdlp');
const jobs = require('./jobs');
const auth = require('./auth');
const qr = require('./qr');
const { parseYoutubeUrl, isVideoId, userError, contentDisposition } = require('./validate');

if (Number(process.versions.node.split('.')[0]) < 18) {
  console.error('Je potřeba Node.js 18 nebo novější. Spusťte setup, který stáhne přenosný Node do složky bin/.');
  process.exit(1);
}

let cfg = config.load();
let detected = bins.detect();
const TMP_ROOT = path.join(os.tmpdir(), 'yt-downloader');
fs.mkdirSync(TMP_ROOT, { recursive: true });
ytdlp.init(detected, TMP_ROOT);
jobs.init(cfg, TMP_ROOT);

const INDEX_HTML = path.join(config.APP_DIR, 'public', 'index.html');
const ARGS = new Set(process.argv.slice(2));
let server = null;
let port = cfg.port;
let updating = false;
const sockets = new Set();

// ---------- Síť ----------

function normalizeIp(ip) {
  return String(ip || '').replace(/^::ffff:/, '');
}
function isLoopback(ip) {
  const a = normalizeIp(ip);
  return a === '127.0.0.1' || a === '::1' || a.startsWith('127.');
}

const VIRTUAL_IF = /vEthernet|VirtualBox|VMware|docker|^br-|^veth|Hyper-V|WSL|^tun|^tap|^utun|^zt|tailscale|^awdl|^llw|^bridge/i;
function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal || a.address.startsWith('169.254.')) continue;
      const priv = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address);
      const score = (priv ? 0 : 2) + (VIRTUAL_IF.test(name) ? 1 : 0) + (a.address.startsWith('192.168.') ? 0 : 0.5);
      out.push({ address: a.address, name, score });
    }
  }
  return out.sort((x, y) => x.score - y.score);
}
// Adresa mimo běžné domácí rozsahy (192.168.x, 10.x, 172.16–31.x) obvykle znamená síť, kde se zařízení
// navzájem nevidí: eduroam, hotelová/firemní Wi-Fi, CGNAT (100.64–127.x), případně jen VPN/Tailscale.
function lanWarning() {
  const best = lanAddresses()[0];
  if (!best) return null;
  if (/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(best.address) && !VIRTUAL_IF.test(best.name)) return null;
  return 'Počítač nevypadá připojený k běžné domácí Wi-Fi (adresa ' + best.address + '). Ve školních a firemních sítích ' +
    '(eduroam, hotel, kancelář) se zařízení navzájem nevidí, takže se telefon nepřipojí. Použijte domácí Wi-Fi, ' +
    'nebo na telefonu zapněte Osobní hotspot a připojte k němu počítač.';
}

function lanUrls() {
  return lanAddresses().map(a => `http://${a.address}:${port}`);
}

// Ochrana proti DNS rebinding: hlavička Host musí být IP adresa, localhost nebo název tohoto počítače.
function hostAllowed(hostHeader) {
  if (!hostHeader) return false;
  let h = String(hostHeader).toLowerCase();
  if (h.startsWith('[')) h = h.slice(1, h.indexOf(']'));
  else h = h.replace(/:\d+$/, '');
  if (h === 'localhost' || net.isIP(h)) return true;
  const hn = os.hostname().toLowerCase();
  if (h === hn || h === hn + '.local' || h === hn.replace(/\.local$/, '')) return true;
  return cfg.allowedHosts.includes(h);
}

// ---------- Pomocné funkce HTTP ----------

function securityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; " +
    "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function sendError(res, err) {
  const status = err.status || 500;
  if (!err.userMessage) console.error(err);
  sendJson(res, status, { error: err.userMessage || 'Interní chyba serveru.' });
}

function readJson(req, limit = 256 * 1024) {
  return new Promise((resolve, reject) => {
    const ct = String(req.headers['content-type'] || '');
    if (!ct.startsWith('application/json')) return reject(userError('Očekávám JSON.', 415));
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > limit) { reject(userError('Požadavek je příliš velký.', 413)); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(userError('Neplatný JSON.')); }
    });
    req.on('error', reject);
  });
}

// CSRF: změnové požadavky musí přijít ze stejného původu (Origin = Host), a jen jako JSON.
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // ne-prohlížečový klient nebo starší prohlížeč (JSON content-type stejně vynutí preflight)
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

// ---------- Náhledy (proxy, aby telefon komunikoval jen s tímto počítačem) ----------

const thumbCache = new Map();
async function serveThumb(res, id) {
  if (!isVideoId(id)) return sendJson(res, 400, { error: 'Neplatné ID.' });
  let buf = thumbCache.get(id);
  if (!buf) {
    for (const variant of ['mqdefault.jpg', 'hqdefault.jpg', 'default.jpg']) {
      try {
        const r = await fetch(`https://i.ytimg.com/vi/${id}/${variant}`, { signal: AbortSignal.timeout(8000) });
        if (r.ok) { buf = Buffer.from(await r.arrayBuffer()); break; }
      } catch { /* zkusit další */ }
    }
    if (!buf) { res.writeHead(404, { 'Cache-Control': 'no-store' }); return res.end(); }
    thumbCache.set(id, buf);
    if (thumbCache.size > 300) thumbCache.delete(thumbCache.keys().next().value);
  }
  res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length, 'Cache-Control': 'private, max-age=3600' });
  res.end(buf);
}

// ---------- Stažení souboru do zařízení ----------

function serveFile(req, res, job, index) {
  const f = job && job.status === 'done' ? job.files[index] : null;
  if (!f || f.deleted || !fs.existsSync(f.path)) return sendJson(res, 404, { error: 'Soubor už není k dispozici (byl smazán nebo vypršel).' });
  const size = fs.statSync(f.path).size;
  let start = 0;
  let end = size - 1;
  let status = 200;
  const range = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if (range && (range[1] || range[2])) {
    if (range[1]) { start = Number(range[1]); end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1; }
    else { start = Math.max(0, size - Number(range[2])); }
    if (start > end || start >= size) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    status = 206;
  }
  const headers = {
    'Content-Type': f.mime,
    'Content-Disposition': contentDisposition(f.name),
    'Content-Length': end - start + 1,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store'
  };
  if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') return res.end();
  f.streaming = (f.streaming || 0) + 1;
  const stream = fs.createReadStream(f.path, { start, end });
  let sent = 0;
  stream.on('data', c => { sent += c.length; });
  stream.pipe(res);
  res.on('close', () => {
    f.streaming--;
    // Celý soubor doručen → naplánovat smazání (s malou rezervou pro opakované stažení).
    if (sent === size && start === 0) jobs.markSaved(job, index);
  });
  stream.on('error', () => res.destroy());
}

// ---------- SSE ----------

const sseClients = new Set();
function serveEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 3000\n\n');
  res.write(`event: snapshot\ndata: ${JSON.stringify(jobs.list())}\n\n`);
  sseClients.add(res);
  const hb = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => { clearInterval(hb); sseClients.delete(res); });
}
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) res.write(msg);
}
jobs.events.on('job', j => broadcast('job', j));
jobs.events.on('remove', id => broadcast('remove', { id }));

// ---------- API ----------

let infoInFlight = 0;

function statusPayload(isLocal, authed) {
  const base = { authed, pinRequired: !!cfg.pin && !isLocal, isLocal };
  if (!authed) return base;
  return {
    ...base,
    allowLan: cfg.allowLan,
    lanUrls: cfg.allowLan ? lanUrls() : [],
    lanWarning: cfg.allowLan ? lanWarning() : null,
    ytdlp: detected.ytdlp ? { version: detected.ytdlpVersion, source: detected.ytdlp.source } : null,
    ffmpeg: detected.ffmpeg ? { version: detected.ffmpegVersion, source: detected.ffmpeg.source } : null,
    limits: {
      maxDurationMinutes: cfg.maxDurationMinutes,
      maxFileSizeMB: cfg.maxFileSizeMB,
      maxPlaylistItems: cfg.maxPlaylistItems,
      maxConcurrentDownloads: cfg.maxConcurrentDownloads,
      fileTtlMinutes: cfg.fileTtlMinutes
    },
    updating
  };
}

async function handleApi(req, res, url, ctx) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/status' && m === 'GET') return sendJson(res, 200, statusPayload(ctx.isLocal, ctx.authed));

  if (p === '/api/login' && m === 'POST') {
    const body = await readJson(req, 4096);
    const r = auth.checkPin(ctx.ip, body.pin, cfg);
    if (!r.ok) {
      return sendJson(res, r.retryAfter ? 429 : 401, {
        error: r.retryAfter ? `Příliš mnoho pokusů. Zkuste to za ${Math.ceil(r.retryAfter / 60)} min.` : 'Nesprávný PIN.'
      });
    }
    res.setHeader('Set-Cookie', r.cookie);
    return sendJson(res, 200, { ok: true });
  }

  if (!ctx.authed) return sendJson(res, 401, { error: 'Je potřeba zadat PIN.' });

  if (p === '/api/events' && m === 'GET') return serveEvents(req, res);

  const thumb = p.match(/^\/api\/thumb\/([A-Za-z0-9_-]{11})$/);
  if (thumb && m === 'GET') return serveThumb(res, thumb[1]);

  if (p === '/api/qr.svg' && m === 'GET') {
    const target = lanUrls()[0];
    if (!target || !cfg.allowLan) return sendJson(res, 404, { error: 'Přístup z LAN je vypnutý.' });
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
    return res.end(qr.toSvg(target));
  }

  if (p === '/api/info' && m === 'POST') {
    const body = await readJson(req);
    const parsed = parseYoutubeUrl(body.url);
    if (infoInFlight >= 4) throw userError('Server je zaneprázdněný, zkuste to za chvíli.', 429);
    infoInFlight++;
    try {
      const wantPlaylist = body.as === 'playlist' || (!parsed.videoId && parsed.listId);
      if (wantPlaylist) {
        const info = await ytdlp.playlistInfo(parsed.playlistUrl, cfg);
        info.maxItems = cfg.maxPlaylistItems;
        return sendJson(res, 200, info);
      }
      const info = await ytdlp.videoInfo(parsed.videoUrl, cfg);
      info.playlistAvailable = !!parsed.listId;
      info.sourceUrl = body.url;
      return sendJson(res, 200, info);
    } finally {
      infoInFlight--;
    }
  }

  if (p === '/api/jobs' && m === 'GET') return sendJson(res, 200, jobs.list());

  if (p === '/api/jobs' && m === 'POST') {
    if (updating) throw userError('Právě probíhá aktualizace yt-dlp, chvíli počkejte.', 409);
    const b = await readJson(req);
    const common = {
      format: String(b.format || ''),
      quality: b.quality,
      subLang: b.subLang ? String(b.subLang) : null,
      thumbnail: !!b.thumbnail,
      title: String(b.title || '').slice(0, 300)
    };
    if (common.subLang && !/^[A-Za-z0-9_-]{1,32}$/.test(common.subLang)) throw userError('Neplatný jazyk titulků.');
    if (b.type === 'playlist') {
      if (!Array.isArray(b.items) || b.items.length === 0) throw userError('Vyberte alespoň jedno video.');
      if (b.items.length > cfg.maxPlaylistItems) throw userError(`Najednou lze stáhnout nejvýše ${cfg.maxPlaylistItems} videí.`);
      const items = b.items.map(i => ({ id: String(i && i.id), title: String((i && i.title) || '').slice(0, 300) }));
      if (!items.every(i => isVideoId(i.id))) throw userError('Neplatné ID videa v seznamu.');
      return sendJson(res, 201, jobs.create({ ...common, kind: 'playlist', items }));
    }
    if (!isVideoId(b.videoId)) throw userError('Neplatné ID videa.');
    return sendJson(res, 201, jobs.create({ ...common, kind: 'video', videoUrl: `https://www.youtube.com/watch?v=${b.videoId}` }));
  }

  const jm = p.match(/^\/api\/jobs\/([0-9a-f]{16})(?:\/(cancel|files\/(\d{1,3})))?$/);
  if (jm) {
    const job = jobs.get(jm[1]);
    if (!job) return sendJson(res, 404, { error: 'Úloha neexistuje.' });
    if (jm[2] === 'cancel' && m === 'POST') return sendJson(res, 200, { ok: jobs.cancel(job.id) });
    if (jm[3] !== undefined && (m === 'GET' || m === 'HEAD')) return serveFile(req, res, job, Number(jm[3]));
    if (!jm[2] && m === 'DELETE') return sendJson(res, 200, { ok: jobs.remove(job.id) });
  }

  if (p === '/api/update-ytdlp' && m === 'POST') {
    if (updating) throw userError('Aktualizace už běží.', 409);
    if (jobs.activeCount() > 0) throw userError('Počkejte, až doběhnou rozpracovaná stahování.', 409);
    if (!detected.ytdlp) throw userError('yt-dlp nebyl nalezen.', 500);
    updating = true;
    jobs.setPaused(true);
    try {
      const proc = ytdlp.run(['-U']);
      const timer = setTimeout(() => proc.kill(), 180000);
      const lines = [];
      const r = await new Promise(resolve => {
        proc.child.stdout.on('data', d => lines.push(String(d)));
        proc.done.then(resolve);
      });
      clearTimeout(timer);
      const output = (lines.join('') + '\n' + r.stderr).trim();
      await new Promise(resolve => setTimeout(resolve, 1500)); // na Windows se exe vymění až po skončení procesu
      detected = bins.detect();
      ytdlp.setBins(detected);
      const ok = r.code === 0;
      let message = ok ? `yt-dlp ${detected.ytdlpVersion || ''} je aktuální.` : 'Aktualizace se nepodařila.';
      if (!ok && detected.ytdlp.source === 'system') message += ' yt-dlp je nainstalovaný v systému – aktualizujte ho tam (pip / brew / winget), nebo dejte yt-dlp do složky bin/.';
      return sendJson(res, 200, { ok, message, version: detected.ytdlpVersion, output: output.slice(-4000) });
    } finally {
      updating = false;
      jobs.setPaused(false);
    }
  }

  if (p === '/api/settings' && m === 'POST') {
    if (!ctx.isLocal) throw userError('Nastavení lze měnit jen přímo na tomto počítači.', 403);
    const b = await readJson(req, 4096);
    if (typeof b.allowLan === 'boolean' && b.allowLan !== cfg.allowLan) {
      cfg.allowLan = b.allowLan;
      config.saveKey('allowLan', b.allowLan);
      jobs.setConfig(cfg);
      setImmediate(() => rebind());
    }
    return sendJson(res, 200, statusPayload(true, true));
  }

  return sendJson(res, 404, { error: 'Nenalezeno.' });
}

async function handler(req, res) {
  const ip = normalizeIp(req.socket.remoteAddress);
  const isLocal = isLoopback(ip);
  securityHeaders(res);

  if (!cfg.allowLan && !isLocal) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Přístup z místní sítě je vypnutý.');
  }
  if (!hostAllowed(req.headers.host)) {
    res.writeHead(421, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Neplatná hlavička Host. Otevřete aplikaci přes IP adresu, nebo název přidejte do allowedHosts v config.json.');
  }

  let url;
  try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }

  try {
    if ((url.pathname === '/' || url.pathname === '/index.html') && (req.method === 'GET' || req.method === 'HEAD')) {
      const html = fs.readFileSync(INDEX_HTML);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'Content-Length': html.length });
      return res.end(req.method === 'HEAD' ? undefined : html);
    }
    if (url.pathname.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(req.method) && !sameOrigin(req)) return sendJson(res, 403, { error: 'Požadavek z cizího webu byl zablokován.' });
      return await handleApi(req, res, url, { ip, isLocal, authed: auth.isAuthed(req, cfg, isLocal) });
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Nenalezeno');
  } catch (err) {
    if (!res.headersSent) sendError(res, err);
    else res.destroy();
  }
}

// ---------- Start ----------

function listen(host, p) {
  return new Promise((resolve, reject) => {
    const s = http.createServer(handler);
    s.on('connection', sock => { sockets.add(sock); sock.on('close', () => sockets.delete(sock)); });
    s.requestTimeout = 0;
    s.headersTimeout = 30000;
    const onErr = err => { s.removeListener('listening', onOk); reject(err); };
    const onOk = () => { s.removeListener('error', onErr); resolve(s); };
    s.once('error', onErr);
    s.once('listening', onOk);
    s.listen({ host, port: p, ipv6Only: false });
  });
}

async function listenAny(startPort) {
  for (let p = startPort; p < startPort + 20; p++) {
    const hosts = cfg.allowLan ? ['::', '0.0.0.0'] : ['127.0.0.1'];
    for (const h of hosts) {
      try {
        const s = await listen(h, p);
        return { s, p };
      } catch (e) {
        if (e.code === 'EADDRINUSE') break;              // zkusit další port
        if (e.code === 'EAFNOSUPPORT' || e.code === 'EADDRNOTAVAIL') continue; // IPv6 vypnuté → IPv4
        throw e;
      }
    }
  }
  throw new Error(`Nenašel jsem volný port v rozsahu ${startPort}–${startPort + 19}.`);
}

async function rebind() {
  const old = server;
  await new Promise(r => { old.close(() => r()); old.closeIdleConnections && old.closeIdleConnections();
    // Při vypnutí LAN odpojit všechna zařízení z místní sítě (včetně otevřených SSE spojení).
    for (const sock of sockets) if (!isLoopback(sock.remoteAddress)) sock.destroy();
    setTimeout(r, 1000);
  });
  const { s, p } = await listenAny(port);
  server = s;
  port = p;
  console.log(cfg.allowLan ? '\n✔ Přístup z místní sítě ZAPNUT.' : '\n✔ Přístup z místní sítě VYPNUT – aplikace je dostupná jen na tomto počítači.');
  printUrls();
}

function printUrls() {
  console.log(`\n  Na tomto počítači:   http://localhost:${port}`);
  if (!cfg.allowLan) {
    console.log('  Přístup z místní sítě je vypnutý (allowLan: false v config.json).');
    return;
  }
  const urls = lanUrls();
  if (urls.length === 0) {
    console.log('  Nenašel jsem žádnou síťovou adresu – je počítač připojený k Wi-Fi?');
    return;
  }
  console.log(`  Z telefonu (Wi-Fi):  ${urls[0]}`);
  for (const u of urls.slice(1)) console.log(`                       ${u}`);
  console.log('\n  Naskenujte telefonem:\n');
  console.log(qr.toTerminal(urls[0]));
  const warn = lanWarning();
  if (warn) console.log('\n  ! ' + warn);
  console.log(cfg.pin ? '\n  Jiná zařízení musí zadat PIN z config.json.' : '\n  PIN není nastavený – kdokoli ve stejné Wi-Fi může aplikaci otevřít (lze nastavit „pin“ v config.json).');
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') spawn('explorer.exe', [url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).on('error', () => {}).unref();
  } catch { /* prohlížeč se otevřít nepodařilo – adresa je vypsaná v konzoli */ }
}

async function main() {
  console.log('\n==============================================');
  console.log('  YT Downloader');
  console.log('==============================================');
  console.log(`  yt-dlp: ${detected.ytdlp ? `${detected.ytdlpVersion || '?'} (${detected.ytdlp.source === 'bin' ? 'bin/' : detected.ytdlp.path})` : 'NENALEZEN!'}`);
  console.log(`  ffmpeg: ${detected.ffmpeg ? `${detected.ffmpegVersion || '?'} (${detected.ffmpeg.source === 'bin' ? 'bin/' : detected.ffmpeg.path})` : 'NENALEZEN!'}`);
  console.log(`  node:   ${process.version}`);
  if (!detected.ytdlp || !detected.ffmpeg) console.log('\n  ! Chybí binárky. Spusťte setup (viz README) nebo je vložte do složky bin/.');

  const { s, p } = await listenAny(cfg.port);
  server = s;
  port = p;
  if (p !== cfg.port) console.log(`\n  Port ${cfg.port} je obsazený, používám ${p}.`);
  printUrls();
  console.log('\n  Server ukončíte zavřením tohoto okna nebo Ctrl+C.\n');
  if (ARGS.has('--open') && cfg.openBrowser) openBrowser(`http://localhost:${port}`);
}

function shutdown() {
  console.log('\nUkončuji…');
  jobs.shutdown();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);

main().catch(err => {
  console.error('\nServer se nepodařilo spustit:', err.message);
  process.exit(1);
});
