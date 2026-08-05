# Cursor Dream Skin — DOM Selectors

Validated on a live CDP session (Cursor Agents workbench) against install path
`E:\cursor project\cursor\Cursor.exe` (custom layout; default installs under
`%LOCALAPPDATA%\Programs\cursor\` also work).

Re-run after Cursor upgrades:

```powershell
node scripts\probe-dom.mjs --port 9342
```

## CDP target filter

| Field | Rule |
|-------|------|
| `type` | `page` |
| URL | contains `workbench` (case-insensitive) |
| Example URL | `vscode-file://vscode-app/.../workbench/workbench.html` |
| WebSocket | `ws://127.0.0.1:<same-port>/devtools/page/...` only |

## Observed shells

### Agents window (`title: Cursor Agents`)

Body classes include `cursor-light` / `cursor-dark`, `vs`, and many hashed `glass-*` utilities.

| Selector | Observed |
|----------|----------|
| `.monaco-workbench` | HIT (often with `nosidebar nopanel noauxiliarybar`) |
| `.workspaces-container` / `.workspace-container` | HIT |
| `[class*="glass-"]` | HIT |
| `.part.sidebar` / `.part.auxiliarybar` / `.part.editor` | miss (Agents shell) |
| `.composer-bar` | miss on empty Agents home |

### Classic IDE workbench

When a folder is open in the editor window, expect the usual VS Code parts:

| Selector | Role |
|----------|------|
| `.part.sidebar` | Explorer sidebar |
| `.part.auxiliarybar` | Chat / Agent auxiliary bar |
| `.part.editor` | Editor groups |
| `.part.titlebar` / `.part.statusbar` / `.part.panel` | Chrome |

CSS covers both shells: wallpaper + veil always; part translucency when parts exist.

## Injection markers (owned by this tool)

| Marker | Meaning |
|--------|---------|
| `html[data-cursor-dream-skin="1"]` | Skin active |
| `html[data-cds-scheme="light\|dark"]` | Detected appearance |
| `#cursor-dream-skin-root` | Wallpaper root (createElement only — Trusted Types) |
| `#cursor-dream-skin-css` | Injected stylesheet |
| `window.__cursorDreamSkin` | `{ apply, remove, probe }` |

## Trusted Types note

Cursor enables Trusted Types. Never set `innerHTML` in `renderer-inject.js`; build nodes with `createElement` / `appendChild`.

## Layering note

Wallpaper must sit **behind** UI (`z-index: 0`, first in `body`, `pointer-events: none`). Do **not**:

- set `position: relative` / `z-index` on `body` (collapses Agents `position: absolute` layout to height 0)
- use `z-index: -1` for the wallpaper (often sinks under the window canvas and vanishes)

Agents solid panels (`.agent-panel`, `.glass-sidebar-docked`) must be forced translucent so the art shows through.

## Scheme detection

Prefer body classes: `cursor-light`, `cursor-dark`, `vscode-light`, `vscode-dark`, `vs-dark`, then `color-scheme`.
