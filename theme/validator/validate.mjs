/**
 * Theme Validator — quality gate before Runtime.
 * Shares ranges / defaults / resource limits with theme/schema.
 *
 * Layers: structure → types → ranges → assets → size → performance (warn).
 */
import fs from "node:fs";
import path from "node:path";
import {
  CONTRACT_SCHEMA_VERSION,
  PERFORMANCE_TIERS,
  RESOURCE_LIMITS,
  SURFACE_BLUR_MAX,
  WORKSPACE_REGIONS,
} from "../schema/defaults.mjs";

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const BASE_THEMES = new Set([
  "Cursor Dark",
  "Cursor Light",
  "Cursor Dark High Contrast",
]);
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const VIDEO_EXTS = new Set([".mp4", ".webm"]);
const FORBIDDEN_KEYS = new Set([
  "selector",
  "selectors",
  "cssSelector",
  "dom",
  "querySelector",
]);

/** Objects with additionalProperties: false in theme.schema.json. */
const ROOT_KEYS = new Set(["schemaVersion", "identity", "appearance", "workspace", "performance"]);
const IDENTITY_KEYS = new Set([
  "id",
  "name",
  "version",
  "author",
  "description",
  "preview",
  "tagline",
  "brandSubtitle",
]);
const APPEARANCE_KEYS = new Set([
  "wallpaper",
  "baseTheme",
  "scheme",
  "paletteId",
  "palette",
  "frost",
  "effects",
  "art",
]);
const WALLPAPER_KEYS = new Set(["type", "src"]);
const FROST_KEYS = new Set(["enabled", "opacity", "blur"]);
const EFFECTS_KEYS = new Set(["glow", "vignette"]);
const ART_KEYS = new Set(["focusX", "focusY", "safeArea", "taskMode"]);
const SURFACE_KEYS = new Set(["opacity", "blur", "tint", "border"]);
const PERFORMANCE_KEYS = new Set(["tier"]);
const KNOWN_WORKSPACE = new Set(WORKSPACE_REGIONS);

function regionAllowedKeys(region) {
  const keys = new Set(["surface", "opacity", "blur"]);
  if (region === "editor") keys.add("transparent");
  if (region === "chat" || region === "terminal") keys.add("glass");
  return keys;
}

function isPlainObject(v) {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function extOf(p) {
  return path.extname(String(p || "")).toLowerCase();
}

function isContractShape(raw) {
  return isPlainObject(raw?.identity) && isPlainObject(raw?.appearance);
}

function push(list, code, message, pathHint = "") {
  list.push({ code, message, path: pathHint || undefined });
}

function rejectUnknownKeys(errors, obj, allowed, pathHint) {
  if (!isPlainObject(obj)) return;
  for (const k of Object.keys(obj)) {
    if (allowed.has(k)) continue;
    const p = pathHint ? `${pathHint}.${k}` : k;
    push(errors, "unknown-field", `${p} is not allowed by Theme Contract`, p);
  }
}

function walkForbiddenKeys(node, basePath, errors, depth = 0) {
  if (depth > 12 || node == null) return;
  if (Array.isArray(node)) {
    node.forEach((item, i) => {
      if (isPlainObject(item) || Array.isArray(item)) {
        const p = basePath ? `${basePath}[${i}]` : `[${i}]`;
        walkForbiddenKeys(item, p, errors, depth + 1);
      }
    });
    return;
  }
  if (!isPlainObject(node)) return;
  for (const [k, v] of Object.entries(node)) {
    const p = basePath ? `${basePath}.${k}` : k;
    if (FORBIDDEN_KEYS.has(k)) {
      push(errors, "forbidden-selector-field", `${p}: Theme must not contain DOM selector fields`, p);
    }
    if (isPlainObject(v) || Array.isArray(v)) walkForbiddenKeys(v, p, errors, depth + 1);
  }
}

function expectNumberInRange(errors, value, pathHint, lo, hi, { required = false } = {}) {
  if (value === undefined || value === null) {
    if (required) push(errors, "missing", `${pathHint} is required`, pathHint);
    return;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    push(errors, "type", `${pathHint} must be a number (got ${typeof value})`, pathHint);
    return;
  }
  if (value < lo || value > hi) {
    push(errors, "range", `${pathHint} must be between ${lo} and ${hi}`, pathHint);
  }
}

function expectBoolean(errors, value, pathHint) {
  if (value === undefined || value === null) return;
  if (typeof value !== "boolean") {
    push(errors, "type", `${pathHint} must be a boolean`, pathHint);
  }
}

function expectString(errors, value, pathHint, { required = false, minLength = 0, pattern = null } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) push(errors, "missing", `${pathHint} is missing`, pathHint);
    return;
  }
  if (typeof value !== "string") {
    push(errors, "type", `${pathHint} must be a string`, pathHint);
    return;
  }
  if (value.length < minLength) {
    push(errors, "range", `${pathHint} is too short`, pathHint);
  }
  if (pattern && !pattern.test(value)) {
    push(errors, "format", `${pathHint} has invalid format`, pathHint);
  }
}

