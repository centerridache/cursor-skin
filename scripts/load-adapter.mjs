/**
 * Load Cursor selector adapter for Skin Runtime probe + region tagging.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ADAPTER = path.join(__dirname, "..", "adapters", "cursor", "default.json");

const FALLBACK_SELECTORS = {
  workbench: ".monaco-workbench",
  sidebar: ".part.sidebar, nav.ui-sidebar, .ui-sidebar",
  auxiliarybar: ".part.auxiliarybar",
  editor: ".part.editor, .part.editorgroupcontainer",
  editorPanel: '.editor-panel-container, [class*="editor-panel-container"]',
  chat: '.composer-bar, [class*="composer"], .aichat-pane, .agent-panel',
  titlebar: ".part.titlebar",
  statusbar: ".part.statusbar",
  terminal: '[data-component="terminal-tab-content"], .xterm',
  browser: '[data-component="browser-tab-content"]',
  diff: '.diff-tab-content, [data-component="diff-tab-content"], [id*="tabpanel-editor-panel-group-stable-diff"]',
  agentsShell: ".workspaces-container, .workspace-container",
  glassRoot: '[class*="glass-"]',
};

const FALLBACK_REGIONS = {
  sidebar: [
    "[data-cds-sidebar-dock='1']",
    "div:has(> nav.ui-sidebar)",
    "div:has(> .ui-sidebar)",
    ".monaco-workbench .part.sidebar",
  ],
  editor: [
    ".monaco-workbench .part.editor",
    ".monaco-workbench .part.editorgroupcontainer",
  ],
  chat: [".agent-panel", ".aichat-pane", ".composer-bar"],
  auxiliary: [".monaco-workbench .part.auxiliarybar", ".editor-panel-container"],
  terminal: ["[data-component='terminal-tab-content']"],
  titlebar: [".part.titlebar", "[data-cds-titlebar='1']"],
  statusbar: [".part.statusbar"],
  panel: [".monaco-workbench .part.panel"],
  diff: [".diff-tab-content", "[data-component='diff-tab-content']"],
};

export function loadAdapter(adapterPath = DEFAULT_ADAPTER) {
  const p = path.resolve(adapterPath || DEFAULT_ADAPTER);
  if (!fs.existsSync(p)) {
    return {
      id: "cursor-default",
      cursorVersion: "1.x",
      attr: "data-cursor-skin",
      capabilities: ["workspace-surfaces", "probe"],
      selectors: FALLBACK_SELECTORS,
      regions: FALLBACK_REGIONS,
      holes: [],
      mappings: {},
      holeAttr: "data-cursor-skin-hole",
      path: "",
    };
  }
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return {
    id: raw.id || "cursor-default",
    cursorVersion: raw.cursorVersion || "1.x",
    attr: raw.attr || "data-cursor-skin",
    capabilities: Array.isArray(raw.capabilities) ? raw.capabilities : ["workspace-surfaces", "probe"],
    selectors: raw.selectors && typeof raw.selectors === "object" ? raw.selectors : FALLBACK_SELECTORS,
    regions: raw.regions && typeof raw.regions === "object" ? raw.regions : FALLBACK_REGIONS,
    holes: Array.isArray(raw.holes) ? raw.holes : [],
    mappings: raw.mappings && typeof raw.mappings === "object" ? raw.mappings : {},
    holeAttr: raw.holeAttr || "data-cursor-skin-hole",
    path: p,
  };
}
