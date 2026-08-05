/**
 * Minimal WebSocket client for ws:// loopback CDP (no npm deps).
 * Enough for text frames used by Chrome DevTools Protocol.
 */
import net from "node:net";
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

function parseWsUrl(url) {
  const u = new URL(url);
  if (u.protocol !== "ws:") {
    throw new Error(`ws-lite only supports ws:// (got ${u.protocol})`);
  }
  const host = u.hostname === "localhost" ? "127.0.0.1" : u.hostname;
  const port = Number(u.port || 80);
  const path = `${u.pathname || "/"}${u.search || ""}`;
  return { host, port, path };
}

function buildKey() {
  return crypto.randomBytes(16).toString("base64");
}

function acceptKey(key) {
  return crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
}

function encodeTextFrame(text) {
  const payload = Buffer.from(String(text), "utf8");
  const len = payload.length;
  let header;
  const maskKey = crypto.randomBytes(4);
  if (len < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = 0x80 | len;
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 0x80 | 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 0x80 | 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }
  const masked = Buffer.alloc(len);
  for (let i = 0; i < len; i++) masked[i] = payload[i] ^ maskKey[i % 4];
  return Buffer.concat([header, maskKey, masked]);
}

class FrameParser {
  constructor() {
    this.buf = Buffer.alloc(0);
  }

  push(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    const frames = [];
    while (true) {
      if (this.buf.length < 2) break;
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (this.buf.length < 4) break;
        len = this.buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) break;
        len = Number(this.buf.readBigUInt64BE(2));
        offset = 10;
      }
      const maskLen = masked ? 4 : 0;
      if (this.buf.length < offset + maskLen + len) break;
      let payload = this.buf.subarray(offset + maskLen, offset + maskLen + len);
      if (masked) {
        const mask = this.buf.subarray(offset, offset + 4);
        const out = Buffer.alloc(len);
        for (let i = 0; i < len; i++) out[i] = payload[i] ^ mask[i % 4];
        payload = out;
      }
      this.buf = this.buf.subarray(offset + maskLen + len);
      frames.push({ opcode, payload });
    }
    return frames;
  }
}

export class WebSocket extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.socket = null;
    this._open = false;
    queueMicrotask(() => this._connect());
  }

  _connect() {
    const { host, port, path } = parseWsUrl(this.url);
    const key = buildKey();
    const socket = net.connect({ host, port });
    this.socket = socket;
    let handshakeDone = false;
    let headerBuf = Buffer.alloc(0);
    const parser = new FrameParser();

    socket.on("connect", () => {
      const req =
        `GET ${path} HTTP/1.1\r\n` +
        `Host: ${host}:${port}\r\n` +
        `Upgrade: websocket\r\n` +
        `Connection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\n` +
        `Sec-WebSocket-Version: 13\r\n` +
        `\r\n`;
      socket.write(req);
    });

    socket.on("data", (chunk) => {
      if (!handshakeDone) {
        headerBuf = Buffer.concat([headerBuf, chunk]);
        const idx = headerBuf.indexOf("\r\n\r\n");
        if (idx < 0) return;
        const headerText = headerBuf.subarray(0, idx).toString("utf8");
        const rest = headerBuf.subarray(idx + 4);
        handshakeDone = true;
        if (!/^HTTP\/1\.1 101/i.test(headerText)) {
          this.emit("error", new Error(`WS handshake failed: ${headerText.split("\r\n")[0]}`));
          socket.destroy();
          return;
        }
        const m = headerText.match(/Sec-WebSocket-Accept:\s*(.+)/i);
        if (!m || m[1].trim() !== acceptKey(key)) {
          this.emit("error", new Error("WS accept key mismatch"));
          socket.destroy();
          return;
        }
        this._open = true;
        this.emit("open");
        if (rest.length) this._handleFrames(parser, rest);
        return;
      }
      this._handleFrames(parser, chunk);
    });

    socket.on("error", (err) => this.emit("error", err));
    socket.on("close", () => {
      this._open = false;
      this.emit("close");
    });
  }

  _handleFrames(parser, chunk) {
    const frames = parser.push(chunk);
    for (const f of frames) {
      if (f.opcode === 0x1) {
        this.emit("message", f.payload.toString("utf8"));
      } else if (f.opcode === 0x8) {
        this.close();
      } else if (f.opcode === 0x9) {
        // ping -> pong
        const maskKey = crypto.randomBytes(4);
        const len = f.payload.length;
        const header = Buffer.alloc(2);
        header[0] = 0x8a;
        header[1] = 0x80 | len;
        const masked = Buffer.alloc(len);
        for (let i = 0; i < len; i++) masked[i] = f.payload[i] ^ maskKey[i % 4];
        this.socket.write(Buffer.concat([header, maskKey, masked]));
      }
    }
  }

  send(data) {
    if (!this._open || !this.socket) throw new Error("WebSocket not open");
    this.socket.write(encodeTextFrame(data));
  }

  close() {
    if (this.socket) {
      try {
        const maskKey = crypto.randomBytes(4);
        const header = Buffer.from([0x88, 0x80]);
        this.socket.write(Buffer.concat([header, maskKey]));
      } catch {
        /* ignore */
      }
      this.socket.end();
      this.socket.destroy();
    }
    this._open = false;
  }

  on(event, fn) {
    return super.on(event, fn);
  }
}