function cleanRel(rel) {
  return String(rel || "").replace(/\\/g, "/").replace(/^\/+/, "");
}

function resolveSafe(themeRoot, rel) {
  const cleaned = cleanRel(rel);
  if (!cleaned || cleaned.includes("\0") || cleaned.split("/").includes("..")) {
    return { ok: false, reason: "unsafe-path" };
  }
  const abs = path.resolve(themeRoot, cleaned);
  const root = path.resolve(themeRoot);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    return { ok: false, reason: "path-escape" };
  }
  return { ok: true, abs, rel: cleaned };
}

function inspectAsset(opts, rel) {
  const cleaned = cleanRel(rel);
  if (!cleaned || cleaned.includes("\0") || cleaned.split("/").includes("..")) {
    return { ok: false, reason: "unsafe-path" };
  }
  const virtual = opts.virtualFiles;
  if (virtual && typeof virtual === "object") {
    const hit = virtual[cleaned];
    if (!hit) return { ok: true, exists: false, rel: cleaned };
    return {
      ok: true,
      exists: true,
      rel: cleaned,
      size: Number(hit.size) || 0,
      ext: extOf(cleaned),
    };
  }
  if (!opts.themeRoot) return { ok: true, skipped: true, rel: cleaned };
  const resolved = resolveSafe(opts.themeRoot, cleaned);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };
  if (!fs.existsSync(resolved.abs)) return { ok: true, exists: false, rel: cleaned };
  const st = fs.statSync(resolved.abs);
  return { ok: true, exists: true, rel: cleaned, size: st.size, ext: extOf(resolved.abs) };
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Validate a Theme Contract document (JSON object).
 * @param {object} raw
 * @param {{ dirName?: string, themeRoot?: string, allowLegacy?: boolean, virtualFiles?: Record<string, { size: number }> }} [opts]
 */
