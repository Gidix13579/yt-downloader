'use strict';
// Validace vstupů. Do yt-dlp jde jen URL, kterou jsme sami znovu sestavili z ověřených částí.

const YT_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com',
  'www.youtube-nocookie.com', 'youtu.be', 'www.youtu.be'
]);
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;
const LIST_ID = /^[A-Za-z0-9_-]{2,64}$/;

// Vrací { videoId, listId, url } nebo vyhodí Error se srozumitelnou zprávou.
function parseYoutubeUrl(input) {
  if (typeof input !== 'string') throw userError('Zadejte odkaz na YouTube.');
  let s = input.trim();
  if (s.length === 0) throw userError('Zadejte odkaz na YouTube.');
  if (s.length > 2048) throw userError('Odkaz je příliš dlouhý.');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw userError('Neplatná URL adresa.');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw userError('Neplatná URL adresa.');
  if (u.username || u.password || (u.port && u.port !== '443' && u.port !== '80')) throw userError('Neplatná URL adresa.');
  const host = u.hostname.toLowerCase();
  if (!YT_HOSTS.has(host)) throw userError('Podporované jsou jen odkazy z youtube.com a youtu.be.');

  let videoId = null;
  let listId = u.searchParams.get('list');
  const parts = u.pathname.split('/').filter(Boolean);

  if (host.endsWith('youtu.be')) {
    videoId = parts[0] || null;
  } else if (parts[0] === 'watch') {
    videoId = u.searchParams.get('v');
  } else if (['shorts', 'embed', 'live', 'v', 'e'].includes(parts[0])) {
    videoId = parts[1] || null;
  } else if (parts[0] === 'playlist') {
    if (!listId) throw userError('V odkazu na playlist chybí parametr list.');
  } else {
    throw userError('Tento typ odkazu není podporovaný (použijte odkaz na video, Shorts nebo playlist).');
  }

  if (videoId !== null && !VIDEO_ID.test(videoId)) throw userError('Neplatné ID videa v odkazu.');
  if (listId !== null && !LIST_ID.test(listId)) listId = null;
  // „Mix“/radio playlisty (RD…) jsou nekonečné – ignorujeme je, pokud je v odkazu i video.
  if (listId && videoId && listId.startsWith('RD')) listId = null;
  if (!videoId && !listId) throw userError('V odkazu chybí ID videa.');

  return {
    videoId,
    listId,
    videoUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : null,
    playlistUrl: listId ? `https://www.youtube.com/playlist?list=${listId}` : null
  };
}

function isVideoId(s) {
  return typeof s === 'string' && VIDEO_ID.test(s);
}

function userError(message, status = 400) {
  const e = new Error(message);
  e.userMessage = message;
  e.status = status;
  return e;
}

// Čistý název souboru: bez znaků zakázaných ve Windows/macOS/Android, bez řídicích znaků, rozumná délka.
const WIN_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
function sanitizeFilename(name, fallback = 'video') {
  let s = String(name || '').normalize('NFC');
  s = s.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/[<>:"/\\|?*]/g, ' ')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '');
  // Omezení délky v bajtech UTF-8 (souborové systémy mívají limit 255 B) – necháme rezervu na příponu.
  const enc = new TextEncoder();
  while (enc.encode(s).length > 150) s = Array.from(s).slice(0, -1).join('');
  s = s.trim();
  if (!s || WIN_RESERVED.test(s)) s = fallback;
  return s;
}

// ASCII náhrada pro starší prohlížeče (parametr filename v Content-Disposition).
function asciiFilename(name) {
  const s = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_').replace(/["\\%;]/g, '_').replace(/_+/g, '_');
  return s || 'download';
}

function contentDisposition(filename) {
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return `attachment; filename="${asciiFilename(filename)}"; filename*=UTF-8''${encoded}`;
}

module.exports = { parseYoutubeUrl, isVideoId, userError, sanitizeFilename, contentDisposition };
