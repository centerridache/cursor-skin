/**
 * Theme Contract normalize — Runtime load path (Validator lives in theme/validator/).
 *
 * Formats:
 * - Contract (canonical): { schemaVersion: 1, identity, appearance, workspace?, performance? }
 * - Legacy flat v2: { schemaVersion: 2, id, wallpaper, environment, … }
 * - Legacy flat v1: { schemaVersion: 1, id, wallpaper, frost, veil } without identity block
 */
import {
  CONTRACT_SCHEMA_VERSION,
  DEFAULTS,
  PERFORMANCE_TIERS,
  SURFACE_BLUR_MAX,
  WORKSPACE_REGIONS,
} from "../theme/schema/defaults.mjs";

const VIDEO_EXTS = new Set([".mp4", ".webm"]);

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function num(v, fallback = null) {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  return fallback;
}

function isContractShape(raw) {
  return !!(
    raw &&
    typeof raw === "object" &&
    raw.identity &&
    typeof raw.identity === "object" &&
    raw.appearance &&
    typeof raw.appearance === "object"
  );
}

/**
 * Frost level 0–100 for Runtime slider / CSS curve.
 * Prefer blur→level; else opacity→level; respect enabled:false.
 */
export function frostFromAppearance(frostObj) {
  const f = frostObj && typeof frostObj === "object" ? frostObj : {};
  if (f.enabled === false) return 18;
  if (typeof f.blur === "number" && !Number.isNaN(f.blur)) {
    return clamp(Math.round(f.blur * 2.5), 20, 85);
  }
  if (typeof f.opacity === "number" && !Number.isNaN(f.opacity)) {
    return clamp(Math.round(f.opacity * 100), 0, 100);
  }
  return null;
}

