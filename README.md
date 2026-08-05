# Cursor Dream Skin

给 **Cursor** 桌面端加全窗壁纸与毛玻璃氛围的开源小工具（Windows）。

通过本机 CDP 注入 · 原生控件仍可点击 · **不修改** `Cursor.exe` / `app.asar`

> Unofficial. Not affiliated with Anysphere or Cursor.  
> Inspired by [Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin).

English summary below · 中文用法详见 [docs/USAGE.md](docs/USAGE.md)

---

## Features

- Full-window wallpaper: JPG / PNG / WebP / GIF / MP4 / WebM，以及 Wallpaper Engine 工坊文件夹
- Frosted sidebar & editor panels — 壁纸透出来，代码仍可读
- In-app **Dream Skin** panel：基础主题、色板、上传壁纸、**UI 透明度滑条**
- Desktop shortcuts（双击启动，类似 Codex Dream Skin）
- One-command restore — 关掉注入即可，无二进制补丁

## Requirements

- Windows 10 / 11
- [Node.js](https://nodejs.org/) 18+（需在 `PATH` 里）
- 已安装 Cursor

## Quick start

```powershell
git clone https://github.com/<you>/cursor-dream-skin.git
cd cursor-dream-skin
powershell -NoProfile -File scripts\install-launchers.ps1
```

桌面会出现三个快捷方式：

| Shortcut | When to use |
|----------|-------------|
| **Cursor Dream Skin** | 日常试用 — 独立测试窗（不影响主会话） |
| **Cursor Dream Skin (Main)** | 给正在用的 Cursor 上皮肤（会重启 Cursor，先保存） |
| **Restore Cursor Dream Skin** | 停 injector / 关测试窗 |

打开带皮肤的窗口 → 点右下角 **Dream Skin** 芯片 → 换风格、上传壁纸、拖动 **Frost** 滑条调透明度。

> 用普通 Cursor 图标启动 = **没有**皮肤（没有调试端口）。

### Scripts only

```powershell
powershell -NoProfile -File scripts\start-dream-skin.ps1 -TestWindow
powershell -NoProfile -File scripts\verify-dream-skin.ps1
powershell -NoProfile -File scripts\restore-dream-skin.ps1

# Main session (restarts Cursor)
powershell -NoProfile -File scripts\start-dream-skin.ps1 -RestartExisting
```

## Dream Skin panel

- Collapsed chip defaults to **bottom-right**（避开系统标题栏吸附）
- Drag the chip or panel header；缩窗口时会自动夹回可视区
- **Base**: Cursor Dark / Light / Contrast
- **Color styles**: Moss Night, Ink Paper, Slate Glow, Terminal Amber, Ocean Depth, Graphite, Rose Ember, Snow Peak, Matcha…
- **Frost**: UI opacity 0–100（越低壁纸越透，越高越易读）
- **Wallpaper**: 上传文件 / WE 文件夹 / 粘贴路径 / 重置默认

## Layout

```text
assets/     theme CSS + inject payload + palettes + default art
scripts/    start / restore / verify / injector / launchers
docs/       USAGE · MEDIA · SECURITY · SELECTORS
tools/      optional RePKG for Wallpaper Engine scene packs
themes/     reserved
```

Runtime state: `%LOCALAPPDATA%\CursorDreamSkin\`

## Docs

| Doc | Content |
|-----|---------|
| [docs/USAGE.md](docs/USAGE.md) | 中文使用说明 / FAQ |
| [docs/MEDIA.md](docs/MEDIA.md) | 壁纸与 Wallpaper Engine |
| [docs/SECURITY.md](docs/SECURITY.md) | CDP 风险与还原 |
| [docs/SELECTORS.md](docs/SELECTORS.md) | UI 选择器说明 |

## Notes

- Always launch via Dream Skin shortcuts so Cursor gets `--remote-debugging-port`.
- Agents UI uses hashed classes; wallpaper still applies. See SELECTORS.md.
- Inject payload avoids `innerHTML` (Trusted Types).
- CDP on loopback is powerful — run **Restore** when finished. See [SECURITY.md](docs/SECURITY.md).

## Probe after a Cursor update

```powershell
node scripts\probe-dom.mjs --port 9342
```

## License

[MIT](LICENSE)

RePKG in `tools/` is third-party ([notscuffed/repkg](https://github.com/notscuffed/repkg), MIT) — see `tools/THIRD-PARTY-NOTICES.txt`.