export function validateThemeDocument(raw, opts = {}) {
  const errors = [];
  const warnings = [];
  const checks = {
    schema: false,
    identity: false,
    appearance: false,
    workspace: false,
    wallpaper: false,
    preview: false,
    assets: false,
  };

  if (!isPlainObject(raw)) {
    push(errors, "not-object", "theme.json must be a JSON object");
    return { ok: false, format: null, errors, warnings, checks };
  }

  walkForbiddenKeys(raw, "", errors);

  if (!isContractShape(raw)) {
    if (opts.allowLegacy) {
      push(warnings, "legacy-format", "Legacy flat theme detected; migrate to Theme Contract (identity + appearance)");
      const id = String(raw.id || opts.dirName || "").trim();
      const wp = isPlainObject(raw.wallpaper) ? raw.wallpaper : {};
      const src = String(wp.src || raw.image || "").trim();
      if (!id) push(errors, "missing", "id is missing", "id");
      if (!src) push(errors, "missing", "wallpaper.src is missing", "wallpaper.src");
      checks.schema = errors.length === 0;
      return {
        ok: errors.length === 0,
        format: "legacy",
        errors,
        warnings,
        checks,
      };
    }
    push(
      errors,
      "not-contract",
      "Theme must be Contract format (schemaVersion + identity + appearance). Pass --allow-legacy to soft-check flat packs."
    );
    return { ok: false, format: null, errors, warnings, checks };
  }

  // —— Structure ——
  if (raw.schemaVersion !== CONTRACT_SCHEMA_VERSION) {
    push(
      errors,
      "schemaVersion",
      `schemaVersion must be ${CONTRACT_SCHEMA_VERSION}`,
      "schemaVersion"
    );
  } else {
    checks.schema = true;
  }

  const identity = raw.identity;
  expectString(errors, identity.id, "identity.id", { required: true, minLength: 1, pattern: ID_RE });
  expectString(errors, identity.name, "identity.name", { required: true, minLength: 1 });
  if (identity.version !== undefined) {
    expectString(errors, identity.version, "identity.version", { pattern: SEMVER_RE });
  }
  if (identity.author !== undefined) expectString(errors, identity.author, "identity.author");
  if (identity.description !== undefined) expectString(errors, identity.description, "identity.description");
  if (identity.preview !== undefined) {
    expectString(errors, identity.preview, "identity.preview", { minLength: 1 });
  }
  if (identity.tagline !== undefined) expectString(errors, identity.tagline, "identity.tagline");
  if (identity.brandSubtitle !== undefined) {
    expectString(errors, identity.brandSubtitle, "identity.brandSubtitle");
  }
  rejectUnknownKeys(errors, identity, IDENTITY_KEYS, "identity");
  if (opts.dirName && identity.id && identity.id !== opts.dirName) {
    push(
      errors,
      "id-folder-mismatch",
      `identity.id ("${identity.id}") should match folder name ("${opts.dirName}")`,
      "identity.id"
    );
  }
  if (!errors.some((e) => String(e.path || "").startsWith("identity"))) {
    checks.identity = true;
  }

  const appearance = raw.appearance;
  if (!isPlainObject(appearance.wallpaper)) {
    push(errors, "missing", "appearance.wallpaper is required", "appearance.wallpaper");
  } else {
    const wp = appearance.wallpaper;
    expectString(errors, wp.src, "appearance.wallpaper.src", { required: true, minLength: 1 });
    if (wp.type !== undefined) {
      if (wp.type !== "image" && wp.type !== "video") {
        push(errors, "enum", 'appearance.wallpaper.type must be "image" or "video"', "appearance.wallpaper.type");
      }
    }
    rejectUnknownKeys(errors, wp, WALLPAPER_KEYS, "appearance.wallpaper");
  }

  if (appearance.baseTheme !== undefined && !BASE_THEMES.has(appearance.baseTheme)) {
    push(errors, "enum", `appearance.baseTheme invalid: ${appearance.baseTheme}`, "appearance.baseTheme");
  }
  if (appearance.scheme !== undefined && appearance.scheme !== "dark" && appearance.scheme !== "light") {
    push(errors, "enum", 'appearance.scheme must be "dark" or "light"', "appearance.scheme");
  }
  if (appearance.paletteId !== undefined) {
    expectString(errors, appearance.paletteId, "appearance.paletteId");
  }
  if (appearance.palette !== undefined) {
    if (!isPlainObject(appearance.palette)) {
      push(errors, "type", "appearance.palette must be an object", "appearance.palette");
    } else {
      for (const [k, v] of Object.entries(appearance.palette)) {
        if (typeof v !== "string") {
          push(errors, "type", `appearance.palette.${k} must be a string`, `appearance.palette.${k}`);
        }
      }
    }
  }

  const frost = appearance.frost;
  if (frost !== undefined) {
    if (!isPlainObject(frost)) {
      push(errors, "type", "appearance.frost must be an object", "appearance.frost");
    } else {
      expectBoolean(errors, frost.enabled, "appearance.frost.enabled");
      expectNumberInRange(errors, frost.opacity, "appearance.frost.opacity", 0, 1);
      expectNumberInRange(errors, frost.blur, "appearance.frost.blur", 0, 64);
      rejectUnknownKeys(errors, frost, FROST_KEYS, "appearance.frost");
    }
  }

  const effects = appearance.effects;
  if (effects !== undefined) {
    if (!isPlainObject(effects)) {
      push(errors, "type", "appearance.effects must be an object", "appearance.effects");
    } else {
      expectBoolean(errors, effects.glow, "appearance.effects.glow");
      expectBoolean(errors, effects.vignette, "appearance.effects.vignette");
      rejectUnknownKeys(errors, effects, EFFECTS_KEYS, "appearance.effects");
    }
  }

  const art = appearance.art;
  if (art !== undefined) {
    if (!isPlainObject(art)) {
      push(errors, "type", "appearance.art must be an object", "appearance.art");
    } else {
      expectNumberInRange(errors, art.focusX, "appearance.art.focusX", 0, 1);
      expectNumberInRange(errors, art.focusY, "appearance.art.focusY", 0, 1);
      if (art.safeArea !== undefined) expectString(errors, art.safeArea, "appearance.art.safeArea");
      if (art.taskMode !== undefined) expectString(errors, art.taskMode, "appearance.art.taskMode");
      rejectUnknownKeys(errors, art, ART_KEYS, "appearance.art");
    }
  }

  rejectUnknownKeys(errors, appearance, APPEARANCE_KEYS, "appearance");
  rejectUnknownKeys(errors, raw, ROOT_KEYS, "");

  if (!errors.some((e) => String(e.path || "").startsWith("appearance"))) {
    checks.appearance = true;
  }

  // —— Workspace ——
  if (raw.workspace !== undefined) {
    if (!isPlainObject(raw.workspace)) {
      push(errors, "type", "workspace must be an object", "workspace");
    } else {
      for (const region of WORKSPACE_REGIONS) {
        const block = raw.workspace[region];
        if (block === undefined) continue;
        if (!isPlainObject(block)) {
          push(errors, "type", `workspace.${region} must be an object`, `workspace.${region}`);
          continue;
        }

        if (block.surface !== undefined) {
          if (!isPlainObject(block.surface)) {
            push(errors, "type", `workspace.${region}.surface must be an object`, `workspace.${region}.surface`);
          } else {
            expectNumberInRange(errors, block.surface.opacity, `workspace.${region}.surface.opacity`, 0, 1);
            expectNumberInRange(
              errors,
              block.surface.blur,
              `workspace.${region}.surface.blur`,
              0,
              SURFACE_BLUR_MAX
            );
            if (block.surface.tint !== undefined) {
              expectString(errors, block.surface.tint, `workspace.${region}.surface.tint`);
            }
            if (block.surface.border !== undefined) {
              expectString(errors, block.surface.border, `workspace.${region}.surface.border`);
            }
            rejectUnknownKeys(errors, block.surface, SURFACE_KEYS, `workspace.${region}.surface`);
          }
        }

        // Flat opacity/blur = compat aliases (prefer surface.*)
        expectNumberInRange(errors, block.opacity, `workspace.${region}.opacity`, 0, 1);
        expectNumberInRange(errors, block.blur, `workspace.${region}.blur`, 0, SURFACE_BLUR_MAX);
        if (typeof block.opacity === "number" && block.surface?.opacity === undefined) {
          push(
            warnings,
            "flat-opacity",
            `workspace.${region}.opacity is a compat alias; prefer surface.opacity`,
            `workspace.${region}.opacity`
          );
        }

        if (region === "editor") expectBoolean(errors, block.transparent, "workspace.editor.transparent");
        if (region === "terminal" || region === "chat") {
          expectBoolean(errors, block.glass, `workspace.${region}.glass`);
        }
        rejectUnknownKeys(errors, block, regionAllowedKeys(region), `workspace.${region}`);
      }
      for (const k of Object.keys(raw.workspace)) {
        if (!KNOWN_WORKSPACE.has(k)) {
          push(
            errors,
            "unknown-workspace-key",
            `workspace.${k} is not a first-class region (use auxiliary for Changes/Agent for now)`,
            `workspace.${k}`
          );
        }
      }
    }
  }
  if (!errors.some((e) => String(e.path || "").startsWith("workspace"))) {
    checks.workspace = true;
  }

  // —— Performance ——
  let tier = "balanced";
  if (raw.performance !== undefined) {
    if (!isPlainObject(raw.performance)) {
      push(errors, "type", "performance must be an object", "performance");
    } else {
      if (raw.performance.tier !== undefined) {
        if (!PERFORMANCE_TIERS.includes(raw.performance.tier)) {
          push(
            errors,
            "enum",
            `performance.tier must be one of: ${PERFORMANCE_TIERS.join(", ")}`,
            "performance.tier"
          );
        } else {
          tier = raw.performance.tier;
        }
      }
      rejectUnknownKeys(errors, raw.performance, PERFORMANCE_KEYS, "performance");
    }
  }

  // —— Assets (when themeRoot or virtualFiles provided) ——
  const wp = isPlainObject(appearance.wallpaper) ? appearance.wallpaper : {};
  const wpSrc = String(wp.src || "").trim();
  const wpType = wp.type === "video" ? "video" : wp.type === "image" ? "image" : null;
  const previewRel = String(identity.preview || "preview.jpg").trim();
  const hasAssetSource = !!(opts.themeRoot || (opts.virtualFiles && typeof opts.virtualFiles === "object"));

  if (hasAssetSource) {
    if (wpSrc) {
      const asset = inspectAsset(opts, wpSrc);
      if (!asset.ok) {
        push(errors, "unsafe-path", `appearance.wallpaper.src is unsafe: ${wpSrc}`, "appearance.wallpaper.src");
      } else if (!asset.exists) {
        push(errors, "missing-asset", `Wallpaper not found: ${wpSrc}`, "appearance.wallpaper.src");
      } else {
        const ext = asset.ext || "";
        const looksVideo = VIDEO_EXTS.has(ext);
        const looksImage = IMAGE_EXTS.has(ext);
        const effectiveType = wpType || (looksVideo ? "video" : "image");

        if (wpType === "image" && looksVideo) {
          push(errors, "type-mismatch", "wallpaper.type is image but file looks like video", "appearance.wallpaper.type");
        }
        if (wpType === "video" && looksImage) {
          push(errors, "type-mismatch", "wallpaper.type is video but file looks like image", "appearance.wallpaper.type");
        }
        if (!looksVideo && !looksImage) {
          push(warnings, "unknown-ext", `Unrecognized wallpaper extension: ${ext || "(none)"}`, "appearance.wallpaper.src");
        }

        const limit =
          effectiveType === "video" ? RESOURCE_LIMITS.videoMaxBytes : RESOURCE_LIMITS.imageMaxBytes;
        if (asset.size > limit) {
          push(
            errors,
            "asset-too-large",
            `Wallpaper ${formatBytes(asset.size)} exceeds ${formatBytes(limit)} limit`,
            "appearance.wallpaper.src"
          );
        } else if (effectiveType === "video" && asset.size > 100 * 1024 * 1024) {
          push(warnings, "large-video", `Large video (${formatBytes(asset.size)}); may slow startup`, "appearance.wallpaper.src");
        }

        checks.wallpaper = !errors.some((e) => e.path === "appearance.wallpaper.src" || e.path === "appearance.wallpaper.type");
      }
    }

    if (previewRel) {
      const asset = inspectAsset(opts, previewRel);
      if (!asset.ok) {
        push(errors, "unsafe-path", `identity.preview is unsafe: ${previewRel}`, "identity.preview");
      } else if (!asset.exists) {
        push(errors, "missing-asset", `Preview not found: ${previewRel}`, "identity.preview");
      } else {
        if (asset.size > RESOURCE_LIMITS.previewMaxBytes) {
          push(
            errors,
            "asset-too-large",
            `Preview ${formatBytes(asset.size)} exceeds ${formatBytes(RESOURCE_LIMITS.previewMaxBytes)} limit`,
            "identity.preview"
          );
        }
        const ext = asset.ext || "";
        if (!IMAGE_EXTS.has(ext)) {
          push(warnings, "preview-ext", `Preview should be an image (got ${ext || "no ext"})`, "identity.preview");
        }
        checks.preview = !errors.some((e) => e.path === "identity.preview");
      }
    }

    checks.assets = checks.wallpaper && checks.preview;
  } else {
    // Document-only: mark wallpaper/preview structural presence
    checks.wallpaper = !!wpSrc && !errors.some((e) => String(e.path || "").includes("wallpaper"));
    checks.preview = true;
    checks.assets = checks.wallpaper;
  }

  // —— Performance warnings ——
  const blur = typeof frost?.blur === "number" ? frost.blur : null;
  const isVideo =
    wpType === "video" || (wpSrc && VIDEO_EXTS.has(extOf(wpSrc)));

  if (tier === "quality" && blur != null && blur >= 40) {
    push(warnings, "high-gpu", "High GPU cost: performance.tier=quality with frost.blur ≥ 40");
  } else if (blur != null && blur >= 48) {
    push(warnings, "high-blur", "High GPU cost: frost.blur ≥ 48");
  }
  if (tier === "quality" && isVideo) {
    push(warnings, "quality-video", "performance.tier=quality + video wallpaper may be heavy on GPU");
  }
  if (tier === "lite" && isVideo) {
    push(warnings, "lite-video", "performance.tier=lite prefers static wallpaper; video still allowed");
  }

  const ok = errors.length === 0;
  return {
    ok,
    format: "contract",
    errors,
    warnings,
    checks,
    meta: {
      id: identity.id,
      name: identity.name,
      tier,
      wallpaperSrc: wpSrc,
      preview: previewRel,
    },
  };
}

