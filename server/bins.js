'use strict';
// Hledání binárek: nejdřív ./bin (přenosná složka), pak systémová PATH.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { APP_DIR } = require('./config');

const IS_WIN = process.platform === 'win32';
const BIN_DIR = path.join(APP_DIR, 'bin');

function isExecutable(p) {
  try {
    const st = fs.statSync(p);
    if (!st.isFile()) return false;
    if (IS_WIN) return true;
    fs.accessSync(p, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function findInPath(name) {
  const exts = IS_WIN ? (process.env.PATHEXT || '.EXE;.CMD;.BAT').split(';').filter(Boolean) : [''];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, name + ext.toLowerCase());
      if (isExecutable(candidate)) return candidate;
      const candidateUpper = path.join(dir, name + ext);
      if (isExecutable(candidateUpper)) return candidateUpper;
    }
  }
  return null;
}

// names: možné názvy souboru bez přípony (např. yt-dlp_macos v bin/)
function find(names) {
  for (const n of names) {
    const p = path.join(BIN_DIR, IS_WIN ? n + '.exe' : n);
    if (isExecutable(p)) return { path: p, source: 'bin' };
  }
  for (const n of names) {
    const p = findInPath(n);
    if (p) return { path: p, source: 'system' };
  }
  return null;
}

function version(bin, args) {
  if (!bin) return null;
  try {
    const r = spawnSync(bin.path, args, { encoding: 'utf8', timeout: 20000, windowsHide: true });
    if (r.status !== 0) return null;
    return (r.stdout || '').split(/\r?\n/)[0].trim();
  } catch {
    return null;
  }
}

function detect() {
  const ytdlp = find(['yt-dlp', 'yt-dlp_macos', 'yt-dlp_linux']);
  const ffmpeg = find(['ffmpeg']);
  const ffprobe = find(['ffprobe']);
  const result = {
    ytdlp,
    ffmpeg,
    ffprobe,
    ytdlpVersion: version(ytdlp, ['--version']),
    ffmpegVersion: (version(ffmpeg, ['-version']) || '').replace(/^ffmpeg version\s+/, '').split(' ')[0] || null,
    jsRuntimesSupported: false
  };
  if (ytdlp) {
    try {
      const help = spawnSync(ytdlp.path, ['--help'], { encoding: 'utf8', timeout: 20000, windowsHide: true });
      result.jsRuntimesSupported = /--js-runtimes/.test(help.stdout || '');
    } catch { /* starší yt-dlp */ }
  }
  return result;
}

module.exports = { BIN_DIR, IS_WIN, detect, version };
