'use strict';
// QR kód do terminálu (půlbloky, černá na bílé) a jako SVG pro webové rozhraní.
const qrcode = require('./vendor/qrcode');

function matrix(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  const m = [];
  for (let r = 0; r < n; r++) {
    const row = [];
    for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
    m.push(row);
  }
  return m;
}

function toTerminal(text) {
  const m = matrix(text);
  const q = 2; // tichá zóna
  const n = m.length + q * 2;
  const dark = (r, c) => r >= q && c >= q && r < n - q && c < n - q && m[r - q][c - q];
  const lines = [];
  for (let r = 0; r < n; r += 2) {
    let line = '\x1b[47m\x1b[30m';
    for (let c = 0; c < n; c++) {
      const top = dark(r, c);
      const bottom = r + 1 < n && dark(r + 1, c);
      line += top && bottom ? '█' : top ? '▀' : bottom ? '▄' : ' ';
    }
    lines.push('  ' + line + '\x1b[0m');
  }
  return lines.join('\n');
}

function toSvg(text) {
  const m = matrix(text);
  const q = 4;
  const n = m.length + q * 2;
  let d = '';
  m.forEach((row, r) => row.forEach((on, c) => { if (on) d += `M${c + q} ${r + q}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}

module.exports = { toTerminal, toSvg };
