/**
 * Minimal Theme Validator contract tests (node:test).
 * Run: npm run test:theme
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { validateThemeDocument } from "./validate.mjs";

function validTheme() {
  return {
    schemaVersion: 1,
    identity: {
      id: "cyber-night",
      name: "Cyber Night",
      version: "1.0.0",
      author: "cursor-skin",
      description: "Cold cyan glow for late-night sessions.",
      preview: "preview.jpg",
      tagline: "Cold cyan glow — late-night sessions.",
      brandSubtitle: "CURSOR SKIN",
    },
    appearance: {
      wallpaper: { type: "image", src: "wallpaper/main.jpg" },
      baseTheme: "Cursor Dark",
      scheme: "dark",
      paletteId: "slate-glow",
      frost: { enabled: true, opacity: 0.5, blur: 20 },
      effects: { glow: false, vignette: true },
      art: { focusX: 0.68, focusY: 0.38, safeArea: "left", taskMode: "ambient" },
    },
    workspace: {
      sidebar: { surface: { opacity: 0.4, blur: 14 } },
      editor: { surface: { opacity: 0.7, blur: 4 }, transparent: true },
      chat: { surface: { opacity: 0.48, blur: 10 }, glass: true },
      auxiliary: { surface: { opacity: 0.42, blur: 12 } },
      terminal: { surface: { opacity: 0.62, blur: 8 }, glass: true },
    },
    performance: { tier: "balanced" },
  };
}

function errorCodes(result) {
  return result.errors.map((e) => e.code);
}

test("valid theme document passes", () => {
  const result = validateThemeDocument(validTheme());
  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test("unknown workspace region is an error", () => {
  const raw = validTheme();
  raw.workspace.composer = { surface: { opacity: 0.2, blur: 8 } };
  const result = validateThemeDocument(raw);
  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes("unknown-workspace-key"));
  assert.ok(!result.warnings.some((w) => w.code === "unknown-workspace-key"));
});

test("unknown field is an error", () => {
  const raw = validTheme();
  raw.identity.nickname = "cn";
  const result = validateThemeDocument(raw);
  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes("unknown-field"));
  const hit = result.errors.find((e) => e.code === "unknown-field");
  assert.equal(hit.path, "identity.nickname");
});

test("selector key inside array is forbidden", () => {
  const raw = validTheme();
  raw.workspace.sidebar.layers = [{ selector: ".monaco-workbench" }];
  const result = validateThemeDocument(raw);
  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes("forbidden-selector-field"));
  const hit = result.errors.find((e) => e.code === "forbidden-selector-field");
  assert.match(String(hit.path), /layers\[0\]\.selector$/);
});

test("opacity out of range is an error", () => {
  const raw = validTheme();
  raw.appearance.frost.opacity = 1.2;
  const result = validateThemeDocument(raw);
  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes("range"));
  assert.ok(result.errors.some((e) => e.path === "appearance.frost.opacity" && e.code === "range"));
});

test("blur out of range is an error", () => {
  const raw = validTheme();
  raw.appearance.frost.blur = 65;
  const result = validateThemeDocument(raw);
  assert.equal(result.ok, false);
  assert.ok(errorCodes(result).includes("range"));
  assert.ok(result.errors.some((e) => e.path === "appearance.frost.blur" && e.code === "range"));
});
