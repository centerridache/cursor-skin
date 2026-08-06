#!/usr/bin/env node
/**
 * Cursor Dream Skin — CDP injector daemon.
 * Connects to Cursor's loopback debugging port, injects theme CSS + wallpaper.
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

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MAX_WALLPAPER_BYTES = 200 * 1024 * 1024; // still images via disk path
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024; // mp4/webm via disk path (Steam WE sized)
const WALLPAPER_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXTS = new Set([".mp4", ".webm"]);
const mediaServer = createMediaServer();

function parseArgs(argv) {
  const out = {
    port: 9342,
    themeDir: path.join(ROOT, "assets"),
    stateDir: "",
    settingsPath: "",
    pollMs: 4000,
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
    } else if (a === "--state-dir" && next) {
      out.stateDir = path.resolve(next);
      i++;
    } else if (a === "--settings-path" && next) {
      out.settingsPath = path.resolve(next);
      i++;
    } else if (a === "--poll-ms" && next) {
      out.pollMs = Number(next);
      i++;
    } else if (a === "--once") {
      out.once = true;
    } else if (a === "--remove") {
      out.remove = true;
    } else if (a === "--verify") {
      out.verify = true;
    }
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
        if (msg.id != null && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(JSON.stringify(msg.error)));
          else res(msg.result);
        }
      });
    });
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

function readJsonSafe(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
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
  const resolved = path.resolve(srcPath);
  const ext = path.extname(resolved).toLowerCase();
  const allowed = video ? VIDEO_EXTS : WALLPAPER_EXTS;
  if (!allowed.has(ext)) {
    throw new Error(`unsupported wallpaper extension: ${ext}`);
  }
  const st = fs.lstatSync(resolved);
  if (!st.isFile() || st.isSymbolicLink()) {
    throw new Error("wallpaper must be a regular file");
  }
  const max = video ? MAX_VIDEO_BYTES : MAX_WALLPAPER_BYTES;
  if (st.size <= 0 || st.size > max) {
    throw new Error(`wallpaper size out of range (max ${max} bytes)`);
  }
  const st2 = fs.statSync(resolved);
  if (st2.size !== st.size) {
    throw new Error("wallpaper file changed while reading");
  }
  if (video) {
    const fd = fs.openSync(resolved, "r");
    try {
      const head = Buffer.alloc(12);
      fs.readSync(fd, head, 0, 12, 0);
      const isMp4 =
        head.toString("ascii", 4, 8) === "ftyp" ||
        (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70);
      const isWebm = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
      if (ext === ".mp4" && !isMp4) {
        // Some MP4s start with other boxes; allow if size ok but warn via soft check:
        // require at least non-empty and .mp4 extension already validated
      }
      if (ext === ".webm" && !isWebm) {
        throw new Error("webm magic bytes mismatch");
      }
    } finally {
      fs.closeSync(fd);
    }
  }
  return { resolved, ext, size: st.size };
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
  // Avoid re-eval every poll tick — that churn can hitch the renderer / video decoder.
  return `(() => {
    try {
      if (!window.__cursorDreamSkin || typeof window.__cursorDreamSkin.drainRequests !== "function") {
        const src = ${JSON.stringify(payload)};
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
    // Never ship default poster alongside custom media — avoids theme-switch flash.
    imageDataUrl: hasCustomMedia ? "" : themeBundle.imageDataUrl,
    art: themeBundle.theme.art || {},
    veil: themeBundle.theme.veil || {},
    palettes: paletteCatalog(themeBundle.paletteDoc),
    videoUrl: "",
    imageUrl: "",
    ...extra,
    resetWallpaper,
    skipMediaReload: extra.skipMediaReload === true,
    // If custom already on screen and this payload has no custom URLs, don't fall back to default.
    preserveCustomMedia: !hasCustomMedia && !resetWallpaper,
    paletteTokens,
  };
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
  let themeBundle = readTheme(args.themeDir, null);
  let wallpaperLabel = wallMeta?.name || "Default";
  let videoUrl = "";
  let imageUrl = "";
  let mediaEpoch = 0;
  try {
    if (wallMeta?.kind === "video") {
      videoUrl = await ensureMediaForMeta(wallMeta);
      mediaEpoch = Date.now();
    } else if (wallMeta?.kind === "image") {
      imageUrl = await ensureMediaForMeta(wallMeta);
      mediaEpoch = Date.now();
    }
  } catch (e) {
    log(`media server fail: ${e.message || e}`);
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

  log(
    `mode=${mode} port=${args.port} theme=${themeBundle.theme.id} colorTheme=${currentThemeId} wallpaper=${wallpaperLabel}${videoUrl ? " video=on" : ""}${imageUrl ? " image=on" : ""}`
  );
  if (args.settingsPath) log(`settings=${args.settingsPath}`);

  const pages = await waitForTargets(args.port);
  log(`found ${pages.length} workbench target(s)`);

  const extra = {
    themeId: currentThemeId,
    scheme: currentScheme,
    paletteId: currentPaletteId,
    wallpaperLabel,
    videoUrl,
    imageUrl,
    mediaEpoch,
  };
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
  const missStreak = new Map(); // targetId -> consecutive failed probes
  for (const t of pages) seen.set(t.id, Date.now());

  log(`watching every ${args.pollMs}ms (Ctrl+C to stop)`);
  const timer = setInterval(async () => {
    try {
      const list = (await listTargets(args.port)).filter(isWorkbenchTarget);
      for (const t of list) {
        const isNew = !seen.has(t.id);
        seen.set(t.id, Date.now());

        try {
          const reqs = await injectTarget(t, args.port, themeBundle, "drain");
          if (Array.isArray(reqs) && reqs.length) {
            let needFullReapply = false;
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
                await appearanceAll(list, args.port, themeBundle, {
                  themeId: currentThemeId,
                  scheme: currentScheme,
                  paletteId: "",
                  wallpaperLabel,
                  videoUrl,
                  imageUrl,
                });
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
                await appearanceAll(list, args.port, themeBundle, {
                  themeId: currentThemeId,
                  scheme: currentScheme,
                  paletteId: currentPaletteId,
                  wallpaperLabel,
                  videoUrl,
                  imageUrl,
                });
              } else if (
                req.type === "wallpaper" &&
                req.path
              ) {
                try {
                  const applied = await applyWallpaperPath(
                    args.stateDir,
                    args.themeDir,
                    req.path,
                    req.name
                  );
                  themeBundle = applied.themeBundle;
                  videoUrl = applied.videoUrl;
                  imageUrl = applied.imageUrl;
                  wallpaperLabel = applied.wallpaperLabel;
                  mediaEpoch = applied.mediaEpoch || Date.now();
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
                    const applied = await applyWallpaperPath(
                      args.stateDir,
                      args.themeDir,
                      chosen,
                      ""
                    );
                    themeBundle = applied.themeBundle;
                    videoUrl = applied.videoUrl;
                    imageUrl = applied.imageUrl;
                    wallpaperLabel = applied.wallpaperLabel;
                    mediaEpoch = applied.mediaEpoch || Date.now();
                    needFullReapply = true;
                    log(
                      `wallpaper-browse -> ${wallpaperLabel} (${applied.meta.size} bytes)`
                    );
                  }
                } catch (e) {
                  log(`wallpaper-browse fail: ${e.message || e}`);
                }
              } else if (req.type === "wallpaper-data" && req.base64) {
                try {
                  const meta = installWallpaperFromData(args.stateDir, {
                    base64: req.base64,
                    mime: req.mime,
                    name: req.name,
                  });
                  themeBundle = readTheme(args.themeDir, null);
                  videoUrl = "";
                  imageUrl = await ensureMediaForMeta(meta);
                  wallpaperLabel = meta.name || "Custom";
                  mediaEpoch = Date.now();
                  needFullReapply = true;
                  log(`wallpaper-data -> ${wallpaperLabel} (${meta.size} bytes)`);
                } catch (e) {
                  log(`wallpaper-data fail: ${e.message || e}`);
                }
              } else if (req.type === "wallpaper-reset") {
                resetWallpaper(args.stateDir);
                themeBundle = readTheme(args.themeDir, null);
                videoUrl = "";
                imageUrl = "";
                wallpaperLabel = "Default";
                mediaEpoch = Date.now();
                needFullReapply = true;
                log("wallpaper -> Default");
              }
              // wallpaper* handlers set needFullReapply; theme/palette use appearanceAll only
            }
            if (needFullReapply) {
              await reapplyAll(list, args.port, themeBundle, {
                themeId: currentThemeId,
                scheme: currentScheme,
                paletteId: currentPaletteId,
                wallpaperLabel,
                videoUrl,
                imageUrl,
                mediaEpoch,
                resetWallpaper: !videoUrl && !imageUrl && wallpaperLabel === "Default",
              });
            }
          }
        } catch (e) {
          log(`drain fail: ${e.message || e}`);
        }

        let needs = isNew;
        if (!needs) {
          try {
            const probe = await injectTarget(t, args.port, themeBundle, "verify");
            const healthy =
              probe?.skinActive && probe?.rootPresent && probe?.hudPresent;
            if (healthy) {
              missStreak.set(t.id, 0);
            } else {
              const n = (missStreak.get(t.id) || 0) + 1;
              missStreak.set(t.id, n);
              // Require a few misses — one CDP glitch must not remount a 4K blob (white flash).
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
        }
        if (needs) {
          missStreak.set(t.id, 0);
          log(`re-apply ${t.id}${isNew ? " (new)" : ""}`);
          await injectTarget(t, args.port, themeBundle, "apply", {
            themeId: currentThemeId,
            scheme: currentScheme,
            paletteId: currentPaletteId,
            wallpaperLabel,
            videoUrl,
            imageUrl,
            mediaEpoch,
          });
        }
      }
      const live = new Set(list.map((t) => t.id));
      for (const id of [...seen.keys()]) {
        if (!live.has(id)) seen.delete(id);
      }
      writeState(args.stateDir, {
        pid: process.pid,
        port: args.port,
        mode: "watch",
        themeId: themeBundle.theme.id,
        colorTheme: currentThemeId,
        paletteId: currentPaletteId,
        wallpaperLabel,
        videoUrl: videoUrl ? "on" : "",
        imageUrl: imageUrl ? "on" : "",
        targets: [...live],
      });
    } catch (e) {
      log(`watch error: ${e.message || e}`);
    }
  }, args.pollMs);

  const shutdown = () => {
    clearInterval(timer);
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
