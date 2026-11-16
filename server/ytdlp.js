'use strict';
// Volání yt-dlp. VŽDY spawn(binárka, [pole argumentů]) bez shellu – vstup uživatele se nikdy neinterpretuje.
const { spawn } = require('child_process');
const path = require('path');
const { userError } = require('./validate');

const IS_WIN = process.platform === 'win32';
let bins = null;       // výsledek bins.detect()
let cacheDir = null;

function init(detected, tmpRoot) {
  bins = detected;
  cacheDir = path.join(tmpRoot, 'cache');
}

function setBins(detected) { bins = detected; }

function baseArgs() {
  const a = ['--ignore-config', '--no-colors', '--no-warnings', '--cache-dir', cacheDir];
  if (bins.ffmpeg) a.push('--ffmpeg-location', path.dirname(bins.ffmpeg.path));
  // YouTube vyžaduje JS runtime pro dešifrování podpisů – použijeme Node, ve kterém běží tento server.
  if (bins.jsRuntimesSupported) a.push('--js-runtimes', `node:${process.execPath}`);
  return a;
}

function requireYtdlp() {
  if (!bins || !bins.ytdlp) throw userError('yt-dlp nebyl nalezen. Spusťte setup nebo vložte yt-dlp do složky bin/.', 500);
}

// Spustí proces a vrátí handle. Na Unixu ve vlastní skupině procesů, aby šlo zabít i ffmpeg.
function run(args, { onStdoutLine, onStderrLine, cwd } = {}) {
  requireYtdlp();
  const child = spawn(bins.ytdlp.path, args, {
    cwd,
    windowsHide: true,
    detached: !IS_WIN,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' }
  });
  const stderrTail = [];
  const stdoutChunks = [];
  let outBuf = '';
  let errBuf = '';
  const flush = (buf, cb) => {
    const lines = buf.split(/\r?\n|\r/);
    const rest = lines.pop();
    for (const l of lines) if (l) cb(l);
    return rest;
  };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', d => {
    if (onStdoutLine) outBuf = flush(outBuf + d, onStdoutLine);
    else stdoutChunks.push(d);
  });
  child.stderr.on('data', d => {
    errBuf = flush(errBuf + d, l => {
      stderrTail.push(l);
      if (stderrTail.length > 50) stderrTail.shift();
      if (onStderrLine) onStderrLine(l);
    });
  });
  const done = new Promise(resolve => {
    child.on('error', err => resolve({ code: -1, signal: null, stdout: '', stderr: String(err.message), spawnError: err }));
    child.on('close', (code, signal) => {
      if (outBuf && onStdoutLine) onStdoutLine(outBuf);
      if (errBuf) stderrTail.push(errBuf);
      resolve({ code, signal, stdout: stdoutChunks.join(''), stderr: stderrTail.join('\n') });
    });
  });
  return { child, done, kill: () => killTree(child) };
}

function killTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (IS_WIN) {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGTERM');
      setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* už skončil */ } }, 3000).unref();
    }
  } catch {
    try { child.kill('SIGKILL'); } catch { /* ignorovat */ }
  }
}

// Přeloží chybový výstup yt-dlp na srozumitelnou češtinu.
function friendlyError(stderr) {
  const s = String(stderr || '');
  const rules = [
    [/private video|this video is private/i, 'Video je soukromé – bez přihlášení k němu nelze přistoupit.'],
    [/confirm your age|age[- ]restricted|inappropriate for some users|age-gated/i, 'Video má věkové omezení (vyžaduje přihlášení), proto ho nelze stáhnout.'],
    [/not available in your country|blocked it in your country|geo.?restrict|not made this video available in your country/i, 'Video je v této zemi regionálně blokované.'],
    [/members[- ]only|join this channel/i, 'Video je dostupné jen pro členy kanálu.'],
    [/confirm you.?re not a bot|sign in to confirm/i, 'YouTube dočasně blokuje stahování (ochrana proti botům). Zkuste „Aktualizovat yt-dlp“ nebo to zkuste později.'],
    [/premieres in|live event will begin|this live event|is_upcoming|scheduled/i, 'Video ještě nebylo zveřejněno (premiéra / plánovaný přenos).'],
    [/does not pass filter/i, 'Video překračuje povolenou délku nebo jde o živý přenos.'],
    [/larger than max-filesize|File is larger than/i, 'Soubor překračuje maximální povolenou velikost.'],
    [/copyright claim|removed by the uploader|account associated with this video has been terminated|video has been removed/i, 'Video bylo odstraněno.'],
    [/video unavailable|this video is not available|is unavailable/i, 'Video není dostupné (bylo smazáno nebo je skryté).'],
    [/playlist does not exist|The playlist does not exist/i, 'Playlist neexistuje nebo je soukromý.'],
    [/Unsupported URL|is not a valid URL|Incomplete YouTube ID/i, 'Neplatná URL adresa videa.'],
    [/Requested format is not available/i, 'Požadovaný formát není pro toto video dostupný.'],
    [/HTTP Error 429|Too Many Requests/i, 'YouTube hlásí příliš mnoho požadavků. Chvíli počkejte a zkuste to znovu.'],
    [/HTTP Error 403/i, 'YouTube odmítl přístup (HTTP 403). Zkuste „Aktualizovat yt-dlp“.'],
    [/ffmpeg (is )?not (found|installed)|ffprobe and ffmpeg not found/i, 'Chybí ffmpeg – vložte ho do složky bin/ nebo spusťte setup.'],
    [/Unable to download (webpage|API page|JSON)|Unable to connect to proxy|Tunnel connection failed|Connection reset|getaddrinfo|Network is unreachable|timed out|Connection refused|Temporary failure in name resolution/i, 'Nepodařilo se spojit s YouTube. Zkontrolujte připojení k internetu.'],
    [/No space left on device/i, 'Na disku došlo místo.']
  ];
  for (const [re, msg] of rules) if (re.test(s)) return msg;
  const errLine = s.split('\n').reverse().find(l => /ERROR:/.test(l));
  if (errLine) return 'Chyba yt-dlp: ' + errLine.replace(/^.*?ERROR:\s*(\[[^\]]+\]\s*)?([A-Za-z0-9_-]{11}:\s*)?/, '').replace(/;?\s*please report this issue.*$/i, '').slice(0, 300);
  return 'Stahování selhalo z neznámého důvodu.';
}

