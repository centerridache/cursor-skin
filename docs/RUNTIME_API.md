# Skin Runtime API (v0.2)

Public surface for Cursor Skin. Prefer this over poking DOM / CSS directly.

Runs **inside** the Cursor workbench after injection. Themes and tools should talk to the Runtime; the injector + adapter map own Cursor version differences.

## Global

```js
window.CursorSkin
```

Legacy bridge (injector / panel queue) remains at `window.__cursorDreamSkin`.

## Methods

| Method | Description |
|--------|-------------|
| `version` | Semver string, e.g. `"0.3.0"` |
| `apply(partial)` | Apply a partial skin update (see below) |
| `getState()` | Snapshot: frost, scheme, theme ids, wallpaper label |
| `setFrost(level)` | Global blur 0–100 (does **not** change column opacity or `surface.blur`) |
| `setWorkspace({ sidebar, editor, auxiliary, chat, terminal })` | Per-region opacity 0–1 |
| `setWorkspaceBlur({ sidebar, editor, chat, auxiliary, terminal })` | Per-region blur 0–64 px |
| `listThemes()` | Theme pack catalog from injector |
| `listPalettes()` | Color style catalog |
| `listBaseThemes()` | Cursor Dark / Light / Contrast chips |

### `apply(partial)` examples

```js
// Frost only (immediate)
CursorSkin.apply({ frost: 40 });
CursorSkin.setWorkspace({ sidebar: 0.4, editor: 0.85, auxiliary: 0.45 });
// or
CursorSkin.apply({ frost: { level: 40 } });

// Queue theme pack (needs injector daemon)
CursorSkin.apply({ themePackId: "moss-night" });

// Queue palette
CursorSkin.apply({ paletteId: "ocean-depth" });

// Queue base Cursor theme
CursorSkin.apply({ themeId: "Cursor Dark", scheme: "dark" });

// Queue wallpaper path (absolute path on disk; injector resolves)
CursorSkin.apply({ wallpaper: { source: "D:\\\\wallpapers\\\\rain.mp4" } });
```

Wallpaper / pack / palette changes are **queued** to the injector (`drain` every ~2s). Frost applies in-renderer immediately.

Theme packs are normalized by [`theme-schema.mjs`](../scripts/theme-schema.mjs) into Runtime fields (frost / veil / art / palette).  
Canonical format: [Theme Contract](THEME_SCHEMA.md) (`identity` + `appearance` + `workspace` + `performance`). Legacy flat packs still load.  
Quality gate before shipping packs: `npm run theme:validate -- themes/<id>`.

### `getState()`

```js
{
  runtimeVersion: "0.3.0",
  payloadVersion: 42,
  frost: 40,
  workspace: {
    sidebar: 0.4,
    editor: 0.7,
    auxiliary: 0.42,
    chat: 0.48,
    terminal: 0.6,
    blur: { sidebar: 14, editor: 4, chat: 10, auxiliary: 12, terminal: 8 }
  },
  scheme: "dark",
  themeId: "Cursor Dark",
  paletteId: "",
  themePackId: "default-atmosphere",
  wallpaperLabel: "Default Atmosphere",
  skinActive: true
}
```

## Compatibility layer

Selector map: [`adapters/cursor/default.json`](../adapters/cursor/default.json).  
Region tagging: Runtime stamps `data-cursor-skin` from Adapter `regions` and `data-cursor-skin-hole` from `holes`; surface CSS targets those attributes. See [ADAPTER.md](ADAPTER.md).

Injector loads the adapter at start (`--adapter path`) and passes `selectors` + `regions` + `holes` + `mappings` into `apply`. `probe()` uses the selector map for health and reports tagged regions / holes.

## Injector watch (v0.2)

Daemon mode is `event+health` (not a 4s full poll):

| Loop | Default | Role |
|------|---------|------|
| Target discovery | CDP `Target.setDiscoverTargets` | New / changed workbench → drain/inject |
| Drain | `--drain-ms` (2000) | Panel queue (wallpaper, packs, …) |
| Health | `--health-ms` (30000) | Probe; re-apply after 3 soft misses |

`--poll-ms` still accepted as an alias that sets `healthMs` when health is left at default.

Daily skin use **still needs** the injector process (media server + queue). Use `--once` only for one-shot apply.

## Trusted Types

Do not set `innerHTML` from themes or extensions. Build DOM with `createElement` / `textContent`.
