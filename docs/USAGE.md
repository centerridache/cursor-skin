# Cursor Dream Skin / cursor-skin — 使用说明

仓库名：**cursor-skin**。面板与快捷方式里仍显示 Dream Skin。

## 一句话

用带调试端口的方式启动官方 Cursor，再注入壁纸与面板。**不修改** `Cursor.exe`。

## 推荐用法（桌面快捷方式）

本项目**没有**单独的 Dream Skin `.exe` 安装包（带 Node 运行时的 Release 尚未做）。  
日常用的「一键程序」是桌面 / 开始菜单里的 **`.lnk` 快捷方式**：图标是 Cursor，双击后无黑窗，实际走 `scripts/*.vbs` → `start-dream-skin.ps1`。

仓库迁目录或重装后，在仓库根目录执行一次即可重装并写回正确路径：

```powershell
cd <path-to>\cursor-skin
powershell -NoProfile -File scripts\install-launchers.ps1
```

桌面与「开始菜单 → Cursor Dream Skin」会出现三个快捷方式：

| 快捷方式 | 用途 | 是否动你的主 Cursor |
|----------|------|---------------------|
| **Cursor Dream Skin** | 独立测试窗 + 皮肤 | 否（推荐日常） |
| **Cursor Dream Skin (Main)** | 主会话上皮肤 | **是，会重启主 Cursor**（先保存） |
| **Restore Cursor Dream Skin** | 停 injector / 关测试窗 | 仅测窗 |

打开带皮肤的窗口后，点右下角附近的 **Dream Skin** 芯片换风格、上传壁纸、切主题包。

> 用普通 Cursor 图标启动 = **没有**皮肤（没有调试端口）。

卸载快捷方式：

```powershell
powershell -NoProfile -File scripts\install-launchers.ps1 -Uninstall
```

**和仓库里其它 `.exe` 的区别：** `tools/RePKG.exe` 只用于解开 Wallpaper Engine 的 `scene.pkg`，不是皮肤启动器。

## 脚本用法

```powershell
cd <repo>

# 测试窗（推荐）
powershell -NoProfile -File scripts\start-dream-skin.ps1 -TestWindow

# 主会话（会关掉当前 Cursor 再开）
powershell -NoProfile -File scripts\start-dream-skin.ps1 -RestartExisting

# 校验 / 还原
powershell -NoProfile -File scripts\verify-dream-skin.ps1
powershell -NoProfile -File scripts\restore-dream-skin.ps1
```

## 面板怎么用

- **收缩**：右下角芯片 `◐ Dream Skin`（可拖）
- **展开**：点芯片；标题栏点 `Hide` 再缩回去
- **拖动**：拖芯片或面板标题；不要拖到系统标题栏中间（已避开窗口吸附区）
- **小窗**：缩窗口时会自动夹回可视区
- **Skin packs**：列出 `themes/` 下包，一键应用壁纸 / frost / palette
- **Color styles**：单独改配色，不删主题包
- **Wallpaper**：自定义图后当前 pack 记为覆盖；Reset 回到 active pack 默认壁纸（若有）

## 状态与日志

`%LOCALAPPDATA%\CursorDreamSkin\`

| 文件 | 含义 |
|------|------|
| `injector.log` | 注入守护进程日志 |
| `launcher-main.log` | Main 快捷方式失败时的原因 |
| `session.json` | 当前端口 / PID |
| `wallpapers/` | 你上传的壁纸副本 |
| `active-palette.json` | 上次色板 |
| `active-theme-pack.json` | 上次主题包 id（及是否被自定义壁纸覆盖） |

## Theme packs（主题包）

把「壁纸 + 氛围参数 +（可选）配色」收成可分享的目录，放在仓库根目录 `themes/<id>/`：

```text
themes/
  my-pack/
    theme.json
    wallpaper.jpg      # 或 .mp4 / .webm 等视频
    preview.jpg        # 可选；没有就用 wallpaper
```

`theme.json` 最小约定：

```json
{
  "schemaVersion": 1,
  "id": "my-pack",
  "name": "My Pack",
  "wallpaper": { "type": "image", "src": "wallpaper.jpg" },
  "appearance": "auto",
  "baseTheme": "Cursor Dark",
  "scheme": "dark",
  "paletteId": "moss-night",
  "frost": 40,
  "art": { "focusX": 0.72, "focusY": 0.4 },
  "veil": { "sidebar": 0.28, "auxiliary": 0.26, "editor": 0.32, "composer": 0.22 },
  "colors": null
}
```

规则：

- `wallpaper.src` 相对主题包目录；`type` 为 `image` 或 `video`
- `paletteId` 引用全局 `assets/palettes.json` 里已有 id；也可设内联 `colors`（有则优先于 `paletteId`）
- 运行时壳子（CSS / inject）仍在 `assets/`，主题包只带外观资源
- 面板 **Skin packs** 会扫描 `themes/*/theme.json` 并一键应用；自定义壁纸仍可用，此时 pack 记为「自定义覆盖」
- injector 可用 `--themes-dir` 指定目录（默认仓库根 `themes/`）

示例包：`default-atmosphere`、`moss-night`。

## 脚本分工（开源维护）

**用户入口**

- `scripts/install-launchers.ps1` — 装/卸桌面快捷方式  
- `scripts/start-dream-skin.ps1` — 启动 Cursor + injector  
- `scripts/restore-dream-skin.ps1` — 还原  
- `scripts/verify-dream-skin.ps1` — 探测是否注入成功  

**运行时（一般不用手点）**

- `scripts/injector.mjs` — CDP 注入与监听  
- `scripts/media-server.mjs` — 本地媒体  
- `scripts/workshop-resolve.mjs` — Wallpaper Engine 目录解析  
- `scripts/open-media-dialog.ps1` — 置顶文件/文件夹对话框  
- `scripts/common-windows.ps1` — 公共 Windows 逻辑  

**资源**

- `assets/dream-skin.css` / `renderer-inject.js` / `palettes.json` / `theme.json`
- `themes/<id>/` — 可扫描主题包（见上文）

## 常见问题

**Main 没反应 / 弹错误**  
看 `%LOCALAPPDATA%\CursorDreamSkin\launcher-main.log`。先关掉所有 Cursor 再点 Main。

**提示 operation in progress**  
卡住的启动进程会占锁；再点一次会自动清僵尸进程。也可删 `op.lock`。

**需要 Node.js**  
当前仍依赖本机 Node 18+。Release 安装包（自带运行时）尚未做。