// ---------- Načtení informací ----------

async function fetchJson(args, timeoutMs) {
  const proc = run(args);
  const timer = setTimeout(() => proc.kill(), timeoutMs);
  const r = await proc.done;
  clearTimeout(timer);
  if (r.spawnError) throw userError('yt-dlp se nepodařilo spustit: ' + r.spawnError.message, 500);
  if (r.code !== 0) {
    if (r.signal || r.code === null) throw userError('Načítání trvalo příliš dlouho.', 504);
    throw userError(friendlyError(r.stderr), 422);
  }
  try {
    return JSON.parse(r.stdout);
  } catch {
    throw userError('yt-dlp vrátil neplatná data.', 502);
  }
}

function pickThumb(info) {
  return `/api/thumb/${info.id}`;
}

async function videoInfo(videoUrl, cfg) {
  return parseVideoInfo(await fetchJson([...baseArgs(), '-J', '--no-playlist', '--', videoUrl], 60000), cfg);
}

function parseVideoInfo(info, cfg) {
  if (info._type === 'playlist') throw userError('Odkaz vede na playlist, ne na video.');
  if (info.is_live || info.live_status === 'is_live') throw userError('Živé přenosy nejsou podporované.', 422);
  if (info.live_status === 'is_upcoming') throw userError('Video ještě nebylo zveřejněno (premiéra / plánovaný přenos).', 422);

  const formats = Array.isArray(info.formats) ? info.formats : [];
  // Rozlišení podle menšího rozměru (tak se značí i u svislých Shorts: 1080x1920 = 1080p).
  const resSet = new Map();
  let bestAbr = 0;
  let hasOpus = false;
  let hasM4a = false;
  for (const f of formats) {
    if (f.vcodec && f.vcodec !== 'none' && f.width && f.height) {
      const p = Math.min(f.width, f.height);
      if (p >= 100) {
        const size = f.filesize || f.filesize_approx || 0;
        const prev = resSet.get(p);
        resSet.set(p, { p, fps: Math.max(prev ? prev.fps : 0, f.fps || 0), size: Math.max(prev ? prev.size : 0, size) });
      }
    }
    if (f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')) {
      bestAbr = Math.max(bestAbr, f.abr || 0);
      if (/opus/.test(f.acodec)) hasOpus = true;
      if (/mp4a/.test(f.acodec)) hasM4a = true;
    }
  }
  // Seskupení do standardních stupňů (144…4320) – nestandardní rozměry se přiřadí nejbližšímu nižšímu.
  const STEPS = [144, 240, 360, 480, 720, 1080, 1440, 2160, 4320];
  const heights = new Map();
  for (const { p, fps } of resSet.values()) {
    let step = STEPS[0];
    for (const s of STEPS) if (p >= s * 0.9) step = s;
    const prev = heights.get(step);
    heights.set(step, { height: step, fps: Math.max(prev ? prev.fps : 0, fps) });
  }

  const subs = [];
  const manual = info.subtitles || {};
  for (const lang of Object.keys(manual)) {
    if (lang === 'live_chat') continue;
    const name = (manual[lang][0] && manual[lang][0].name) || lang;
    subs.push({ lang, name, auto: false });
  }
  const auto = info.automatic_captions || {};
  // Z automatických titulků nabídneme jen původní jazyk videa (jinak by jich bylo přes 100 strojových překladů).
  const origLang = Object.keys(auto).find(k => k.endsWith('-orig'));
  if (origLang && !subs.some(s => s.lang === origLang.replace(/-orig$/, ''))) {
    const base = origLang.replace(/-orig$/, '');
    const name = (auto[origLang][0] && auto[origLang][0].name) || base;
    subs.push({ lang: origLang, name: name.replace(/\s*\(.*?\)\s*$/, '') + ' (automatické)', auto: true });
  }

  const maxDur = cfg.maxDurationMinutes * 60;
  return {
    type: 'video',
    id: info.id,
    title: info.title || info.id,
    channel: info.channel || info.uploader || '',
    duration: info.duration || null,
    thumbnail: pickThumb(info),
    tooLong: !!(info.duration && info.duration > maxDur),
    heights: [...heights.values()].sort((a, b) => b.height - a.height),
    audio: { bestAbr: Math.round(bestAbr) || null, hasOpus, hasM4a },
    subtitles: subs
  };
}

