'use strict';
// Minimální ZIP zapisovač (metoda STORE – média jsou už komprimovaná). Podporuje ZIP64 pro velké soubory.
const fs = require('fs');
const { pipeline } = require('stream/promises');
const { Transform } = require('stream');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32Update(crc, buf) {
  let c = crc ^ 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function fileCrc(p) {
  let crc = 0;
  await pipeline(fs.createReadStream(p), new Transform({
    transform(chunk, _e, cb) { crc = crc32Update(crc, chunk); cb(); }
  }));
  return crc;
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

const MAX32 = 0xffffffff;

// entries: [{ path: zdrojový soubor, name: název v archivu }]
async function createZip(outPath, entries, isCanceled = () => false) {
  const fd = await fs.promises.open(outPath, 'w');
  let offset = 0;
  const central = [];
  const { time, date } = dosDateTime(new Date());
  const write = async buf => { await fd.write(buf, 0, buf.length, offset); offset += buf.length; };
  try {
    for (const e of entries) {
      if (isCanceled()) throw new Error('canceled');
      const size = (await fs.promises.stat(e.path)).size;
      const crc = await fileCrc(e.path);
      const nameBuf = Buffer.from(e.name, 'utf8');
      const zip64 = size >= MAX32 || offset >= MAX32;
      const localOffset = offset;

      // Lokální hlavička
      const localExtra = zip64 ? Buffer.alloc(20) : Buffer.alloc(0);
      if (zip64) {
        localExtra.writeUInt16LE(0x0001, 0);
        localExtra.writeUInt16LE(16, 2);
        localExtra.writeBigUInt64LE(BigInt(size), 4);
        localExtra.writeBigUInt64LE(BigInt(size), 12);
      }
      const lh = Buffer.alloc(30);
      lh.writeUInt32LE(0x04034b50, 0);
      lh.writeUInt16LE(zip64 ? 45 : 20, 4);
      lh.writeUInt16LE(0x0800, 6);             // UTF-8 názvy
      lh.writeUInt16LE(0, 8);                  // STORE
      lh.writeUInt16LE(time, 10);
      lh.writeUInt16LE(date, 12);
      lh.writeUInt32LE(crc, 14);
      lh.writeUInt32LE(zip64 ? MAX32 : size, 18);
      lh.writeUInt32LE(zip64 ? MAX32 : size, 22);
      lh.writeUInt16LE(nameBuf.length, 26);
      lh.writeUInt16LE(localExtra.length, 28);
      await write(Buffer.concat([lh, nameBuf, localExtra]));

      // Data
      const rs = fs.createReadStream(e.path, { highWaterMark: 1 << 20 });
      for await (const chunk of rs) {
        if (isCanceled()) { rs.destroy(); throw new Error('canceled'); }
        await write(chunk);
      }
      central.push({ nameBuf, crc, size, localOffset });
    }

    // Centrální adresář
    const cdStart = offset;
    for (const c of central) {
      const needSize = c.size >= MAX32;
      const needOff = c.localOffset >= MAX32;
      const extraLen = (needSize ? 16 : 0) + (needOff ? 8 : 0);
      const extra = Buffer.alloc(extraLen ? 4 + extraLen : 0);
      if (extraLen) {
        extra.writeUInt16LE(0x0001, 0);
        extra.writeUInt16LE(extraLen, 2);
        let p = 4;
        if (needSize) { extra.writeBigUInt64LE(BigInt(c.size), p); extra.writeBigUInt64LE(BigInt(c.size), p + 8); p += 16; }
        if (needOff) extra.writeBigUInt64LE(BigInt(c.localOffset), p);
      }
      const ch = Buffer.alloc(46);
      ch.writeUInt32LE(0x02014b50, 0);
      ch.writeUInt16LE(extraLen ? 45 : 20, 4);   // verze „made by“
      ch.writeUInt16LE(extraLen ? 45 : 20, 6);   // potřebná verze
      ch.writeUInt16LE(0x0800, 8);
      ch.writeUInt16LE(0, 10);
      ch.writeUInt16LE(time, 12);
      ch.writeUInt16LE(date, 14);
      ch.writeUInt32LE(c.crc, 16);
      ch.writeUInt32LE(needSize ? MAX32 : c.size, 20);
      ch.writeUInt32LE(needSize ? MAX32 : c.size, 24);
      ch.writeUInt16LE(c.nameBuf.length, 28);
      ch.writeUInt16LE(extra.length, 30);
      ch.writeUInt16LE(0, 32);
      ch.writeUInt16LE(0, 34);
      ch.writeUInt16LE(0, 36);
      ch.writeUInt32LE(0, 38);
      ch.writeUInt32LE(needOff ? MAX32 : c.localOffset, 42);
      await write(Buffer.concat([ch, c.nameBuf, extra]));
    }
    const cdSize = offset - cdStart;
    const needZip64End = central.length >= 0xffff || cdStart >= MAX32 || cdSize >= MAX32;

    if (needZip64End) {
      const z64Offset = offset;
      const z = Buffer.alloc(56);
      z.writeUInt32LE(0x06064b50, 0);
      z.writeBigUInt64LE(44n, 4);
      z.writeUInt16LE(45, 12);
      z.writeUInt16LE(45, 14);
      z.writeUInt32LE(0, 16);
      z.writeUInt32LE(0, 20);
      z.writeBigUInt64LE(BigInt(central.length), 24);
      z.writeBigUInt64LE(BigInt(central.length), 32);
      z.writeBigUInt64LE(BigInt(cdSize), 40);
      z.writeBigUInt64LE(BigInt(cdStart), 48);
      const loc = Buffer.alloc(20);
      loc.writeUInt32LE(0x07064b50, 0);
      loc.writeUInt32LE(0, 4);
      loc.writeBigUInt64LE(BigInt(z64Offset), 8);
      loc.writeUInt32LE(1, 16);
      await write(Buffer.concat([z, loc]));
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(Math.min(central.length, 0xffff), 8);
    end.writeUInt16LE(Math.min(central.length, 0xffff), 10);
    end.writeUInt32LE(Math.min(cdSize, MAX32), 12);
    end.writeUInt32LE(Math.min(cdStart, MAX32), 16);
    end.writeUInt16LE(0, 20);
    await write(end);
  } finally {
    await fd.close();
  }
}

module.exports = { createZip };