/** Legacy flat frost / environment.blur */
export function frostFromLegacyRaw(raw) {
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
 * Normalize one workspace region into canonical { surface, …flags }.
 * Accepts flat opacity/blur as compat aliases into surface.
 */
export function normalizeWorkspaceRegion(rawRegion, defaultRegion = {}) {
  const r = rawRegion && typeof rawRegion === "object" ? rawRegion : {};
  const def = defaultRegion && typeof defaultRegion === "object" ? defaultRegion : {};
  const defSurf =
    def.surface && typeof def.surface === "object" ? def.surface : { opacity: 0.5, blur: 10 };
  const rawSurf = r.surface && typeof r.surface === "object" ? r.surface : {};

  const opacity =
    num(rawSurf.opacity, null) ??
    num(r.opacity, null) ??
    num(defSurf.opacity, 0.5);
  const blur =
    num(rawSurf.blur, null) ??
    num(r.blur, null) ??
    num(defSurf.blur, 10);

  const surface = {
    opacity: clamp(opacity, 0, 1),
    blur: clamp(blur, 0, SURFACE_BLUR_MAX),
  };
  if (typeof rawSurf.tint === "string") surface.tint = rawSurf.tint;
  else if (typeof defSurf.tint === "string") surface.tint = defSurf.tint;
  if (typeof rawSurf.border === "string") surface.border = rawSurf.border;
  else if (typeof defSurf.border === "string") surface.border = defSurf.border;

  const out = { surface };
  if (typeof r.transparent === "boolean") out.transparent = r.transparent;
  else if (typeof def.transparent === "boolean") out.transparent = def.transparent;
  if (typeof r.glass === "boolean") out.glass = r.glass;
  else if (typeof def.glass === "boolean") out.glass = def.glass;
  return out;
}

/**
 * workspace.*.surface → veil alphas for current Runtime CSS vars.
 * auxiliary is independent (no longer derived from chat).
 */
export function veilFromContractWorkspace(workspace, appearanceFrost) {
  const ws = workspace && typeof workspace === "object" ? workspace : {};
  const sidebar = normalizeWorkspaceRegion(ws.sidebar, DEFAULTS.workspace.sidebar);
  const editor = normalizeWorkspaceRegion(ws.editor, DEFAULTS.workspace.editor);
  const terminal = normalizeWorkspaceRegion(ws.terminal, DEFAULTS.workspace.terminal);
  const chat = normalizeWorkspaceRegion(ws.chat, DEFAULTS.workspace.chat);
  const auxiliary = normalizeWorkspaceRegion(ws.auxiliary, DEFAULTS.workspace.auxiliary);

  const sideOp = sidebar.surface.opacity;
  const editOp = editor.surface.opacity;
  const chatOp = chat.surface.opacity;
  const auxOp = auxiliary.surface.opacity;
  const termOp = terminal.surface.opacity;

  let sidebarVeil = clamp(sideOp, 0.12, 0.7);
  let editorVeil = clamp(editOp * 0.55, 0.1, 0.6);
  let composerVeil = clamp(chatOp * 0.55, 0.1, 0.55);
  let auxVeil = clamp(auxOp, 0.1, 0.55);

  if (editor.transparent === true) {
    editorVeil = clamp(editorVeil * 0.75, 0.1, 0.4);
  } else if (editor.transparent === false) {
    editorVeil = clamp(editorVeil * 1.25, 0.2, 0.65);
  }

  if (chat.glass === true) {
    composerVeil = clamp(composerVeil * 0.85, 0.1, 0.4);
  } else if (chat.glass === false) {
    composerVeil = clamp(composerVeil * 1.2, 0.15, 0.55);
  }

  const frost = appearanceFrost && typeof appearanceFrost === "object" ? appearanceFrost : {};
  if (frost.enabled === false) {
    sidebarVeil = clamp(sidebarVeil * 1.15, 0.2, 0.75);
    editorVeil = clamp(editorVeil * 1.15, 0.2, 0.7);
    auxVeil = clamp(auxVeil * 1.15, 0.2, 0.65);
  }

  void termOp; // terminal surface reserved for Adapter / CSS wiring

  return {
    sidebar: Math.round(sidebarVeil * 100) / 100,
    auxiliary: Math.round(auxVeil * 100) / 100,
    editor: Math.round(editorVeil * 100) / 100,
    composer: Math.round(composerVeil * 100) / 100,
  };
}

/** Canonical surfaces map for Runtime / Creator. */
export function surfacesFromWorkspace(workspace) {
  const ws = workspace && typeof workspace === "object" ? workspace : {};
  const out = {};
  for (const key of WORKSPACE_REGIONS) {
    const region = normalizeWorkspaceRegion(ws[key], DEFAULTS.workspace[key]);
    out[key] = { ...region.surface };
  }
  return out;
}

export function veilFromLegacyWorkspace(raw, existingVeil) {
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

/** @deprecated use veilFromLegacyWorkspace */
export function veilFromWorkspace(raw, existingVeil) {
  return veilFromLegacyWorkspace(raw, existingVeil);
}

/** @deprecated use frostFromLegacyRaw */
export function frostFromRaw(raw) {
  return frostFromLegacyRaw(raw);
}

export function validateThemePack(raw, dirName = "") {
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not-object" };

  if (isContractShape(raw)) {
    const id = String(raw.identity.id || dirName || "").trim();
    const name = String(raw.identity.name || id).trim();
    if (!id) return { ok: false, reason: "missing-identity.id" };
    if (!name) return { ok: false, reason: "missing-identity.name" };
    const wp =
      raw.appearance.wallpaper && typeof raw.appearance.wallpaper === "object"
        ? raw.appearance.wallpaper
        : {};
    const src = String(wp.src || "").trim();
    if (!src) return { ok: false, reason: "missing-appearance.wallpaper.src" };
    const sv = Number(raw.schemaVersion);
    if (sv && sv !== CONTRACT_SCHEMA_VERSION) {
      return { ok: false, reason: `unsupported-contract-schemaVersion:${sv}` };
    }
    const tier = raw.performance?.tier;
    if (tier && !PERFORMANCE_TIERS.includes(tier)) {
      return { ok: false, reason: `invalid-performance.tier:${tier}` };
    }
    return { ok: true, format: "contract" };
  }

  const id = String(raw.id || dirName || "").trim();
  const name = String(raw.name || id).trim();
  if (!id) return { ok: false, reason: "missing-id" };
  if (!name) return { ok: false, reason: "missing-name" };
  const wp = raw.wallpaper && typeof raw.wallpaper === "object" ? raw.wallpaper : {};
  const src = String(wp.src || raw.image || "").trim();
  if (!src) return { ok: false, reason: "missing-wallpaper" };
  const sv = Number(raw.schemaVersion);
  if (sv && sv !== 1 && sv !== 2) {
    return { ok: false, reason: `unsupported-legacy-schemaVersion:${sv}` };
  }
  return { ok: true, format: sv === 2 ? "legacy-v2" : "legacy-v1" };
}

function normalizeContract(raw, dirName) {
  const identity = { ...DEFAULTS.identity, ...raw.identity };
  const appearance = {
    ...DEFAULTS.appearance,
    ...raw.appearance,
    wallpaper: {
      ...DEFAULTS.appearance.wallpaper,
      ...(raw.appearance.wallpaper || {}),
    },
    frost: {
      ...DEFAULTS.appearance.frost,
      ...(raw.appearance.frost || {}),
    },
    effects: {
      ...DEFAULTS.appearance.effects,
      ...(raw.appearance.effects || {}),
    },
    art: {
      ...DEFAULTS.appearance.art,
      ...(raw.appearance.art || {}),
    },
  };

  const workspace = {};
  for (const key of WORKSPACE_REGIONS) {
    workspace[key] = normalizeWorkspaceRegion(raw.workspace?.[key], DEFAULTS.workspace[key]);
  }

  const performance = {
    ...DEFAULTS.performance,
    ...(raw.performance || {}),
  };

  const id = String(identity.id || dirName).trim();
  const name = String(identity.name || id).trim();
  const wp = appearance.wallpaper;
  const src = String(wp.src || "").trim();
  const preview = String(identity.preview || DEFAULTS.identity.preview).trim();

  let frost = frostFromAppearance(appearance.frost);
  if (performance.tier === "lite" && frost != null) {
    frost = clamp(Math.round(frost * 0.75), 15, 70);
  } else if (performance.tier === "quality" && frost != null) {
    frost = clamp(Math.round(frost * 1.05), 20, 90);
  }

  const veil = veilFromContractWorkspace(workspace, appearance.frost);
  const surfaces = surfacesFromWorkspace(workspace);
  const paletteInline =
    appearance.palette && typeof appearance.palette === "object" ? appearance.palette : null;

  return {
    ok: true,
    format: "contract",
    schemaVersion: CONTRACT_SCHEMA_VERSION,
    id,
    name,
    tagline: String(identity.tagline || identity.description || ""),
    brandSubtitle: String(identity.brandSubtitle || ""),
    author: String(identity.author || ""),
    description: String(identity.description || ""),
    themeVersion: String(identity.version || DEFAULTS.identity.version),
    wallpaperSrc: src,
    wallpaperTypeHint: String(wp.type || "image"),
    previewRel: preview,
    baseTheme: appearance.baseTheme || DEFAULTS.appearance.baseTheme,
    scheme: appearance.scheme === "light" ? "light" : "dark",
    paletteId: String(appearance.paletteId || ""),
    frost,
    art: appearance.art,
    veil,
    surfaces,
    colors: paletteInline,
    effects: appearance.effects,
    performance,
    workspace,
    identity,
    appearance,
  };
}

function normalizeLegacy(raw, dirName, format) {
  const schemaVersion = format === "legacy-v2" ? 2 : 1;
  const id = String(raw.id || dirName).trim();
  const name = String(raw.name || id).trim();
  const wp = raw.wallpaper && typeof raw.wallpaper === "object" ? raw.wallpaper : {};
  const src = String(wp.src || raw.image || "").trim();
  const preview = String(raw.preview || src).trim();

  const frost = frostFromLegacyRaw(raw);
  const veil = veilFromLegacyWorkspace(raw, raw.veil);
  const art =
    raw.art && typeof raw.art === "object"
      ? raw.art
      : { ...DEFAULTS.appearance.art };

  return {
    ok: true,
    format,
    schemaVersion,
    id,
    name,
    tagline: String(raw.tagline || ""),
    brandSubtitle: String(raw.brandSubtitle || ""),
    author: "",
    description: String(raw.tagline || ""),
    themeVersion: "1.0.0",
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
    effects: { glow: false, vignette: false },
    performance: { tier: "balanced" },
    workspace: {
      environment: raw.environment && typeof raw.environment === "object" ? raw.environment : {},
      sidebar: raw.sidebar && typeof raw.sidebar === "object" ? raw.sidebar : {},
      chat: raw.chat && typeof raw.chat === "object" ? raw.chat : {},
      editor: raw.editor && typeof raw.editor === "object" ? raw.editor : {},
      terminal: raw.terminal && typeof raw.terminal === "object" ? raw.terminal : {},
    },
  };
}

/**
 * Normalize any supported theme.json into Runtime-facing fields (paths unresolved).
 */
export function normalizeThemePack(raw, { dirName = "" } = {}) {
  const check = validateThemePack(raw, dirName);
  if (!check.ok) {
    return { ok: false, reason: check.reason };
  }
  if (check.format === "contract") {
    return normalizeContract(raw, dirName);
  }
  return normalizeLegacy(raw, dirName, check.format);
}

export function isVideoPath(filePath) {
  const ext = String(filePath || "").toLowerCase().split(".").pop();
  return VIDEO_EXTS.has(`.${ext}`);
}

export { CONTRACT_SCHEMA_VERSION, DEFAULTS, PERFORMANCE_TIERS, WORKSPACE_REGIONS, SURFACE_BLUR_MAX };
