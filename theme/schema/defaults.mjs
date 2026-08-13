/**
 * Theme Contract defaults (shared by Runtime / Validator).
 *
 * Workspace = semantic regions (not Cursor DOM).
 * Each region uses a Surface: opacity / blur (+ future tint / border).
 */
export const CONTRACT_SCHEMA_VERSION = 1;

/** First-class workspace regions. */
export const WORKSPACE_REGIONS = [
  "sidebar",
  "editor",
  "chat",
  "auxiliary",
  "terminal",
];

export const DEFAULTS = {
  identity: {
    version: "1.0.0",
    author: "",
    description: "",
    preview: "preview.jpg",
  },
  appearance: {
    wallpaper: { type: "image", src: "wallpaper/main.jpg" },
    baseTheme: "Cursor Dark",
    scheme: "dark",
    paletteId: "",
    frost: { enabled: true, opacity: 0.5, blur: 16 },
    effects: { glow: false, vignette: false },
    art: { focusX: 0.72, focusY: 0.4, safeArea: "left", taskMode: "ambient" },
  },
  workspace: {
    sidebar: { surface: { opacity: 0.45, blur: 12 } },
    editor: { surface: { opacity: 0.85, blur: 4 } },
    chat: { surface: { opacity: 0.55, blur: 10 } },
    auxiliary: { surface: { opacity: 0.45, blur: 12 } },
    terminal: { surface: { opacity: 0.6, blur: 8 } },
  },
  performance: {
    tier: "balanced",
  },
};

/** Resource limits (docs + Validator). */
export const RESOURCE_LIMITS = {
  imageMaxBytes: 20 * 1024 * 1024,
  videoMaxBytes: 500 * 1024 * 1024,
  previewMaxBytes: 5 * 1024 * 1024,
};

export const PERFORMANCE_TIERS = ["lite", "balanced", "quality"];

/** Surface blur range (px intent; Adapter maps to CSS). */
export const SURFACE_BLUR_MAX = 64;

