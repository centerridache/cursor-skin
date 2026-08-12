/**
 * Theme Schema v1/v2 — normalize packs into Runtime fields (frost, veil, art, …).
 */
const VIDEO_EXTS = new Set([".mp4", ".webm"]);

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function num(v, fallback = null) {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  return fallback;
}

/**
 * Map workspace opacity / glass flags → veil alphas used by the injector.
 */
export function veilFromWorkspace(raw, existingVeil) {
  if (existingVeil && typeof existingVeil === "object") {
    return {
      sidebar: num(existingVeil.sidebar, 0.28),
      auxiliary: num(existingVeil.auxiliary, 0.26),
      editor: num(existingVeil.editor, 0.32),
      composer: num(existingVeil.composer, 0.22),
    };
  }

  const env = raw.environment && typeof raw.environment === "object" ? raw.environment : {};
  const sidebar = raw.sidebar && typeof raw.sidebar === "object" ? raw.sidebar : {};
  const chat = raw.chat && typeof raw.chat === "object" ? raw.chat : {};
  const editor = raw.editor && typeof raw.editor === "object" ? raw.editor : {};

  const envOp = num(env.opacity, 0.65);
  const sideOp = num(sidebar.opacity, envOp * 0.7);

  // Higher opacity in schema = more opaque panel → higher veil alpha.
  let sidebarVeil = clamp(sideOp, 0.12, 0.55);
  let auxVeil = clamp(envOp * 0.4, 0.12, 0.5);
  let editorVeil = clamp(envOp * 0.45, 0.14, 0.55);
  let composerVeil = clamp(envOp * 0.35, 0.12, 0.45);

  if (chat.glass === true) {
    composerVeil = clamp(composerVeil * 0.85, 0.1, 0.4);
    auxVeil = clamp(auxVeil * 0.9, 0.1, 0.45);
  } else if (chat.glass === false) {
    composerVeil = clamp(composerVeil * 1.25, 0.18, 0.55);
  }

  if (editor.transparent === true) {
    editorVeil = clamp(editorVeil * 0.75, 0.1, 0.4);
  } else if (editor.transparent === false) {
    editorVeil = clamp(editorVeil * 1.3, 0.2, 0.6);
  }

  return {
    sidebar: Math.round(sidebarVeil * 100) / 100,
    auxiliary: Math.round(auxVeil * 100) / 100,
    editor: Math.round(editorVeil * 100) / 100,
    composer: Math.round(composerVeil * 100) / 100,
  };
}

/**
 * Frost level 0–100. Explicit `frost` wins; else derive from environment.blur.
 */
export function frostFromRaw(raw) {
  if (typeof raw.frost === "number" && !Number.isNaN(raw.frost)) {
    return clamp(Math.round(raw.frost), 0, 100);
  }
  const env = raw.environment && typeof raw.environment === "object" ? raw.environment : {};
  if (typeof env.blur === "number" && !Number.isNaN(env.blur)) {
    return clamp(Math.round(env.blur * 2.5), 20, 85);
  }
  return null;
}

/**
 * Validate minimal pack shape before filesystem resolve.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateThemePack(raw, dirName = "") {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not-object" };
  const id = String(raw.id || dirName || "").trim();
  const name = String(raw.name || id).trim();
  if (!id) return { ok: false, reason: "missing-id" };
  if (!name) return { ok: false, reason: "missing-name" };
  const wp = raw.wallpaper && typeof raw.wallpaper === "object" ? raw.wallpaper : {};
  const src = String(wp.src || raw.image || "").trim();
  if (!src) return { ok: false, reason: "missing-wallpaper" };
  const sv = Number(raw.schemaVersion);
  if (sv && sv !== 1 && sv !== 2) {
    return { ok: false, reason: `unsupported-schemaVersion:${sv}` };
  }
  return { ok: true };
}

/**
 * Normalize theme.json (v1 or v2) into Runtime-facing fields (paths unresolved).
 */
export function normalizeThemePack(raw, { dirName = "" } = {}) {
  const check = validateThemePack(raw, dirName);
  if (!check.ok) {
    return { ok: false, reason: check.reason };
  }

  const schemaVersion = Number(raw.schemaVersion) === 2 ? 2 : 1;
  const id = String(raw.id || dirName).trim();
  const name = String(raw.name || id).trim();
  const wp = raw.wallpaper && typeof raw.wallpaper === "object" ? raw.wallpaper : {};
  const src = String(wp.src || raw.image || "").trim();
  const preview = String(raw.preview || src).trim();

  const frost = frostFromRaw(raw);
  const veil = veilFromWorkspace(raw, raw.veil);
  const art =
    raw.art && typeof raw.art === "object"
      ? raw.art
      : { focusX: 0.72, focusY: 0.4, safeArea: "left", taskMode: "ambient" };

  const terminal =
    raw.terminal && typeof raw.terminal === "object" ? raw.terminal : {};
  const chat = raw.chat && typeof raw.chat === "object" ? raw.chat : {};
  const editor = raw.editor && typeof raw.editor === "object" ? raw.editor : {};
  const environment =
    raw.environment && typeof raw.environment === "object" ? raw.environment : {};

  return {
    ok: true,
    schemaVersion,
    id,
    name,
    tagline: String(raw.tagline || ""),
    brandSubtitle: String(raw.brandSubtitle || ""),
    wallpaperSrc: src,
    wallpaperTypeHint: String(wp.type || ""),
    previewRel: preview,
    baseTheme: raw.baseTheme || "Cursor Dark",
    scheme: raw.scheme === "light" ? "light" : "dark",
    paletteId: String(raw.paletteId || ""),
    frost,
    art,
    veil,
    colors: raw.colors && typeof raw.colors === "object" ? raw.colors : null,
    workspace: {
      environment,
      sidebar: raw.sidebar && typeof raw.sidebar === "object" ? raw.sidebar : {},
      chat,
      editor,
      terminal,
    },
  };
}

export function isVideoPath(filePath) {
  const ext = String(filePath || "").toLowerCase().split(".").pop();
  return VIDEO_EXTS.has(`.${ext}`);
}
