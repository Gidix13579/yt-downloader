'use strict';
// Fronta stahování, průběh, historie relace a úklid dočasných souborů.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const ytdlp = require('./ytdlp');
const { createZip } = require('./zip');
const { sanitizeFilename, userError } = require('./validate');

const events = new EventEmitter();
events.setMaxListeners(100);

const jobs = new Map();      // id -> job (veřejná i interní pole)
const queue = [];            // id čekajících úloh
let running = 0;
let cfg = null;
let jobsRoot = null;
let paused = false;          // během aktualizace yt-dlp se nové úlohy nespouští

const MIME = {
  mp4: 'video/mp4', m4v: 'video/mp4', mkv: 'video/x-matroska', webm: 'audio/webm', mp3: 'audio/mpeg',
  m4a: 'audio/mp4', opus: 'audio/ogg', ogg: 'audio/ogg', aac: 'audio/aac', srt: 'application/x-subrip',
  vtt: 'text/vtt', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', zip: 'application/zip'
};
const FORMAT_LABEL = { mp4: 'MP4', mp3: 'MP3', m4a: 'M4A', webm: 'WebM/Opus' };

function init(config, tmpRoot) {
  cfg = config;
  jobsRoot = path.join(tmpRoot, 'jobs');
  fs.rmSync(jobsRoot, { recursive: true, force: true });
  fs.mkdirSync(jobsRoot, { recursive: true });
  setInterval(cleanup, 30 * 1000).unref();
}

function setConfig(config) { cfg = config; }

function publicView(job) {
  return {
    id: job.id,
    kind: job.kind,
    title: job.title,
    format: job.format,
    formatLabel: FORMAT_LABEL[job.format] + (job.quality ? ` · ${job.format === 'mp4' ? job.quality + 'p' : job.quality + ' kbps'}` : ''),
    status: job.status,
    stage: job.stage,
    percent: job.percent,
    speed: job.speed,
    eta: job.eta,
    queuePosition: job.status === 'queued' ? queue.indexOf(job.id) + 1 : 0,
    items: job.items ? job.items.map(i => ({ title: i.title, status: i.status, error: i.error })) : null,
    current: job.current,
    files: job.files.map((f, index) => ({ index, name: f.name, size: f.size, mime: f.mime, deleted: f.deleted, saved: !!f.savedAt })),
    error: job.error,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
    expiresAt: job.finishedAt && job.status === 'done' ? job.finishedAt + cfg.fileTtlMinutes * 60000 : null
  };
}

let lastEmit = new Map();
function emit(job, force = false) {
  const now = Date.now();
  const last = lastEmit.get(job.id) || 0;
  if (!force && now - last < 300) {
    if (!job._emitTimer) {
      job._emitTimer = setTimeout(() => { job._emitTimer = null; emit(job, true); }, 300 - (now - last));
    }
    return;
  }
  lastEmit.set(job.id, now);
  events.emit('job', publicView(job));
}

function list() {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt).map(publicView);
}

function get(id) { return jobs.get(id) || null; }

// opts: { kind, videoUrl | items, title, format, quality, subLang, thumbnail }
function create(opts) {
  if (!ytdlp.FORMATS[opts.format]) throw userError('Neznámý formát.');
  if (opts.format === 'mp4' && !(Number(opts.quality) >= 100)) throw userError('Zvolte rozlišení.');
  if (opts.format === 'mp3' && ![128, 192, 320].includes(Number(opts.quality))) throw userError('Zvolte kvalitu MP3.');
  const activeCount = [...jobs.values()].filter(j => j.status === 'queued' || j.status === 'running' || j.status === 'processing').length;
  if (activeCount >= 50) throw userError('Fronta je plná. Počkejte, až se něco dokončí.', 429);

  const id = crypto.randomBytes(8).toString('hex');
  const job = {
    id,
    kind: opts.kind,
    title: sanitizeFilename(opts.title, opts.kind === 'playlist' ? 'playlist' : 'video'),
    format: opts.format,
    quality: opts.format === 'mp4' || opts.format === 'mp3' ? Number(opts.quality) : null,
    subLang: opts.subLang || null,
    thumbnail: !!opts.thumbnail,
    videoUrl: opts.videoUrl || null,
    items: opts.items ? opts.items.map(i => ({ id: i.id, title: sanitizeFilename(i.title, i.id), status: 'queued', error: null })) : null,
    current: 0,
    status: 'queued',
    stage: 'Čeká ve frontě',
    percent: 0,
    speed: null,
    eta: null,
    files: [],
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
    dir: path.join(jobsRoot, id),
    proc: null,
    canceled: false
  };
  jobs.set(id, job);
  queue.push(id);
  trimHistory();
  emit(job, true);
  pump();
  return publicView(job);
}

