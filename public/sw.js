'use strict';
// Service worker YT Downloaderu. Nic neukládá do mezipaměti (data jsou vždy živá ze serveru),
// jen když server neběží, zobrazí místo chyby prohlížeče srozumitelnou stránku s návodem.

const OFFLINE_HTML = `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0f1115"><title>YT Downloader – server neběží</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f1115; color: #e8eaed;
         font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding: 24px; box-sizing: border-box; }
  main { max-width: 420px; text-align: center; }
  h1 { font-size: 22px; margin: 0 0 10px; }
  p { color: #9aa1ac; margin: 0 0 12px; }
  b { color: #e8eaed; }
  button { margin-top: 12px; min-height: 48px; padding: 0 22px; border-radius: 12px; border: 0; background: #e5484d;
           color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; }
</style></head>
<body><main>
  <h1>Server neběží</h1>
  <p><b>Android:</b> spusťte ho ikonou <b>YT Downloader</b> z widgetu Termux na ploše
     (nebo v Termuxu: <code>bash ~/yt-downloader/start-android.sh</code>).</p>
  <p><b>Počítač:</b> spusťte <b>start.command</b> (Mac) nebo <b>start.bat</b> (Windows).
     Telefon musí být ve stejné Wi-Fi nebo v Tailscale.</p>
  <button type="button" onclick="location.reload()">Zkusit znovu</button>
</main></body></html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  // Jen navigace (otevření stránky). API, SSE a stahování souborů jdou přímo na server.
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() =>
    new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })));
});