/**
 * Validate a theme pack directory (must contain theme.json).
 */
export function validateThemeDir(themeDir, opts = {}) {
  const abs = path.resolve(themeDir);
  const themeJson = path.join(abs, "theme.json");
  if (!fs.existsSync(themeJson)) {
    return {
      ok: false,
      format: null,
      errors: [{ code: "missing-theme-json", message: `theme.json not found in ${abs}` }],
      warnings: [],
      checks: {},
      dir: abs,
    };
  }

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(themeJson, "utf8"));
  } catch (e) {
    return {
      ok: false,
      format: null,
      errors: [{ code: "invalid-json", message: `Invalid JSON: ${e.message}` }],
      warnings: [],
      checks: {},
      dir: abs,
    };
  }

  const dirName = path.basename(abs);
  const result = validateThemeDocument(raw, {
    ...opts,
    dirName,
    themeRoot: abs,
  });
  return { ...result, dir: abs, themeJson };
}

/**
 * Discover theme pack dirs under a parent (immediate children with theme.json).
 */
export function discoverThemeDirs(parentDir) {
  const abs = path.resolve(parentDir);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return [];
  const direct = path.join(abs, "theme.json");
  if (fs.existsSync(direct)) return [abs];

  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(abs, d.name))
    .filter((p) => fs.existsSync(path.join(p, "theme.json")))
    .sort();
}