function trimHistory() {
  const finished = [...jobs.values()].filter(j => j.finishedAt).sort((a, b) => a.finishedAt - b.finishedAt);
  while (jobs.size > 200 && finished.length) remove(finished.shift().id);
}

function pump() {
  while (!paused && running < cfg.maxConcurrentDownloads && queue.length) {
    const job = jobs.get(queue.shift());
    if (!job || job.status !== 'queued') continue;
    running++;
    for (const id of queue) { const q = jobs.get(id); if (q) emit(q); }
    execute(job).catch(err => fail(job, err.userMessage || ('Neočekávaná chyba: ' + err.message)))
      .finally(() => { running--; pump(); });
  }
}

function setPaused(v) { paused = v; if (!v) pump(); }
function activeCount() { return running; }

function fail(job, message) {
  if (job.status === 'canceled') return;
  job.status = 'error';
  job.error = message;
  job.stage = 'Chyba';
  job.speed = null;
  job.eta = null;
  job.finishedAt = Date.now();
  job.proc = null;
  fs.rm(job.dir, { recursive: true, force: true }, () => {});
  emit(job, true);
}

async function execute(job) {
  fs.mkdirSync(job.dir, { recursive: true });
  job.status = 'running';
  job.stage = 'Spouštím…';
  emit(job, true);

  if (job.kind === 'video') {
    const out = await downloadOne(job, job.videoUrl, job.dir, p => { job.percent = p; });
    if (job.canceled) return;
    if (out.error) return fail(job, out.error);
    job.files = out.files.map(f => ({ ...f, name: f.suffix.startsWith('.') ? job.title + f.suffix : f.suffix }));
  } else {
    const n = job.items.length;
    const collected = [];
    for (let i = 0; i < n; i++) {
      if (job.canceled) return;
      const item = job.items[i];
      job.current = i;
      item.status = 'running';
      const dir = path.join(job.dir, 'items', String(i + 1).padStart(3, '0'));
      fs.mkdirSync(dir, { recursive: true });
      const out = await downloadOne(job, `https://www.youtube.com/watch?v=${item.id}`, dir, p => {
        job.percent = ((i + p / 100) / n) * 100;
      }, `${i + 1}/${n}`);
      if (job.canceled) return;
      if (out.error) {
        item.status = 'error';
        item.error = out.error;
      } else {
        item.status = 'done';
        const prefix = `${String(i + 1).padStart(String(n).length, '0')} - ${item.title}`;
        for (const f of out.files) collected.push({ path: f.path, name: prefix + f.suffix });
      }
      emit(job, true);
    }
    if (collected.length === 0) return fail(job, 'Nepodařilo se stáhnout žádné video z playlistu.');
    job.status = 'processing';
    job.stage = 'Balím ZIP…';
    job.speed = null;
    job.eta = null;
    emit(job, true);
    const zipName = job.title + '.zip';
    const zipPath = path.join(job.dir, 'playlist.zip');
    try {
      await createZip(zipPath, dedupeNames(collected), () => job.canceled);
    } catch (e) {
      if (job.canceled) return;
      return fail(job, 'Vytvoření ZIP selhalo: ' + e.message);
    }
    fs.rmSync(path.join(job.dir, 'items'), { recursive: true, force: true });
    job.files = [{ path: zipPath, name: zipName, size: fs.statSync(zipPath).size, mime: MIME.zip, deleted: false }];
  }

  job.status = 'done';
  const failed = job.items ? job.items.filter(i => i.status === 'error').length : 0;
  job.stage = failed ? `Hotovo (${failed} z ${job.items.length} se nepodařilo)` : 'Hotovo';
  job.percent = 100;
  job.speed = null;
  job.eta = null;
  job.finishedAt = Date.now();
  job.proc = null;
  emit(job, true);
}

