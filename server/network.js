'use strict';
// Rozpoznání síťových adres: domácí LAN vs. Tailscale. Volitelně zjistí MagicDNS název z Tailscale CLI.
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');

const PRIVATE_LAN = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/;
const VIRTUAL_IF = /vEthernet|VirtualBox|VMware|docker|^br-|^veth|Hyper-V|WSL|^tun|^tap|^utun|^zt|tailscale|^awdl|^llw|^bridge/i;
const TAILSCALE_IF = /tailscale|^utun/i;

// 100.64.0.0/10 – rozsah, který používá Tailscale (a také CGNAT u některých poskytovatelů / eduroamu).
function isCgnatRange(ip) {
  const m = /^100\.(\d+)\./.exec(ip);
  return !!m && Number(m[1]) >= 64 && Number(m[1]) <= 127;
}

// Informace z Tailscale CLI (pokud je nainstalované) – obnovuje se na pozadí.
const ts = { ips: new Set(), dnsName: null, online: null };

const TS_CANDIDATES = process.platform === 'darwin'
  ? ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale']
  : process.platform === 'win32'
    ? ['C:\\Program Files\\Tailscale\\tailscale.exe', 'tailscale']
    : ['/usr/bin/tailscale', '/usr/local/bin/tailscale', 'tailscale'];

function refreshTailscale() {
  return new Promise(resolve => {
    const bins = TS_CANDIDATES.filter(p => !p.includes('/') && !p.includes('\\') ? true : fs.existsSync(p));
    const tryNext = i => {
      if (i >= bins.length) return resolve(ts);
      execFile(bins[i], ['status', '--json'], { timeout: 4000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
        if (err) return tryNext(i + 1);
        try {
          const s = JSON.parse(stdout);
          const self = s.Self || {};
          ts.ips = new Set((self.TailscaleIPs || s.TailscaleIPs || []).filter(ip => ip.includes('.')));
          ts.dnsName = self.DNSName ? String(self.DNSName).replace(/\.$/, '').toLowerCase() : null;
          ts.online = s.BackendState === 'Running';
        } catch { /* neznámý výstup – spolehneme se na rozhraní */ }
        resolve(ts);
      });
    };
    tryNext(0);
  });
}

function addresses() {
  const lan = [];
  const tailscale = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal || a.address.startsWith('169.254.')) continue;
      const isTs = ts.ips.has(a.address) || (isCgnatRange(a.address) && TAILSCALE_IF.test(name));
      if (isTs) { tailscale.push({ address: a.address, name }); continue; }
      const priv = PRIVATE_LAN.test(a.address);
      const score = (priv ? 0 : 2) + (VIRTUAL_IF.test(name) ? 1 : 0) + (a.address.startsWith('192.168.') ? 0 : 0.5);
      lan.push({ address: a.address, name, score });
    }
  }
  lan.sort((x, y) => x.score - y.score);
  return { lan, tailscale };
}

// Adresa mimo běžné domácí rozsahy obvykle znamená síť, kde se zařízení navzájem nevidí.
function lanWarning(lan, hasTailscale) {
  const best = lan[0];
  if (best && PRIVATE_LAN.test(best.address) && !VIRTUAL_IF.test(best.name)) return null;
  const tsHint = hasTailscale
    ? ' Telefon se ale připojí přes Tailscale (musí mít zapnutou aplikaci Tailscale).'
    : ' Použijte domácí Wi-Fi, nebo na telefonu zapněte Osobní hotspot a připojte k němu počítač.';
  if (!best) return hasTailscale ? null : 'Počítač není připojený k žádné síti.';
  return `Počítač nevypadá připojený k běžné domácí Wi-Fi (adresa ${best.address}). Ve školních a firemních sítích ` +
    '(eduroam, hotel, kancelář) se zařízení navzájem nevidí, takže přes Wi-Fi se telefon nepřipojí.' + tsHint;
}

function isTailscaleHost(h) {
  return h.endsWith('.ts.net') || (ts.dnsName && h === ts.dnsName);
}

module.exports = { addresses, lanWarning, refreshTailscale, isTailscaleHost, tailscaleInfo: () => ts, VIRTUAL_IF };
