# Wallpaper & media guide

Guidelines for still images and video backgrounds in Cursor Dream Skin.

## Recommended sizes

| Kind | Ideal | Acceptable | Notes |
|------|-------|------------|-------|
| Still image | **1920×1080** (16:9) | 2560×1440, 3840×2160 | Wider than tall works best; ultrawide (21:9) is fine. File ≤ **200 MB**. |
| Video | **1920×1080** H.264 MP4 | 1280×720–2560×1440 | File ≤ **8 GB**. Prefer 1080p/24–30fps; Dream Skin pauses playback when Cursor is unfocused or minimized. |

Focus point in `theme.json` (`art.focusX` / `art.focusY`, 0–1) should sit on the calm area of the art so UI text stays readable. Default is roughly right-center.

## Still images

- **Formats:** `.jpg` / `.jpeg`, `.png`, `.webp`, **`.gif`** (animated GIFs supported)
- **Max size:** **200 MB**
- **Transport:** **disk path only** (`File.path` via the file picker). Custom stills (including GIF) stream from the loopback media server via an `<img>` layer so animation plays.
- **Content:** Prefer a **UI-free** photo or illustration (no fake window chrome). Busy faces behind the composer hurt contrast.
- **How to load:** Dream Skin panel → **Browse on disk…** (opens a real Windows file dialog from the injector; Cursor’s in-page picker often hides `File.path`). Or paste a full path like `E:\wallpaper\a.gif` → **Apply path**.

## Video (MP4 / WebM)

- **Formats:** `.mp4` (H.264 + AAC/no audio preferred), `.webm` (VP9/VP8)
- **Max size:** **8 GB** (served from the original path; not fully copied)
- **Transport:** **disk path only** via file picker / paste path; streamed from loopback then fetched into a **blob URL** (Electron blocks raw `http://127.0.0.1` media)
- **Playback:** muted, looping; **pauses when the Cursor window is minimized / page hidden**, resumes when visible again
- **Tip:** Prefer **1920×1080 H.264 ~24–30 fps**. 4K/60fps still costs more while the window is visible.

### Steam Wallpaper Engine

Paste a **workshop folder** (or use **Browse WE folder…**), for example:

`<SteamLibrary>/steamapps/workshop/content/431960/<workshop-id>`

Dream Skin reads `project.json` and:

| `type` | What we do |
|--------|------------|
| **video** | Auto-select the `.mp4` / `.webm` (not the tiny `preview.gif`) |
| **scene** | Run bundled `tools/RePKG.exe` on `scene.pkg`, convert textures, pick the largest main image (e.g. `Texture.png`) |

Notes:

- Big MP4s may take a short time: Cursor cannot play `http://127.0.0.1` media directly, so we fetch into a **blob URL** (uses RAM ≈ file size once).
- Scene wallpapers become a **still image** (WE effects / parallax / music are not simulated).
- If RePKG is missing, scenes fall back to `preview.*` only.

## Reset

**Reset wallpaper** clears custom image/video and returns to `assets/` default art from `theme.json`.

## Security notes

- Media server binds **loopback only**, requires a random token, and serves **one** validated file.
- Symlinks / oversized files are rejected.
- See [SECURITY.md](SECURITY.md).