function dedupeNames(entries) {
  const seen = new Set();
  return entries.map(e => {
    let name = e.name;
    let k = 2;
    while (seen.has(name.toLowerCase())) {
      const ext = path.extname(e.name);
      name = `${e.name.slice(0, -ext.length || undefined)} (${k++})${ext}`;
    }
    seen.add(name.toLowerCase());
    return { ...e, name };
  });
}

const SUB_EXT = /\.(vtt|srt|ttml|srv[123]|json3|ass|lrc)$/i;
const IMG_EXT = /\.(jpe?g|png|webp)$/i;

// Stáhne jedno video do dir. Vrací { files: [{path, suffix, size, mime}] } nebo { error }.
async function downloadOne(job, videoUrl, dir, onPercent, label = '') {
  const args = ytdlp.downloadArgs({
    videoUrl, format: job.format, quality: job.quality, subLang: job.subLang, thumbnail: job.thumbnail
  }, cfg, dir);
  let mediaStreams = 0;
  let filtered = false;
  let tooBig = false;
  const tail = [];
  const pre = label ? `[${label}] ` : '';
  const isVideo = job.format === 'mp4';

  const proc = ytdlp.run(args, {
    onStdoutLine: line => {
      tail.push(line);
      if (tail.length > 30) tail.shift();
      if (line.startsWith('[dl]')) {
        const [done, total, est, speed, eta] = line.slice(4).split('|').map(v => (v === 'NA' || v === 'None' ? null : Number(v)));
        const t = total || est;
        if (t && done !== null) onPercent(Math.min(99.5, (done / t) * 100));
        job.speed = Number.isFinite(speed) ? speed : null;
        job.eta = Number.isFinite(eta) ? eta : null;
        if (job.status !== 'running') job.status = 'running';
        emit(job);
        return;
      }
      const dest = line.match(/^\[download\] Destination: (.*)$/);
      if (dest) {
        if (SUB_EXT.test(dest[1])) job.stage = pre + 'Stahuji titulky…';
        else if (IMG_EXT.test(dest[1])) job.stage = pre + 'Stahuji miniaturu…';
        else {
          mediaStreams++;
          job.stage = pre + (isVideo ? (mediaStreams === 1 ? 'Stahuji video' : 'Stahuji zvuk') : 'Stahuji zvuk');
          if (isVideo && mediaStreams === 2) onPercent(0);
        }
        emit(job, true);
        return;
      }
      if (/does not pass filter/.test(line)) filtered = true;
      if (/File is larger than max-filesize/i.test(line)) tooBig = true;
      const pp = line.match(/^\[(Merger|ExtractAudio|VideoRemuxer|VideoConvertor|FixupM4a|FixupM3u8|FixupStretched|Metadata|EmbedThumbnail|ThumbnailsConvertor|SubtitlesConvertor)\]/);
      if (pp) {
        job.status = 'processing';
        job.speed = null;
        job.eta = null;
        job.stage = pre + ({
          Merger: 'Spojuji video a zvuk (ffmpeg)…',
          ExtractAudio: job.format === 'mp3' ? 'Převádím na MP3…' : 'Vyjímám zvukovou stopu…',
          VideoRemuxer: 'Převádím do MP4…',
          SubtitlesConvertor: 'Převádím titulky na SRT…',
          ThumbnailsConvertor: 'Převádím miniaturu…',
          EmbedThumbnail: 'Vkládám obal…',
          Metadata: 'Zapisuji metadata…'
        }[pp[1]] || 'Dokončuji…');
        emit(job, true);
      }
    }
  });
  job.proc = proc;
  const r = await proc.done;
  job.proc = null;
  if (job.canceled) return { error: 'Zrušeno' };
  if (r.spawnError) return { error: 'yt-dlp se nepodařilo spustit: ' + r.spawnError.message };
  const combined = tail.join('\n') + '\n' + r.stderr;
  if (filtered) return { error: 'Video překračuje povolenou délku nebo jde o živý přenos.' };
  if (tooBig) return { error: `Soubor překračuje maximální povolenou velikost (${cfg.maxFileSizeMB} MB).` };
  if (r.code !== 0) return { error: ytdlp.friendlyError(combined) };

  const files = [];
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (!fs.statSync(p).isFile()) continue;
    if (/\.(part|ytdl|temp|tmp)$/i.test(name) || /\.part-Frag/.test(name)) continue;
    if (!name.startsWith('media.')) continue;
    const suffix = name.slice('media'.length);           // např. ".mp4", ".cs.srt", ".jpg"
    const ext = path.extname(name).slice(1).toLowerCase();
    files.push({ path: p, suffix, size: fs.statSync(p).size, mime: MIME[ext] || 'application/octet-stream', deleted: false, ext });
  }
  // Hlavní soubor (video/zvuk) první, pak titulky, pak obrázek.
  const rank = f => (SUB_EXT.test(f.suffix) ? 1 : IMG_EXT.test(f.suffix) ? 2 : 0);
  files.sort((a, b) => rank(a) - rank(b));
  if (!files.some(f => rank(f) === 0)) return { error: ytdlp.friendlyError(combined) };
  // Miniatura navíc jen když o ni uživatel požádal (u MP3/M4A ji yt-dlp jinak vloží jako obal a smaže).
  return { files: job.thumbnail ? files : files.filter(f => rank(f) !== 2) };
}

