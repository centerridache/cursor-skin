/**
 * Minimal ZIP pack/unpack (store + deflate). No extra npm deps.
 * Used by Theme Creator import/export.
 */
import zlib from "node:zlib";

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n >>> 0, 0);
  return b;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

function dosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

function shouldDeflate(name) {
  const lower = String(name || "").toLowerCase();
  return !/\.(jpg|jpeg|png|webp|gif|mp4|webm|zip)$/.test(lower);
}

function safeZipPath(name) {
  return String(name || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .split("/")
    .filter((p) => p && p !== "." && p !== "..")
    .join("/");
}

/**
 * @param {{ name: string, data: Buffer }[]} entries
 * @returns {Buffer}
 */
export function packZip(entries) {
  const { time, date } = dosDateTime();
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const name = safeZipPath(entry.name);
    if (!name) continue;
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data || []);
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);
    const useDeflate = shouldDeflate(name) && data.length > 32;
    const payload = useDeflate ? zlib.deflateRawSync(data) : data;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      u16(20),
      u16(0),
      u16(method),
      u16(time),
      u16(date),
      u32(crc),
      u32(payload.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      payload,
    ]);

    const central = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
      u16(20),
      u16(20),
      u16(0),
      u16(method),
      u16(time),
      u16(date),
      u32(crc),
      u32(payload.length),
      u32(data.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ]);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    u16(0),
    u16(0),
    u16(centrals.length),
    u16(centrals.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);

  return Buffer.concat([...locals, centralDir, eocd]);
}

function findEocd(buf) {
  const sig = 0x06054b50;
  const min = Math.max(0, buf.length - 22 - 65535);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === sig) return i;
  }
  return -1;
}

/**
 * @param {Buffer} buf
 * @returns {{ name: string, data: Buffer }[]}
 */
export function unpackZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error("not a zip");
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error("zip: missing central directory");
  const count = buf.readUInt16LE(eocd + 10);
  let cdOff = buf.readUInt32LE(eocd + 16);
  const out = [];

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(cdOff) !== 0x02014b50) throw new Error("zip: bad central header");
    const method = buf.readUInt16LE(cdOff + 10);
    const compSize = buf.readUInt32LE(cdOff + 20);
    const uncompSize = buf.readUInt32LE(cdOff + 24);
    const nameLen = buf.readUInt16LE(cdOff + 28);
    const extraLen = buf.readUInt16LE(cdOff + 30);
    const commentLen = buf.readUInt16LE(cdOff + 32);
    const localOff = buf.readUInt32LE(cdOff + 42);
    const name = buf.slice(cdOff + 46, cdOff + 46 + nameLen).toString("utf8");
    cdOff += 46 + nameLen + extraLen + commentLen;

    const rel = safeZipPath(name);
    if (!rel || rel.endsWith("/")) continue;
    if (buf.readUInt32LE(localOff) !== 0x04034b50) throw new Error("zip: bad local header");
    const localNameLen = buf.readUInt16LE(localOff + 26);
    const localExtra = buf.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + localNameLen + localExtra;
    const compressed = buf.slice(dataStart, dataStart + compSize);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = zlib.inflateRawSync(compressed);
    else throw new Error(`zip: unsupported method ${method} (${rel})`);
    if (uncompSize && data.length !== uncompSize) {
      /* some writers lie; keep inflated bytes */
    }
    out.push({ name: rel, data });
  }
  return out;
}
