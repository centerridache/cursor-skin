#!/usr/bin/env node
/**
 * Cursor Dream Skin — CDP injector daemon (v0.3 Theme Runtime).
 * Connects to Cursor's loopback debugging port, injects Skin Runtime.
 * Watch mode: CDP target events + sparse health + light drain (not 4s full poll).
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { WebSocket } from "./ws-lite.mjs";
import { createMediaServer } from "./media-server.mjs";
import { resolveWallpaperInput, findRepkgExe } from "./workshop-resolve.mjs";
import { loadAdapter } from "./load-adapter.mjs";
import { normalizeThemePack, isVideoPath } from "./theme-schema.mjs";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MAX_WALLPAPER_BYTES = 200 * 1024 * 1024; // still images via disk path
const MAX_VIDEO_BYTES = 8 * 1024 * 1024 * 1024; // mp4/webm streamed in place (no full copy)
const WALLPAPER_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXTS = new Set([".mp4", ".webm"]);
const mediaServer = createMediaServer();

function parseArgs(argv) {
  const out = {
    port: 9342,
    themeDir: path.join(ROOT, "assets"),
    themesDir: path.join(ROOT, "themes"),
    adapterPath: path.join(ROOT, "adapters", "cursor", "default.json"),
    stateDir: "",
    settingsPath: "",
    /** @deprecated use healthMs — kept as fallback alias */
    pollMs: 0,
    drainMs: 2000,
    healthMs: 30000,
    once: false,
    remove: false,
    verify: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--port" && next) {
      out.port = Number(next);
      i++;
    } else if (a === "--theme-dir" && next) {
      out.themeDir = path.resolve(next);
      i++;
    } else if (a === "--themes-dir" && next) {
      out.themesDir = path.resolve(next);
      i++;
    } else if (a === "--adapter" && next) {
      out.adapterPath = path.resolve(next);
      i++;
    } else if (a === "--state-dir" && next) {
      out.stateDir = path.resolve(next);
      i++;
    } else if (a === "--settings-path" && next) {
      out.settingsPath = path.resolve(next);
      i++;
    } else if (a === "--poll-ms" && next) {
      out.pollMs = Number(next);
      i++;
    } else if (a === "--drain-ms" && next) {
      out.drainMs = Number(next);
      i++;
    } else if (a === "--health-ms" && next) {
      out.healthMs = Number(next);
      i++;
    } else if (a === "--once") {
      out.once = true;
    } else if (a === "--remove") {
      out.remove = true;
    } else if (a === "--verify") {
      out.verify = true;
    }
  }
  if (out.pollMs > 0 && out.healthMs === 30000) {
    out.healthMs = out.pollMs;
  }
  return out;
}

function log(...args) {
  const line = `[cds-injector ${new Date().toISOString()}] ${args.join(" ")}`;
  console.log(line);
  if (globalThis.__cdsLogPath) {
    try {
      fs.appendFileSync(globalThis.__cdsLogPath, line + "\n", "utf8");
    } catch {
      /* ignore */
    }
  }
}

function fetchJson(url, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (body += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`timeout ${url}`));
    });
  });
}

function isLoopbackWs(url, port) {
  try {
    const u = new URL(url);
    if (u.protocol !== "ws:" && u.protocol !== "wss:") return false;
    const host = u.hostname;
    if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(host)) return false;
    if (Number(u.port) !== Number(port) && u.port !== "") return false;
    return /\/devtools\/(page|browser)\//.test(u.pathname);
  } catch {
    return false;
  }
}

function isWorkbenchTarget(t) {
  if (!t || t.type !== "page") return false;
  const url = String(t.url || "").toLowerCase();
  return url.includes("workbench");
}

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.eventHandlers = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.on("open", () => resolve());
      this.ws.on("error", reject);
      this.ws.on("message", (data) => {
        let msg;
        try {
          msg = JSON.parse(String(data));
        } catch {
          return;
        }
        if (msg.method) {
          const set = this.eventHandlers.get(msg.method);
          if (set) {
            for (const fn of set) {
              try {
                fn(msg.params || {});
              } catch {
                /* ignore listener errors */
              }
            }
          }
          return;
        }
        if (msg.id != null && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(JSON.stringify(msg.error)));
          else res(msg.result);
        }
      });
    });
  }

  onEvent(method, fn) {
    if (!this.eventHandlers.has(method)) this.eventHandlers.set(method, new Set());
    this.eventHandlers.get(method).add(fn);
    return () => this.eventHandlers.get(method)?.delete(fn);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(payload);
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout ${method}`));
        }
      }, 60000);
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.text || "Runtime.evaluate exception"
      );
    }
    return result?.result?.value;
  }

  close() {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}

function mimeForExt(ext) {
  const e = String(ext || "").toLowerCase();
  if (e === ".png") return "image/png";
  if (e === ".webp") return "image/webp";
  if (e === ".gif") return "image/gif";
  return "image/jpeg";
}

function imageDataUrlFromPath(imagePath) {
  const buf = fs.readFileSync(imagePath);
  const ext = path.extname(imagePath).toLowerCase();
  return `data:${mimeForExt(ext)};base64,${buf.toString("base64")}`;
}

function readPalettes(themeDir) {
  const p = path.join(themeDir, "palettes.json");
  if (!fs.existsSync(p)) {
    return { titleBar: {}, palettes: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return { titleBar: {}, palettes: [] };
  }
}

function readTheme(themeDir, wallpaperOverridePath) {
  const themePath = path.join(themeDir, "theme.json");
  const cssPath = path.join(themeDir, "dream-skin.css");
  const theme = JSON.parse(fs.readFileSync(themePath, "utf8"));
  const cssText = fs.readFileSync(cssPath, "utf8");
  const imageName = theme.image || "dream-reference.jpg";
  const defaultImagePath = path.join(themeDir, imageName);
  const imagePath =
    wallpaperOverridePath && fs.existsSync(wallpaperOverridePath)
      ? wallpaperOverridePath
      : defaultImagePath;
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Theme image missing: ${imagePath}`);
  }
  const imageDataUrl = imageDataUrlFromPath(imagePath);
  const injectPath = path.join(themeDir, "renderer-inject.js");
  const injectSource = fs.readFileSync(injectPath, "utf8");
  const paletteDoc = readPalettes(themeDir);
  return {
    theme,
    cssText,
    imageDataUrl,
    injectSource,
    imagePath,
    defaultImagePath,
    paletteDoc,
  };
}

function wallpaperMetaPath(stateDir) {
  return path.join(stateDir, "active-wallpaper.json");
}

function paletteMetaPath(stateDir) {
  return path.join(stateDir, "active-palette.json");
}

function themePackMetaPath(stateDir) {
  return path.join(stateDir, "active-theme-pack.json");
}

function readJsonSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function loadThemePackFromDir(dir) {
  const themePath = path.join(dir, "theme.json");
  if (!fs.existsSync(themePath)) return null;
  const raw = readJsonSafe(themePath);
  if (!raw || typeof raw !== "object") return null;
  const norm = normalizeThemePack(raw, { dirName: path.basename(dir) });
  if (!norm.ok) {
    log(`theme pack skip ${path.basename(dir)}: ${norm.reason}`);
    return null;
  }
  const wallPath = path.resolve(dir, norm.wallpaperSrc);
  if (!fs.existsSync(wallPath)) {
    log(`theme pack skip ${norm.id}: missing wallpaper ${norm.wallpaperSrc}`);
    return null;
  }
  const ext = path.extname(wallPath).toLowerCase();
  const type =
    norm.wallpaperTypeHint === "video" || VIDEO_EXTS.has(ext) || isVideoPath(wallPath)
      ? "video"
      : "image";
  const previewPath = path.resolve(dir, norm.previewRel);
  return {
    id: norm.id,
    name: norm.name,
    dir,
    schemaVersion: norm.schemaVersion,
    format: norm.format || "",
    tagline: norm.tagline,
    brandSubtitle: norm.brandSubtitle,
    author: norm.author || "",
    description: norm.description || "",
    themeVersion: norm.themeVersion || "1.0.0",
    wallpaperType: type,
    wallpaperPath: wallPath,
    previewPath: fs.existsSync(previewPath) ? previewPath : wallPath,
    baseTheme: norm.baseTheme,
    scheme: norm.scheme,
    paletteId: norm.paletteId,
    frost: norm.frost,
    art: norm.art,
    veil: norm.veil,
    surfaces: norm.surfaces || null,
    colors: norm.colors,
    effects: norm.effects || null,
    performance: norm.performance || { tier: "balanced" },
    workspace: norm.workspace,
  };
}