export function formatValidationReport(result, { name = "" } = {}) {
  const lines = [];
  const title = name || result.meta?.id || path.basename(result.dir || "theme");
  lines.push("Cursor Skin Theme Validator");
  lines.push("");
  lines.push(`Theme: ${title}`);
  if (result.dir) lines.push(`Path:  ${result.dir}`);
  lines.push("");

  const mark = (ok) => (ok ? "✓" : "✗");
  const c = result.checks || {};
  if (Object.keys(c).length) {
    lines.push(`${mark(c.schema)} Schema`);
    lines.push(`${mark(c.identity)} Identity`);
    lines.push(`${mark(c.appearance)} Appearance`);
    lines.push(`${mark(c.workspace)} Workspace`);
    lines.push(`${mark(c.wallpaper)} Wallpaper`);
    lines.push(`${mark(c.preview)} Preview`);
    lines.push(`${mark(c.assets)} Assets`);
    lines.push("");
  }

  for (const w of result.warnings || []) {
    lines.push(`⚠ ${w.message}`);
  }
  if (result.warnings?.length) lines.push("");

  for (const e of result.errors || []) {
    lines.push(`✗ ${e.message}`);
  }
  if (result.errors?.length) lines.push("");

  if (result.ok) {
    lines.push(result.warnings?.length ? "Theme is valid (with warnings)." : "Theme is valid.");
  } else {
    lines.push("Theme is invalid.");
  }
  return lines.join("\n");
}

export { RESOURCE_LIMITS, CONTRACT_SCHEMA_VERSION };
