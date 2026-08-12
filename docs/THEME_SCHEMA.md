# Theme Schema v2

Theme packs describe a **workspace mood**, not only a wallpaper path.

Runtime loads packs from `themes/<id>/`, normalizes them via [`scripts/theme-schema.mjs`](../scripts/theme-schema.mjs), then applies frost / veil / palette / media.

## Layout

Recommended:

```text
themes/my-pack/
  theme.json
  preview.jpg
  wallpaper/
    main.jpg          # or night.mp4
  README.md           # optional one-liner
```

Still accepted (legacy):

```text
themes/my-pack/
  theme.json
  wallpaper.jpg
  preview.jpg
```

## `theme.json` (schemaVersion 2)

```json
{
  "schemaVersion": 2,
  "id": "cyber-night",
  "name": "Cyber Night",
  "tagline": "Cold cyan glow — late-night sessions.",
  "wallpaper": { "type": "image", "src": "wallpaper/main.jpg" },
  "preview": "preview.jpg",
  "baseTheme": "Cursor Dark",
  "scheme": "dark",
  "paletteId": "slate-glow",
  "environment": { "opacity": 0.58, "blur": 20 },
  "sidebar": { "opacity": 0.4 },
  "chat": { "glass": true },
  "editor": { "transparent": true },
  "terminal": { "glass": true },
  "art": { "focusX": 0.68, "focusY": 0.38 },
  "colors": null
}
```

### Field notes

| Field | Meaning |
|-------|---------|
| `schemaVersion` | `2` = workspace schema; `1` = legacy flat frost/veil (still loaded) |
| `wallpaper.src` | Relative to pack dir |
| `wallpaper.type` | `image` \| `video` |
| `paletteId` | Id from `assets/palettes.json` |
| `colors` | Inline tokens; wins over `paletteId` when set |
| `frost` | 0–100; **wins over** `environment.blur` when both set |
| `environment.blur` | Approx px; Runtime uses `clamp(round(blur * 2.5), 20, 85)` if no `frost` |
| `environment.opacity` / `sidebar.opacity` | Drive default veil alphas when `veil` omitted |
| `chat.glass` / `editor.transparent` | Tweak veil for chat / editor |
| `terminal.glass` | Documented intent; terminal CSS already clears xterm plates |
| `veil` | Explicit `{ sidebar, auxiliary, editor, composer }` overrides derived veils |
| `art` | Focus point for wallpaper framing |

## Legacy schemaVersion 1

Older packs with top-level `frost` + `veil` + `wallpaper.src` continue to work. Prefer upgrading to v2 when editing.

## Contribution checklist

- [ ] Unique `id` matching folder name  
- [ ] `wallpaper` file exists and is ≤ recommended sizes ([MEDIA.md](MEDIA.md))  
- [ ] `preview.jpg` present  
- [ ] You have rights to ship the art  
- [ ] Pack loads: `node -e` scan or Dream Skin panel → Skin packs  
- [ ] No absolute machine paths in `theme.json`  

## Official packs (v0.3)

| id | Mood | palette |
|----|------|---------|
| `default-atmosphere` | Default | — |
| `moss-night` | Deep green | `moss-night` |
| `cyber-night` | Cold cyan | `slate-glow` |
| `forest-mist` | Soft green | `matcha` |
| `ink-minimal` | Low-contrast | `graphite` |
