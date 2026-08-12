/**
 * Load Cursor selector adapter for Skin Runtime probe / config.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ADAPTER = path.join(__dirname, "..", "adapters", "cursor", "default.json");

export function loadAdapter(adapterPath = DEFAULT_ADAPTER) {
  const p = path.resolve(adapterPath || DEFAULT_ADAPTER);
  if (!fs.existsSync(p)) {
    return {
      id: "cursor-default",
      cursorVersion: "1.x",
      selectors: {
        workbench: ".monaco-workbench",
        sidebar: ".part.sidebar, nav.ui-sidebar, .ui-sidebar",
        auxiliarybar: ".part.auxiliarybar",
        editor: ".part.editor, .part.editorgroupcontainer",
        editorPanel: ".editor-panel-container, [class*=\"editor-panel-container\"]",
        chat: '.composer-bar, [class*="composer"], .aichat-pane, .agent-panel',
        titlebar: ".part.titlebar",
        statusbar: ".part.statusbar",
        terminal: '[data-component="terminal-tab-content"], .xterm',
        browser: '[data-component="browser-tab-content"]',
        diff: '.diff-tab-content, [id*="tabpanel-editor-panel-group-stable-diff"]',
        agentsShell: ".workspaces-container, .workspace-container",
        glassRoot: '[class*="glass-"]',
      },
      path: "",
    };
  }
  const raw = JSON.parse(fs.readFileSync(p, "utf8"));
  return {
    id: raw.id || "cursor-default",
    cursorVersion: raw.cursorVersion || "1.x",
    selectors: raw.selectors && typeof raw.selectors === "object" ? raw.selectors : {},
    path: p,
  };
}