function scanThemePacks(themesDir) {
  if (!themesDir || !fs.existsSync(themesDir)) return [];
  const out = [];
  for (const name of fs.readdirSync(themesDir)) {
    const dir = path.join(themesDir, name);
    let st;
    try {
      st = fs.statSync(dir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const pack = loadThemePackFromDir(dir);
    if (pack) out.push(pack);
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function findThemePack(packs, packId) {
  if (!packId) return null;
  return packs.find((p) => p.id === packId) || null;
}

function themePackCatalog(packs) {
  return (packs || []).map((p) => ({
    id: p.id,
    name: p.name,
    tagline: p.tagline || p.description || "",
    scheme: p.scheme || "dark",
    schemaVersion: p.schemaVersion || 1,
    format: p.format || "",
    author: p.author || "",
    version: p.themeVersion || "1.0.0",
    performance: p.performance?.tier || "balanced",
  }));
}

function writeActiveThemePack(stateDir, { packId, customOverride }) {
  if (!stateDir) return;
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    themePackMetaPath(stateDir),
    JSON.stringify(
      {
        packId: packId || "",
        customOverride: !!customOverride,
        updatedAt: new Date().toISOString(),
      },
      null,
      2
    ) + "\n"
  );
}

function readActiveThemePack(stateDir) {
  return readJsonSafe(themePackMetaPath(stateDir)) || { packId: "", customOverride: false };
}

async function applyThemePackMedia(stateDir, pack) {
  if (pack.wallpaperType === "video") {
    const meta = installVideo(stateDir, pack.wallpaperPath, pack.name);
    const videoUrl = await ensureMediaForMeta(meta);
    return {
      meta,
      videoUrl,
      imageUrl: "",
      wallpaperLabel: pack.name,
      posterKey: mediaPosterKey(meta),
      mediaEpoch: Date.now(),
    };
  }
  const meta = installWallpaper(stateDir, pack.wallpaperPath, pack.name);
  const imageUrl = await ensureMediaForMeta(meta);
  return {
    meta,
    videoUrl: "",
    imageUrl,
    wallpaperLabel: pack.name,
    posterKey: mediaPosterKey(meta),
    mediaEpoch: Date.now(),
  };
}

function loadActiveWallpaperPath(stateDir) {
  if (!stateDir) return null;
  const meta = readJsonSafe(wallpaperMetaPath(stateDir));
  if (!meta || !meta.storedPath) return null;
  if (!fs.existsSync(meta.storedPath)) return null;
  const ext = path.extname(meta.storedPath).toLowerCase();
  if (!meta.kind) {
    meta.kind = VIDEO_EXTS.has(ext) ? "video" : "image";
  }
  return meta;
}

function assertSafeMediaFile(srcPath, { video }) {
  if (!srcPath || typeof srcPath !== "string") {
    throw new Error("wallpaper path required");
  }
  const resolved = path.resolve(srcPath.trim().replace(/^["']|["']$/g, ""));
  const ext = path.extname(resolved).toLowerCase();
  const allowed = video ? VIDEO_EXTS : WALLPAPER_EXTS;
  if (!allowed.has(ext)) {
    throw new Error(`unsupported wallpaper extension: ${ext || "(none)"} (${resolved})`);
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`wallpaper path not found: ${resolved}`);
  }
  // Follow links / OneDrive reparse points — lstat-only rejects valid media.
  const st = fs.statSync(resolved);
  if (!st.isFile()) {
    throw new Error(`wallpaper must be a regular file: ${resolved}`);
  }
  const size = Number(st.size);
  const max = video ? MAX_VIDEO_BYTES : MAX_WALLPAPER_BYTES;
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error(
      `wallpaper file is empty (0 bytes): ${resolved}` +
        ` — if this is OneDrive/cloud, mark “Always keep on this device” and retry`
    );
  }
  if (size > max) {
    throw new Error(
      `wallpaper too large (${size} bytes > max ${max}): ${path.basename(resolved)}`
    );
  }
  if (video) {
    const fd = fs.openSync(resolved, "r");
    try {
      const head = Buffer.alloc(12);
      const n = fs.readSync(fd, head, 0, 12, 0);
      if (n < 8) {
        throw new Error(`wallpaper file unreadable (short read): ${resolved}`);
      }
      const isWebm = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
      if (ext === ".webm" && !isWebm) {
        throw new Error("webm magic bytes mismatch");
      }
      // mp4 may start with non-ftyp boxes — extension + size already validated
    } finally {
      fs.closeSync(fd);
    }
  }
  return { resolved, ext, size };
}

function assertSafeImageFile(srcPath) {
  return assertSafeMediaFile(srcPath, { video: false });
}

function installWallpaper(stateDir, srcPath, displayName) {
  if (!stateDir) throw new Error("stateDir required for wallpaper");
  const { resolved, ext, size } = assertSafeImageFile(srcPath);
  const dir = path.join(stateDir, "wallpapers");
  fs.mkdirSync(dir, { recursive: true });
  // Clear previous video when switching to image
  for (const name of fs.readdirSync(dir)) {
    if (/^custom\.(mp4|webm)$/i.test(name)) {
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch {
        /* ignore */
      }
    }
  }
  const dest = path.join(dir, `custom${ext}`);
  fs.copyFileSync(resolved, dest);
  const meta = {
    kind: "image",
    sourcePath: resolved,
    storedPath: dest,
    name: displayName || path.basename(resolved),
    mime: mimeForExt(ext),
    size,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(wallpaperMetaPath(stateDir), JSON.stringify(meta, null, 2) + "\n");
  return meta;
}

function installVideo(stateDir, srcPath, displayName) {
  if (!stateDir) throw new Error("stateDir required for video");
  const { resolved, ext, size } = assertSafeMediaFile(srcPath, { video: true });
  // Serve the original file in place — copying 200MB+ WE packs made uploads feel dead
  // and is unnecessary for a loopback media server.
  const dir = path.join(stateDir, "wallpapers");
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(dir)) {
    if (/^custom\.(mp4|webm)$/i.test(name)) {
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch {
        /* ignore */
      }
    }
  }
  const meta = {
    kind: "video",
    sourcePath: resolved,
    storedPath: resolved,
    name: displayName || path.basename(resolved),
    mime: ext === ".webm" ? "video/webm" : "video/mp4",
    size,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(wallpaperMetaPath(stateDir), JSON.stringify(meta, null, 2) + "\n");
  return meta;
}

function extForMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("png")) return ".png";
  if (m.includes("webp")) return ".webp";
  if (m.includes("gif")) return ".gif";
  return ".jpg";
}

function installWallpaperFromData(stateDir, { base64, mime, name }) {
  if (!stateDir) throw new Error("stateDir required for wallpaper");
  if (!base64 || typeof base64 !== "string") {
    throw new Error("wallpaper base64 required");
  }
  const buf = Buffer.from(base64, "base64");
  if (buf.length <= 0 || buf.length > MAX_WALLPAPER_BYTES) {
    throw new Error(`wallpaper size out of range (max ${MAX_WALLPAPER_BYTES} bytes)`);
  }
  // Basic magic-byte check
  const isJpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const isPng =
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  const isWebp =
    buf.length > 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP";
  const isGif =
    buf.length > 5 &&
    buf.toString("ascii", 0, 3) === "GIF" &&
    (buf.toString("ascii", 3, 6) === "87a" || buf.toString("ascii", 3, 6) === "89a");
  if (!isJpeg && !isPng && !isWebp && !isGif) {
    throw new Error("wallpaper bytes are not jpeg/png/webp/gif");
  }
  const ext = isPng ? ".png" : isWebp ? ".webp" : isGif ? ".gif" : ".jpg";
  const dir = path.join(stateDir, "wallpapers");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `custom${ext}`);
  fs.writeFileSync(dest, buf);
  const meta = {
    kind: "image",
    sourcePath: "",
    storedPath: dest,
    name: name || `custom${ext}`,
    mime: mime || mimeForExt(ext),
    size: buf.length,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(wallpaperMetaPath(stateDir), JSON.stringify(meta, null, 2) + "\n");
  return meta;
}

function resetWallpaper(stateDir) {
  mediaServer.close();
  if (!stateDir) return;
  const metaPath = wallpaperMetaPath(stateDir);
  if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
  const dir = path.join(stateDir, "wallpapers");
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (/^custom\./i.test(name)) {
        try {
          fs.unlinkSync(path.join(dir, name));
        } catch {
          /* ignore */
        }
      }
    }
  }
}

async function ensureMediaForMeta(meta) {
  if (!meta || !meta.storedPath) {
    mediaServer.close();
    return "";
  }
  if (!fs.existsSync(meta.storedPath)) {
    mediaServer.close();
    return "";
  }
  const ext = path.extname(meta.storedPath).toLowerCase();
  const mime =
    meta.mime ||
    (meta.kind === "video"
      ? ext === ".webm"
        ? "video/webm"
        : "video/mp4"
      : mimeForExt(ext));
  // Reuses existing server+token when the same file is already mounted.
  const started = await mediaServer.start(meta.storedPath, mime);
  if (started.reused) log(`media reuse ${path.basename(meta.storedPath)}`);
  return started.url;
}

async function nativeOpenMediaDialog({ folder } = {}) {
  // Cursor renderer often strips File.path — open a real WinForms/COM dialog from Node.
  // Owned by Cursor HWND + ForceFront so it is not hidden behind maximized Cursor.
  // Folder mode uses Vista IFileOpenDialog (FOS_PICKFOLDERS), not the old tree browser,
  // and not "pick project.json as a file".
  const script = path.join(__dirname, "open-media-dialog.ps1");
  const mode = folder ? "Folder" : "File";
  try {
    const { stdout } = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-STA",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script,
        "-Mode",
        mode,
      ],
      {
        windowsHide: false,
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
      }
    );
    const chosen = String(stdout || "").trim().replace(/^["']|["']$/g, "");
    if (!chosen) return null;
    return chosen;
  } catch (e) {
    if (e && (e.code === 2 || e.status === 2)) return null; // cancelled
    throw e;
  }
}

async function applyWallpaperPath(stateDir, themeDir, filePath, displayName) {
  const repkgExe = findRepkgExe(ROOT);
  const resolved = await resolveWallpaperInput(filePath, {
    root: ROOT,
    stateDir,
    repkgExe,
  });
  const mediaPath = resolved.mediaPath;
  const ext = path.extname(mediaPath).toLowerCase();
  let meta;
  let videoUrl = "";
  let imageUrl = "";
  const label = displayName || resolved.label || path.basename(mediaPath);
  if (VIDEO_EXTS.has(ext)) {
    meta = installVideo(stateDir, mediaPath, label);
    videoUrl = await ensureMediaForMeta(meta);
  } else {
    meta = installWallpaper(stateDir, mediaPath, label);
    imageUrl = await ensureMediaForMeta(meta);
  }
  const themeBundle = readTheme(themeDir, null);
  if (resolved.note) log(`wallpaper note: ${resolved.note}`);
  if (resolved.weType) log(`wallpaper weType: ${resolved.weType}`);
  return {
    meta,
    themeBundle,
    videoUrl,
    imageUrl,
    wallpaperLabel: meta.name || label,
    mediaEpoch: Date.now(),
    posterKey: mediaPosterKey(meta),
  };
}

function readSettings(settingsPath) {
  if (!settingsPath || !fs.existsSync(settingsPath)) return {};
  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeAppearance(settingsPath, { colorTheme, tokens, paletteId, clearPalette }) {
  if (!settingsPath) throw new Error("settingsPath required for appearance switch");
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const current = readSettings(settingsPath);
  if (colorTheme) current["workbench.colorTheme"] = colorTheme;
  const baseTitle = {
    "titleBar.activeBackground": "#00000000",
    "titleBar.inactiveBackground": "#00000000",
    "titleBar.border": "#00000000",
    "commandCenter.background": "#00000000",
  };
  if (clearPalette) {
    current["workbench.colorCustomizations"] = { ...baseTitle };
  } else if (tokens && typeof tokens === "object") {
    current["workbench.colorCustomizations"] = { ...baseTitle, ...tokens };
  } else if (!current["workbench.colorCustomizations"]) {
    current["workbench.colorCustomizations"] = { ...baseTitle };
  } else {
    current["workbench.colorCustomizations"] = {
      ...current["workbench.colorCustomizations"],
      ...baseTitle,
    };
  }
  if (!current["window.titleBarStyle"]) {
    current["window.titleBarStyle"] = "custom";
  }
  fs.writeFileSync(settingsPath, JSON.stringify(current, null, 2) + "\n", "utf8");
  return { colorTheme: current["workbench.colorTheme"], paletteId: paletteId || "" };
}

function findPalette(paletteDoc, paletteId) {
  const list = paletteDoc?.palettes || [];
  return list.find((p) => p.id === paletteId) || null;
}

function paletteCatalog(paletteDoc) {
  return (paletteDoc?.palettes || []).map((p) => ({
    id: p.id,
    label: p.label,
    scheme: p.scheme || "dark",
    baseTheme: p.baseTheme || "Cursor Dark",
    accent: p.tokens?.["button.background"] || p.tokens?.focusBorder || "#6b9fff",
  }));
}

function buildApplyExpression(payload, config) {
  const cfg = JSON.stringify(config);
  return `(() => {
    try {
      const src = ${JSON.stringify(payload)};
      (0, eval)(src);
      return window.__cursorDreamSkin.apply(${cfg});
    } catch (e) {
      return { ok: false, error: String(e), stack: e && e.stack };
    }
  })()`;
}

function buildDrainExpression(payload) {
  // Re-eval when payload version changes so slider/handlers are not stuck on stale closures.
  return `(() => {
    try {
      const src = ${JSON.stringify(payload)};
      const verMatch = /const VERSION\\s*=\\s*(\\d+)/.exec(src);
      const want = verMatch ? Number(verMatch[1]) : 0;
      const have =
        window.__cursorDreamSkin && typeof window.__cursorDreamSkin.version === "number"
          ? window.__cursorDreamSkin.version
          : 0;
      if (!window.__cursorDreamSkin || typeof window.__cursorDreamSkin.drainRequests !== "function" || have !== want) {
        (0, eval)(src);
      }
      if (!window.__cursorDreamSkin || !window.__cursorDreamSkin.drainRequests) return [];
      return window.__cursorDreamSkin.drainRequests();
    } catch (e) {
      return [];
    }
  })()`;
}

function buildMarkAppearanceExpression(payload, { themeId, scheme, paletteId, wallpaperLabel }) {
  return `(() => {
    const src = ${JSON.stringify(payload)};
    (0, eval)(src);
    document.documentElement.setAttribute('data-cds-scheme', ${JSON.stringify(scheme)});
    if (window.__cursorDreamSkin && window.__cursorDreamSkin.apply) {
      try {
        const hud = document.getElementById('cursor-dream-skin-hud');
        if (hud) {
          /* refresh active marks via lightweight apply fields if API exposes setters */
        }
      } catch (e) {}
    }
    const api = window.__cursorDreamSkin;
    if (api && api.apply) {
      /* keep existing css/image; only sync panel markers through probe fields */
    }
    const panel = document.getElementById('cursor-dream-skin-hud');
    if (panel) {
      panel.querySelectorAll('button[data-theme-id]').forEach((btn) => {
        const on = !${JSON.stringify(paletteId || "")} && btn.getAttribute('data-theme-id') === ${JSON.stringify(themeId || "")};
        btn.setAttribute('data-active', on ? '1' : '0');
      });
      panel.querySelectorAll('button[data-palette-id]').forEach((btn) => {
        btn.setAttribute('data-active', btn.getAttribute('data-palette-id') === ${JSON.stringify(paletteId || "")} ? '1' : '0');
      });
      const wall = panel.querySelector('.cds-wall-name');
      if (wall && ${JSON.stringify(wallpaperLabel || "")}) wall.textContent = ${JSON.stringify(wallpaperLabel || "")};
    }
    return { ok: true, themeId: ${JSON.stringify(themeId)}, scheme: ${JSON.stringify(scheme)}, paletteId: ${JSON.stringify(paletteId || "")} };
  })()`;
}

function buildRemoveExpression(payload) {
  return `(() => {
    const src = ${JSON.stringify(payload)};
    (0, eval)(src);
    if (window.__cursorDreamSkin) return window.__cursorDreamSkin.remove();
    return { ok: false, reason: "api-missing" };
  })()`;
}

function buildProbeExpression(payload) {
  return `(() => {
    try {
      if (!window.__cursorDreamSkin || typeof window.__cursorDreamSkin.probe !== "function") {
        const src = ${JSON.stringify(payload)};
        (0, eval)(src);
      }
      return window.__cursorDreamSkin.probe();
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  })()`;
}

function buildEarlyScript(payload, config) {
  return `${payload}
try { window.__cursorDreamSkin.apply(${JSON.stringify(config)}); } catch (e) {}`;
}

async function listTargets(port) {
  const list = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  return Array.isArray(list) ? list : [];
}

async function getBrowserWsUrl(port) {
  try {
    const ver = await fetchJson(`http://127.0.0.1:${port}/json/version`);
    const url = ver?.webSocketDebuggerUrl;
    if (url && isLoopbackWs(url, port)) return url;
  } catch {
    /* fall through */
  }
  const list = await listTargets(port);
  const browser = list.find((t) => t && t.type === "browser" && t.webSocketDebuggerUrl);
  if (browser && isLoopbackWs(browser.webSocketDebuggerUrl, port)) {
    return browser.webSocketDebuggerUrl;
  }
  return "";
}

function isWorkbenchTargetInfo(info) {
  if (!info) return false;
  const type = String(info.type || "");
  if (type && type !== "page") return false;
  const url = String(info.url || "").toLowerCase();
  return url.includes("workbench");
}

/**
 * Long-lived CDP session on the browser target for Target.* discovery events.
 * Only reacts to meaningful workbench create / first-workbench URL — ignores noisy targetInfoChanged spam.
 */
async function connectTargetDiscovery(port, onWorkbenchHint) {
  const wsUrl = await getBrowserWsUrl(port);
  if (!wsUrl) return null;
  const session = new CdpSession(wsUrl);
  await session.connect();
  const knownWorkbench = new Set();
  const notifyCreated = (info) => {
    if (!isWorkbenchTargetInfo(info)) return;
    const id = info.targetId || info.id || "";
    if (id && knownWorkbench.has(id)) return;
    if (id) knownWorkbench.add(id);
    try {
      onWorkbenchHint("created", info);
    } catch {
      /* ignore */
    }
  };
  session.onEvent("Target.targetCreated", (p) => notifyCreated(p.targetInfo));
  session.onEvent("Target.targetInfoChanged", (p) => {
    const info = p.targetInfo;
    if (!isWorkbenchTargetInfo(info)) return;
    const id = info?.targetId || info?.id || "";
    // Only when a target newly becomes a workbench page (e.g. blank → workbench).
    if (id && knownWorkbench.has(id)) return;
    notifyCreated(info);
  });
  session.onEvent("Target.targetDestroyed", (p) => {
    const id = p.targetId;
    if (id) knownWorkbench.delete(id);
    try {
      onWorkbenchHint("destroyed", { targetId: id });
    } catch {
      /* ignore */
    }
  });
  await session.send("Target.setDiscoverTargets", { discover: true });
  return session;
}

async function waitForTargets(port, timeoutMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const list = await listTargets(port);
      const pages = list.filter(isWorkbenchTarget);
      if (pages.length) return pages;
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No workbench targets on port ${port} within ${timeoutMs}ms`);
}

function makeApplyConfig(themeBundle, extra = {}) {
  const paletteId = extra.paletteId || "";
  let paletteTokens = extra.paletteTokens;
  if (paletteTokens === undefined && paletteId) {
    const pal = findPalette(themeBundle.paletteDoc, paletteId);
    paletteTokens = pal?.tokens || null;
  }
  if (paletteTokens === undefined) paletteTokens = null;
  const hasCustomMedia = !!(extra.imageUrl || extra.videoUrl);
  const resetWallpaper = extra.resetWallpaper === true;
  return {
    cssText: themeBundle.cssText,
    // Always ship bundled art as an instant backdrop while custom blob media loads.
    imageDataUrl: themeBundle.imageDataUrl,
    palettes: paletteCatalog(themeBundle.paletteDoc),
    themePacks: [],
    themePackId: "",
    videoUrl: "",
    imageUrl: "",
    posterKey: "",
    posterDataUrl: "",
    selectors: themeBundle.selectors || {},
    regions: themeBundle.regions || {},
    regionAttr: themeBundle.regionAttr || "data-cursor-skin",
    holes: themeBundle.holes || [],
    mappings: themeBundle.mappings || {},
    holeAttr: themeBundle.holeAttr || "data-cursor-skin-hole",
    runtimeVersion: themeBundle.runtimeVersion || "0.3.0",
    ...extra,
    art: extra.art || themeBundle.theme.art || {},
    veil: extra.veil || themeBundle.theme.veil || {},
    themePacks: Array.isArray(extra.themePacks) ? extra.themePacks : [],
    themePackId: typeof extra.themePackId === "string" ? extra.themePackId : "",
    selectors:
      extra.selectors && typeof extra.selectors === "object"
        ? extra.selectors
        : themeBundle.selectors || {},
    regions:
      extra.regions && typeof extra.regions === "object"
        ? extra.regions
        : themeBundle.regions || {},
    regionAttr:
      typeof extra.regionAttr === "string" && extra.regionAttr
        ? extra.regionAttr
        : themeBundle.regionAttr || "data-cursor-skin",
    holeAttr:
      typeof extra.holeAttr === "string" && extra.holeAttr
        ? extra.holeAttr
        : themeBundle.holeAttr || "data-cursor-skin-hole",
    holes: Array.isArray(extra.holes) ? extra.holes : themeBundle.holes || [],
    mappings:
      extra.mappings && typeof extra.mappings === "object"
        ? extra.mappings
        : themeBundle.mappings || {},
    resetWallpaper,
    skipMediaReload: extra.skipMediaReload === true,
    // If custom already on screen and this payload has no custom URLs, don't fall back to default-only.
    preserveCustomMedia: !hasCustomMedia && !resetWallpaper,
    paletteTokens,
  };
}

function mediaPosterKey(meta) {
  if (!meta || !meta.storedPath) return "";
  const base = path.basename(meta.storedPath);
  const size = meta.size || 0;
  const kind = meta.kind || "image";
  const updated = meta.updatedAt || "";
  return `${kind}:${size}:${base}:${updated}`;
}

async function injectTarget(target, port, themeBundle, mode, extraConfig = {}) {
  if (!isLoopbackWs(target.webSocketDebuggerUrl, port)) {
    throw new Error(`Refusing non-loopback debugger URL: ${target.webSocketDebuggerUrl}`);
  }
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.connect();
  try {
    await session.send("Runtime.enable").catch(() => {});
    await session.send("Page.enable").catch(() => {});

    const config = makeApplyConfig(themeBundle, extraConfig);

    if (mode === "remove") {
      return await session.evaluate(buildRemoveExpression(themeBundle.injectSource));
    }
    if (mode === "verify") {
      return await session.evaluate(buildProbeExpression(themeBundle.injectSource));
    }
    if (mode === "drain") {
      return await session.evaluate(buildDrainExpression(themeBundle.injectSource));
    }

    const early = buildEarlyScript(themeBundle.injectSource, config);
    await session
      .send("Page.addScriptToEvaluateOnNewDocument", { source: early })
      .catch(() => {});
    const result = await session.evaluate(
      buildApplyExpression(themeBundle.injectSource, config)
    );
    if (result && result.ok === false) {
      throw new Error(result.error || "apply failed");
    }
    return result;
  } finally {
    session.close();
  }
}

function writeState(stateDir, data) {
  if (!stateDir) return;
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(
    path.join(stateDir, "injector-state.json"),
    JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2)
  );
}

function injectorLockPath(stateDir) {
  return path.join(stateDir, "injector.pid");
}

function processAlive(pid) {
  if (!pid || !Number.isFinite(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** One daemon per stateDir — multiple injectors caused layout thrash / reload storms. */
function acquireInjectorLock(stateDir) {
  if (!stateDir) return;
  fs.mkdirSync(stateDir, { recursive: true });
  const lockFile = injectorLockPath(stateDir);
  const existing = readJsonSafe(lockFile);
  const oldPid = existing && Number(existing.pid);
  if (oldPid && oldPid !== process.pid && processAlive(oldPid)) {
    console.error(
      `[Dream Skin] another injector is already running (pid ${oldPid}). Stop it first.`
    );
    process.exit(1);
  }
  fs.writeFileSync(
    lockFile,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }, null, 2) + "\n"
  );
  const release = () => {
    try {
      const cur = readJsonSafe(lockFile);
      if (cur && Number(cur.pid) === process.pid) fs.unlinkSync(lockFile);
    } catch {
      /* ignore */
    }
  };
  process.on("exit", release);
  process.on("SIGINT", () => {
    release();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    release();
    process.exit(0);
  });
}

async function markAllPages(list, port, themeBundle, appearance) {
  for (const page of list) {
    try {
      if (!isLoopbackWs(page.webSocketDebuggerUrl, port)) continue;
      const session = new CdpSession(page.webSocketDebuggerUrl);
      await session.connect();
      await session.evaluate(
        buildMarkAppearanceExpression(themeBundle.injectSource, appearance)
      );
      session.close();
    } catch (e) {
      log(`mark appearance fail: ${e.message || e}`);
    }
  }
}

async function reapplyAll(list, port, themeBundle, extra) {
  for (const page of list) {
    try {
      await injectTarget(page, port, themeBundle, "apply", extra);
      log(`re-apply ${page.id} (wallpaper/palette)`);
    } catch (e) {
      log(`re-apply fail ${page.id}: ${e.message || e}`);
    }
  }
}

async function appearanceAll(list, port, themeBundle, extra) {
  // Theme/palette only: refresh tint + scheme, do not reload wallpaper media.
  for (const page of list) {
    try {
      if (!isLoopbackWs(page.webSocketDebuggerUrl, port)) continue;
      const session = new CdpSession(page.webSocketDebuggerUrl);
      await session.connect();
      try {
        await session.send("Runtime.enable").catch(() => {});
        const config = makeApplyConfig(themeBundle, {
          ...extra,
          skipMediaReload: true,
          preserveCustomMedia: true,
        });
        const result = await session.evaluate(
          buildApplyExpression(themeBundle.injectSource, config)
        );
        if (result && result.ok === false) {
          throw new Error(result.error || "appearance apply failed");
        }
        log(`appearance ${page.id}`);
      } finally {
        session.close();
      }
    } catch (e) {
      log(`appearance fail ${page.id}: ${e.message || e}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.stateDir) {
    fs.mkdirSync(args.stateDir, { recursive: true });
    globalThis.__cdsLogPath = path.join(args.stateDir, "injector.log");
    if (!args.once && !args.verify && !args.remove) {
      acquireInjectorLock(args.stateDir);
    }
  }

  const wallMeta = loadActiveWallpaperPath(args.stateDir);
  // Always keep bundled default as CSS poster; custom media streams from loopback
  const adapter = loadAdapter(args.adapterPath);
  let themeBundle = readTheme(args.themeDir, null);
  themeBundle.selectors = adapter.selectors;
  themeBundle.regions = adapter.regions;
  themeBundle.regionAttr = adapter.attr;
  themeBundle.holes = adapter.holes;
  themeBundle.mappings = adapter.mappings;
  themeBundle.holeAttr = adapter.holeAttr;
  themeBundle.runtimeVersion = "0.3.0";
  log(
    `adapter=${adapter.id} cursor=${adapter.cursorVersion}${adapter.path ? " file=" + path.basename(adapter.path) : ""}`
  );
  const themePacks = scanThemePacks(args.themesDir);
  log(
    `theme packs: ${themePacks.length}${
      themePacks.length ? " [" + themePacks.map((p) => p.id).join(", ") + "]" : ""
    }`
  );
  const savedPackState = args.stateDir ? readActiveThemePack(args.stateDir) : { packId: "", customOverride: false };
  let currentThemePackId = savedPackState.packId || "";
  let packCustomOverride = !!savedPackState.customOverride;
  let packArt = null;
  let packVeil = null;
  let packSurfaces = null;
  let packFrost;
  let packInlineColors = null;
  const bootPack = findThemePack(themePacks, currentThemePackId);
  if (bootPack) {
    packArt = bootPack.art;
    packVeil = bootPack.veil;
    packSurfaces = bootPack.surfaces || null;
    if (typeof bootPack.frost === "number") packFrost = bootPack.frost;
    if (bootPack.colors) packInlineColors = bootPack.colors;
  }

  let wallpaperLabel = wallMeta?.name || "Default";
  let videoUrl = "";
  let imageUrl = "";
  let mediaEpoch = 0;
  let posterKey = wallMeta ? mediaPosterKey(wallMeta) : "";
  try {
    if (wallMeta?.kind === "video") {
      videoUrl = await ensureMediaForMeta(wallMeta);
      mediaEpoch = Date.now();
    } else if (wallMeta?.kind === "image") {
      imageUrl = await ensureMediaForMeta(wallMeta);
      mediaEpoch = Date.now();
    } else if (bootPack && !packCustomOverride) {
      const applied = await applyThemePackMedia(args.stateDir, bootPack);
      videoUrl = applied.videoUrl;
      imageUrl = applied.imageUrl;
      wallpaperLabel = applied.wallpaperLabel;
      mediaEpoch = applied.mediaEpoch;
      posterKey = applied.posterKey;
    }
  } catch (e) {
    log(`media server fail: ${e.message || e}`);
  }

  if (bootPack && !packCustomOverride) {
    wallpaperLabel = bootPack.name;
  }

  const mode = args.remove ? "remove" : args.verify ? "verify" : "apply";

  const settings = args.settingsPath ? readSettings(args.settingsPath) : {};
  let currentThemeId = settings["workbench.colorTheme"] || "Cursor Dark";
  let currentScheme =
    /light/i.test(currentThemeId) && !/high contrast/i.test(currentThemeId)
      ? "light"
      : "dark";
  let currentPaletteId = "";
  const savedPalette = args.stateDir ? readJsonSafe(paletteMetaPath(args.stateDir)) : null;
  if (savedPalette?.paletteId) {
    const pal = findPalette(themeBundle.paletteDoc, savedPalette.paletteId);
    if (pal) {
      currentPaletteId = pal.id;
      currentThemeId = pal.baseTheme || currentThemeId;
      currentScheme = pal.scheme === "light" ? "light" : "dark";
    }
  }
  if (bootPack && !packCustomOverride) {
    currentThemeId = bootPack.baseTheme || currentThemeId;
    currentScheme = bootPack.scheme || currentScheme;
    if (bootPack.colors) {
      currentPaletteId = "";
      packInlineColors = bootPack.colors;
    } else if (bootPack.paletteId) {
      const pal = findPalette(themeBundle.paletteDoc, bootPack.paletteId);
      if (pal) {
        currentPaletteId = pal.id;
        currentThemeId = pal.baseTheme || currentThemeId;
        currentScheme = pal.scheme === "light" ? "light" : "dark";
      }
    }
  }

  log(
    `mode=${mode} port=${args.port} theme=${themeBundle.theme.id} colorTheme=${currentThemeId} wallpaper=${wallpaperLabel}${videoUrl ? " video=on" : ""}${imageUrl ? " image=on" : ""}${currentThemePackId ? " pack=" + currentThemePackId : ""}`
  );
  if (args.settingsPath) log(`settings=${args.settingsPath}`);

  const pages = await waitForTargets(args.port);
  log(`found ${pages.length} workbench target(s)`);

  const buildExtra = (more = {}) => ({
    themeId: currentThemeId,
    scheme: currentScheme,
    paletteId: currentPaletteId,
    wallpaperLabel,
    videoUrl,
    imageUrl,
    mediaEpoch,
    posterKey,
    themePacks: themePackCatalog(themePacks),
    themePackId: packCustomOverride ? "" : currentThemePackId,
    art: packArt || undefined,
    veil: packVeil || undefined,
    surfaces: packSurfaces || undefined,
    frost: packFrost,
    paletteTokens: packInlineColors || undefined,
    selectors: adapter.selectors,
    regions: adapter.regions,
    regionAttr: adapter.attr,
    holes: adapter.holes,
    mappings: adapter.mappings,
    holeAttr: adapter.holeAttr,
    runtimeVersion: "0.3.0",
    ...more,
  });

  const extra = buildExtra();
  const results = [];
  for (const t of pages) {
    try {
      const r = await injectTarget(t, args.port, themeBundle, mode, extra);
      results.push({ id: t.id, title: t.title, ok: true, result: r });
      log(`target ${t.id}: ok`);
    } catch (e) {
      results.push({ id: t.id, title: t.title, ok: false, error: String(e.message || e) });
      log(`target ${t.id}: FAIL ${e.message || e}`);
    }
  }

  writeState(args.stateDir, {
    pid: process.pid,
    port: args.port,
    mode,
    themeId: themeBundle.theme.id,
    colorTheme: currentThemeId,
    paletteId: currentPaletteId,
    wallpaperLabel,
    results,
  });

  if (mode === "verify") {
    const ok = results.some(
      (r) =>
        r.ok &&
        r.result &&
        r.result.skinActive &&
        r.result.rootPresent &&
        r.result.stylePresent
    );
    if (!ok) {
      console.error(JSON.stringify({ ok: false, results }, null, 2));
      process.exit(2);
    }
    console.log(JSON.stringify({ ok: true, results }, null, 2));
    process.exit(0);
  }

  if (args.once || mode === "remove") {
    if (mode === "remove") mediaServer.close();
    process.exit(results.every((r) => r.ok) ? 0 : 1);
  }

  const seen = new Map();
  const missStreak = new Map();
  for (const t of pages) seen.set(t.id, Date.now());

  const bindBundle = (bundle) => {
    themeBundle = bundle;
    themeBundle.selectors = adapter.selectors;
    themeBundle.regions = adapter.regions;
    themeBundle.regionAttr = adapter.attr;
    themeBundle.holes = adapter.holes;
    themeBundle.mappings = adapter.mappings;
    themeBundle.holeAttr = adapter.holeAttr;
    themeBundle.runtimeVersion = "0.3.0";
  };

  let busyDrain = false;
  let busyHealth = false;
  let discoverSession = null;
  let hintTimer = null;

  async function processQueuedRequests(reqs, list) {
    let needFullReapply = false;
    let forceWorkspace = false;
    for (const req of reqs) {
      if (req.type === "theme" && req.themeId) {
        currentThemeId = req.themeId;
        currentScheme = req.scheme === "light" ? "light" : "dark";
        currentPaletteId = "";
        if (args.settingsPath) {
          writeAppearance(args.settingsPath, {
            colorTheme: currentThemeId,
            clearPalette: true,
            paletteId: "",
          });
          log(`theme -> ${currentThemeId}`);
        }
        if (args.stateDir) {
          try {
            fs.unlinkSync(paletteMetaPath(args.stateDir));
          } catch {
            /* ignore */
          }
        }
        await appearanceAll(list, args.port, themeBundle, buildExtra({
          paletteId: "",
        }));
      } else if (req.type === "palette" && req.paletteId) {
        const pal = findPalette(themeBundle.paletteDoc, req.paletteId);
        if (!pal) {
          log(`unknown palette ${req.paletteId}`);
          continue;
        }
        currentPaletteId = pal.id;
        currentThemeId = pal.baseTheme || "Cursor Dark";
        currentScheme = pal.scheme === "light" ? "light" : "dark";
        const tokens = {
          ...(themeBundle.paletteDoc.titleBar || {}),
          ...(pal.tokens || {}),
        };
        if (args.settingsPath) {
          writeAppearance(args.settingsPath, {
            colorTheme: currentThemeId,
            tokens,
            paletteId: pal.id,
          });
          log(`palette -> ${pal.id} (${currentThemeId})`);
        }
        if (args.stateDir) {
          fs.writeFileSync(
            paletteMetaPath(args.stateDir),
            JSON.stringify(
              {
                paletteId: pal.id,
                updatedAt: new Date().toISOString(),
              },
              null,
              2
            ) + "\n"
          );
        }
        await appearanceAll(list, args.port, themeBundle, buildExtra());
      } else if (req.type === "theme-pack" && req.packId) {
        const pack = findThemePack(themePacks, req.packId);
        if (!pack) {
          log(`unknown theme pack ${req.packId}`);
          continue;
        }
        try {
          const applied = await applyThemePackMedia(args.stateDir, pack);
          videoUrl = applied.videoUrl;
          imageUrl = applied.imageUrl;
          wallpaperLabel = applied.wallpaperLabel;
          mediaEpoch = applied.mediaEpoch;
          posterKey = applied.posterKey;
          currentThemePackId = pack.id;
          packCustomOverride = false;
          packArt = pack.art;
          packVeil = pack.veil;
          packSurfaces = pack.surfaces || null;
          packFrost = typeof pack.frost === "number" ? pack.frost : undefined;
          packInlineColors = pack.colors || null;
          currentThemeId = pack.baseTheme || "Cursor Dark";
          currentScheme = pack.scheme === "light" ? "light" : "dark";
          if (pack.colors) {
            currentPaletteId = "";
            if (args.settingsPath) {
              writeAppearance(args.settingsPath, {
                colorTheme: currentThemeId,
                tokens: {
                  ...(themeBundle.paletteDoc.titleBar || {}),
                  ...pack.colors,
                },
                paletteId: "",
              });
            }
            if (args.stateDir) {
              try {
                fs.unlinkSync(paletteMetaPath(args.stateDir));
              } catch {
                /* ignore */
              }
            }
          } else if (pack.paletteId) {
            const pal = findPalette(themeBundle.paletteDoc, pack.paletteId);
            if (pal) {
              currentPaletteId = pal.id;
              currentThemeId = pal.baseTheme || currentThemeId;
              currentScheme = pal.scheme === "light" ? "light" : "dark";
              const tokens = {
                ...(themeBundle.paletteDoc.titleBar || {}),
                ...(pal.tokens || {}),
              };
              if (args.settingsPath) {
                writeAppearance(args.settingsPath, {
                  colorTheme: currentThemeId,
                  tokens,
                  paletteId: pal.id,
                });
              }
              if (args.stateDir) {
                fs.writeFileSync(
                  paletteMetaPath(args.stateDir),
                  JSON.stringify(
                    {
                      paletteId: pal.id,
                      updatedAt: new Date().toISOString(),
                    },
                    null,
                    2
                  ) + "\n"
                );
              }
            } else {
              currentPaletteId = "";
              log(`theme pack palette missing: ${pack.paletteId}`);
            }
          } else {
            currentPaletteId = "";
            if (args.settingsPath) {
              writeAppearance(args.settingsPath, {
                colorTheme: currentThemeId,
                clearPalette: true,
                paletteId: "",
              });
            }
            if (args.stateDir) {
              try {
                fs.unlinkSync(paletteMetaPath(args.stateDir));
              } catch {
                /* ignore */
              }
            }
          }
          writeActiveThemePack(args.stateDir, {
            packId: pack.id,
            customOverride: false,
          });
          needFullReapply = true;
          forceWorkspace = true;
          log(`theme-pack -> ${pack.id}`);
        } catch (e) {
          log(`theme-pack fail: ${e.message || e}`);
        }
      } else if (req.type === "wallpaper" && req.path) {
        try {
          const applied = await applyWallpaperPath(
            args.stateDir,
            args.themeDir,
            req.path,
            req.name
          );
          bindBundle(applied.themeBundle);
          videoUrl = applied.videoUrl;
          imageUrl = applied.imageUrl;
          wallpaperLabel = applied.wallpaperLabel;
          mediaEpoch = applied.mediaEpoch || Date.now();
          posterKey = applied.posterKey || mediaPosterKey(applied.meta);
          packCustomOverride = true;
          writeActiveThemePack(args.stateDir, {
            packId: currentThemePackId,
            customOverride: true,
          });
          needFullReapply = true;
          log(
            `${applied.meta.kind} -> ${wallpaperLabel} (${applied.meta.size} bytes)`
          );
        } catch (e) {
          log(`wallpaper fail: ${e.message || e}`);
        }
      } else if (req.type === "wallpaper-browse" || req.type === "wallpaper-browse-folder") {
        try {
          const folder = req.type === "wallpaper-browse-folder";
          log(
            folder
              ? "wallpaper-browse-folder: opening..."
              : "wallpaper-browse: opening system dialog..."
          );
          const chosen = await nativeOpenMediaDialog({ folder });
          if (!chosen) {
            log("wallpaper-browse: cancelled");
          } else {
            log(`wallpaper-browse picked: ${chosen}`);
            try {
              const st = fs.statSync(chosen);
              log(
                `wallpaper-browse stat: isFile=${st.isFile()} size=${st.size}`
              );
            } catch (se) {
              log(`wallpaper-browse stat fail: ${se.message || se}`);
            }
            const applied = await applyWallpaperPath(
              args.stateDir,
              args.themeDir,
              chosen,
              ""
            );
            bindBundle(applied.themeBundle);
            videoUrl = applied.videoUrl;
            imageUrl = applied.imageUrl;
            wallpaperLabel = applied.wallpaperLabel;
            mediaEpoch = applied.mediaEpoch || Date.now();
            posterKey = applied.posterKey || mediaPosterKey(applied.meta);
            packCustomOverride = true;
            writeActiveThemePack(args.stateDir, {
              packId: currentThemePackId,
              customOverride: true,
            });
            needFullReapply = true;
            log(
              `wallpaper-browse -> ${wallpaperLabel} (${applied.meta.size} bytes) video=${videoUrl ? "on" : "off"}`
            );
          }
        } catch (e) {
          const msg = e && e.message ? e.message : String(e);
          log(`wallpaper-browse fail: ${msg}`);
          wallpaperLabel = "Upload failed";
          needFullReapply = true;
        }
      } else if (req.type === "wallpaper-data" && req.base64) {
        try {
          const meta = installWallpaperFromData(args.stateDir, {
            base64: req.base64,
            mime: req.mime,
            name: req.name,
          });
          bindBundle(readTheme(args.themeDir, null));
          videoUrl = "";
          imageUrl = await ensureMediaForMeta(meta);
          wallpaperLabel = meta.name || "Custom";
          mediaEpoch = Date.now();
          posterKey = mediaPosterKey(meta);
          packCustomOverride = true;
          writeActiveThemePack(args.stateDir, {
            packId: currentThemePackId,
            customOverride: true,
          });
          needFullReapply = true;
          log(`wallpaper-data -> ${wallpaperLabel} (${meta.size} bytes)`);
        } catch (e) {
          log(`wallpaper-data fail: ${e.message || e}`);
        }
      } else if (req.type === "wallpaper-reset") {
        const pack = findThemePack(themePacks, currentThemePackId);
        if (pack) {
          try {
            const applied = await applyThemePackMedia(args.stateDir, pack);
            videoUrl = applied.videoUrl;
            imageUrl = applied.imageUrl;
            wallpaperLabel = applied.wallpaperLabel;
            mediaEpoch = applied.mediaEpoch;
            posterKey = applied.posterKey;
            packCustomOverride = false;
            packArt = pack.art;
            packVeil = pack.veil;
            packSurfaces = pack.surfaces || null;
            packFrost = typeof pack.frost === "number" ? pack.frost : undefined;
            writeActiveThemePack(args.stateDir, {
              packId: pack.id,
              customOverride: false,
            });
            needFullReapply = true;
            log(`wallpaper-reset -> pack ${pack.id}`);
          } catch (e) {
            log(`wallpaper-reset pack fail: ${e.message || e}`);
          }
        } else {
          resetWallpaper(args.stateDir);
          bindBundle(readTheme(args.themeDir, null));
          videoUrl = "";
          imageUrl = "";
          wallpaperLabel = "Default";
          mediaEpoch = Date.now();
          posterKey = "";
          currentThemePackId = "";
          packCustomOverride = false;
          packArt = null;
          packVeil = null;
          packSurfaces = null;
          packFrost = undefined;
          packInlineColors = null;
          writeActiveThemePack(args.stateDir, { packId: "", customOverride: false });
          needFullReapply = true;
          log("wallpaper -> Default");
        }
      }
    }
    if (needFullReapply) {
      await reapplyAll(list, args.port, themeBundle, buildExtra({
        resetWallpaper: !videoUrl && !imageUrl && wallpaperLabel === "Default",
        forceWorkspace,
      }));
    }
  }

  async function drainPass() {
    if (busyDrain) return;
    busyDrain = true;
    try {
      const list = (await listTargets(args.port)).filter(isWorkbenchTarget);
      for (const t of list) {
        const isNew = !seen.has(t.id);
        seen.set(t.id, Date.now());
        if (isNew) {
          missStreak.set(t.id, 0);
          log(`re-apply ${t.id} (new)`);
          try {
            await injectTarget(t, args.port, themeBundle, "apply", buildExtra());
          } catch (e) {
            log(`re-apply fail ${t.id}: ${e.message || e}`);
          }
        }
        try {
          const reqs = await injectTarget(t, args.port, themeBundle, "drain");
          if (Array.isArray(reqs) && reqs.length) {
            await processQueuedRequests(reqs, list);
          }
        } catch (e) {
          log(`drain fail: ${e.message || e}`);
        }
      }
      const live = new Set(list.map((t) => t.id));
      for (const id of [...seen.keys()]) {
        if (!live.has(id)) {
          seen.delete(id);
          missStreak.delete(id);
        }
      }
      writeState(args.stateDir, {
        pid: process.pid,
        port: args.port,
        mode: "event+health",
        themeId: themeBundle.theme.id,
        colorTheme: currentThemeId,
        paletteId: currentPaletteId,
        wallpaperLabel,
        videoUrl: videoUrl ? "on" : "",
        imageUrl: imageUrl ? "on" : "",
        targets: [...live],
        drainMs: args.drainMs,
        healthMs: args.healthMs,
      });
    } catch (e) {
      log(`drain pass error: ${e.message || e}`);
    } finally {
      busyDrain = false;
    }
  }

  async function healthPass() {
    if (busyHealth) return;
    busyHealth = true;
    try {
      const list = (await listTargets(args.port)).filter(isWorkbenchTarget);
      for (const t of list) {
        if (!seen.has(t.id)) {
          seen.set(t.id, Date.now());
          log(`re-apply ${t.id} (new/health)`);
          await injectTarget(t, args.port, themeBundle, "apply", buildExtra());
          missStreak.set(t.id, 0);
          continue;
        }
        let needs = false;
        try {
          const probe = await injectTarget(t, args.port, themeBundle, "verify");
          const healthy =
            probe?.skinActive && probe?.rootPresent && probe?.hudPresent;
          if (healthy) {
            missStreak.set(t.id, 0);
          } else {
            const n = (missStreak.get(t.id) || 0) + 1;
            missStreak.set(t.id, n);
            needs = n >= 3;
            if (n === 1 || n === 2) {
              log(`probe soft-miss ${t.id} streak=${n}`);
            }
          }
        } catch {
          const n = (missStreak.get(t.id) || 0) + 1;
          missStreak.set(t.id, n);
          needs = n >= 3;
        }
        if (needs) {
          missStreak.set(t.id, 0);
          log(`re-apply ${t.id}`);
          await injectTarget(t, args.port, themeBundle, "apply", buildExtra());
        }
      }
    } catch (e) {
      log(`health pass error: ${e.message || e}`);
    } finally {
      busyHealth = false;
    }
  }

  function scheduleHintPass(reason) {
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      hintTimer = null;
      log(`target event -> drain (${reason})`);
      drainPass().catch((e) => log(`hint drain: ${e.message || e}`));
    }, 1200);
  }

  try {
    discoverSession = await connectTargetDiscovery(args.port, (reason, info) => {
      if (reason === "destroyed") {
        const id = info?.targetId;
        if (id && seen.has(id)) {
          seen.delete(id);
          missStreak.delete(id);
          log(`target destroyed ${id}`);
        }
        return;
      }
      scheduleHintPass(reason);
    });
  } catch (e) {
    log(`target discovery unavailable: ${e.message || e}`);
    discoverSession = null;
  }

  log(
    `mode=event+health drain=${args.drainMs}ms health=${args.healthMs}ms discover=${discoverSession ? "on" : "off"} (Ctrl+C to stop)`
  );

  const drainTimer = setInterval(() => {
    drainPass().catch((e) => log(`drain timer: ${e.message || e}`));
  }, Math.max(500, args.drainMs));

  const healthTimer = setInterval(() => {
    healthPass().catch((e) => log(`health timer: ${e.message || e}`));
  }, Math.max(5000, args.healthMs));

  const shutdown = () => {
    clearInterval(drainTimer);
    clearInterval(healthTimer);
    if (hintTimer) clearTimeout(hintTimer);
    try {
      discoverSession?.close();
    } catch {
      /* ignore */
    }
    mediaServer.close();
    log("shutdown");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