function cancel(id) {
  const job = jobs.get(id);
  if (!job) return false;
  if (!['queued', 'running', 'processing'].includes(job.status)) return false;
  job.canceled = true;
  job.status = 'canceled';
  job.stage = 'Zrušeno';
  job.speed = null;
  job.eta = null;
  job.finishedAt = Date.now();
  const qi = queue.indexOf(id);
  if (qi >= 0) queue.splice(qi, 1);
  if (job.proc) job.proc.kill();
  setTimeout(() => fs.rm(job.dir, { recursive: true, force: true }, () => {}), 1500);
  emit(job, true);
  return true;
}

function remove(id) {
  const job = jobs.get(id);
  if (!job) return false;
  if (['queued', 'running', 'processing'].includes(job.status)) cancel(id);
  jobs.delete(id);
  lastEmit.delete(id);
  fs.rm(job.dir, { recursive: true, force: true }, () => {});
  events.emit('remove', id);
  return true;
}

function markSaved(job, index) {
  const f = job.files[index];
  if (!f || f.savedAt) return;
  f.savedAt = Date.now();
  emit(job, true);
}

function deleteFile(job, f) {
  if (f.deleted) return;
  f.deleted = true;
  fs.rm(f.path, { force: true }, () => {});
}

function cleanup() {
  const now = Date.now();
  for (const job of jobs.values()) {
    if (job.status !== 'done') continue;
    let changed = false;
    for (const f of job.files) {
      if (f.deleted || f.streaming) continue;
      const expired = now - job.finishedAt > cfg.fileTtlMinutes * 60000;
      const savedLongAgo = f.savedAt && now - f.savedAt > cfg.deleteAfterSaveMinutes * 60000;
      if (expired || savedLongAgo) { deleteFile(job, f); changed = true; }
    }
    if (changed) {
      if (job.files.every(f => f.deleted)) {
        job.stage = 'Soubory smazány';
        fs.rm(job.dir, { recursive: true, force: true }, () => {});
      }
      emit(job, true);
    }
  }
}

function shutdown() {
  for (const job of jobs.values()) if (job.proc) job.proc.kill();
  try { fs.rmSync(jobsRoot, { recursive: true, force: true }); } catch { /* ignorovat */ }
}

module.exports = { init, setConfig, events, list, get, create, cancel, remove, markSaved, setPaused, activeCount, shutdown };