async function playlistInfo(playlistUrl, cfg) {
  return parsePlaylistInfo(await fetchJson([...baseArgs(), '-J', '--flat-playlist', '--yes-playlist', '--', playlistUrl], 120000), cfg);
}

function parsePlaylistInfo(info, cfg) {
  const entries = (Array.isArray(info.entries) ? info.entries : [])
    .filter(e => e && typeof e.id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(e.id))
    .map(e => ({
      id: e.id,
      title: e.title || e.id,
      duration: e.duration || null,
      channel: e.channel || e.uploader || '',
      unavailable: /^\[(private|deleted) video\]$/i.test(e.title || ''),
      tooLong: !!(e.duration && e.duration > cfg.maxDurationMinutes * 60)
    }));
  if (entries.length === 0) throw userError('Playlist je prázdný nebo nedostupný.', 422);
  return {
    type: 'playlist',
    id: info.id,
    title: info.title || 'Playlist',
    channel: info.channel || info.uploader || '',
    count: entries.length,
    entries,
    thumbnail: `/api/thumb/${entries[0].id}`
  };
}

// ---------- Stahování ----------

const FORMATS = {
  mp4: { kind: 'video' },
  mp3: { kind: 'audio', qualities: [128, 192, 320] },
  m4a: { kind: 'audio' },
  webm: { kind: 'audio' }
};

// Sestaví argumenty pro stažení jednoho videa do outDir. Soubory se jmenují media.<ext>.
function downloadArgs(opts, cfg, outDir) {
  const { videoUrl, format, quality, subLang, thumbnail } = opts;
  const a = [
    ...baseArgs(),
    '--no-playlist', '--newline', '--no-mtime', '--no-overwrites', '--continue',
    '--match-filter', `!is_live & duration <=? ${cfg.maxDurationMinutes * 60}`,
    '--max-filesize', `${cfg.maxFileSizeMB}M`,
    '--progress-template', 'download:[dl]%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s',
    '-P', outDir,
    '-o', 'media.%(ext)s',
    '-o', 'thumbnail:media.%(ext)s',
    '-o', 'subtitle:media.%(ext)s',
    '--embed-metadata'
  ];

  switch (format) {
    case 'mp4': {
      const h = Number(quality) || 1080;
      // Preferujeme dané rozlišení (menší rozměr), pak MP4/M4A kontejnery (H.264/AAC – nejlepší kompatibilita s telefony).
      // Do 1080p výslovně H.264 + AAC: YouTube nabízí i AV1 v kontejneru .mp4, které QuickTime/iPhone
      // na většině zařízení nepřehraje (hraje jen zvuk). Nad 1080p H.264 neexistuje – pak AV1 před VP9
      // (AV1 přehrají novější Apple zařízení, VP9 v MP4 QuickTime nepřehraje vůbec).
      const vcodec = h > 1080 ? 'av01' : 'h264';
      a.push('-f', 'bv*+ba/b', '-S', `res:${h},vcodec:${vcodec},acodec:aac,ext:mp4:m4a`, '--merge-output-format', 'mp4', '--remux-video', 'mp4');
      break;
    }
    case 'mp3': {
      const kbps = [128, 192, 320].includes(Number(quality)) ? Number(quality) : 192;
      a.push('-f', 'ba/b', '-x', '--audio-format', 'mp3', '--audio-quality', `${kbps}K`, '--embed-thumbnail');
      break;
    }
    case 'm4a':
      // M4A z YouTube je AAC – jen se vyjme z kontejneru, bez překódování.
      a.push('-f', 'ba[ext=m4a]/ba[acodec^=mp4a]/ba/b', '-x', '--audio-format', 'm4a', '--embed-thumbnail');
      break;
    case 'webm':
      // Původní WebM/Opus stopa, bez jakékoli konverze.
      a.push('-f', 'ba[ext=webm]/ba[acodec=opus]/ba');
      break;
    default:
      throw userError('Neznámý formát.');
  }

  if (subLang) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(subLang)) throw userError('Neplatný jazyk titulků.');
    a.push(subLang.endsWith('-orig') ? '--write-auto-subs' : '--write-subs', '--sub-langs', subLang, '--convert-subs', 'srt');
  }
  if (thumbnail) a.push('--write-thumbnail', '--convert-thumbnails', 'jpg');

  a.push('--', videoUrl);
  return a;
}

module.exports = { init, setBins, run, killTree, friendlyError, videoInfo, playlistInfo, parseVideoInfo, parsePlaylistInfo, downloadArgs, FORMATS, baseArgs };
