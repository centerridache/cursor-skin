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

## Injector（v0.2 event+health）

日常换肤需要 **injector 守护进程**（媒体服务 + 面板队列）。默认不再 4s 全量轮询：

| 机制 | 默认 | 作用 |
|------|------|------|
| CDP Target 发现 | 开启 | 新 workbench 窗口及时注入 |
| `--drain-ms` | 2000 | 只处理面板队列（换壁纸 / 主题包） |
| `--health-ms` | 30000 | 稀疏 probe；连续 miss ≥3 再注入 |
| `--adapter` | `adapters/cursor/default.json` | 选择器兼容层 |

`--poll-ms` 仍可用，会作为 `healthMs` 的别名。`--once` / `--verify` / `--remove` 行为不变。

日志里应看到：`mode=event+health drain=… health=… discover=on|off`。

## Runtime API

注入成功后，在 Cursor DevTools Console：

```js
CursorSkin.getState()
CursorSkin.apply({ frost: 40 })
CursorSkin.listThemes()
```

完整契约：[RUNTIME_API.md](RUNTIME_API.md)。

## 面板怎么用

- **收缩**：右下角芯片 `◐ Dream Skin`（可拖）
- **展开**：点芯片；标题栏点 `Hide` 再缩回去
- **Workspace**：Sidebar / Editor / Right 三个滑块，分别控左、中、右列透明度
- **Frost**：只改全局模糊，不再一刀切改三列透明度
- **拖动**：拖芯片或面板标题；不要拖到系统标题栏中间（已避开窗口吸附区）
- **小窗**：缩窗口时会自动夹回可视区
- **Skin packs**：列出 `themes/` 下包。仓库自带包是 Schema 样例，**观感有问题，请自行测试，日常请用自己的壁纸**
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

主题包遵循 **Theme Contract**（`identity` / `appearance` / `workspace` / `performance`）。  
完整契约：[THEME_SCHEMA.md](THEME_SCHEMA.md) · JSON Schema：`theme/schema/theme.schema.json`

```text
themes/
  my-pack/
    theme.json
    preview.jpg
    wallpaper/
      main.jpg
    README.md
```

`theme.json` 示例（缩略）：

```json
{
  "schemaVersion": 1,
  "identity": {
    "id": "my-pack",
    "name": "My Pack",
    "version": "1.0.0",
    "author": "you",
    "description": "…",
    "preview": "preview.jpg"
  },
  "appearance": {
    "wallpaper": { "type": "image", "src": "wallpaper/main.jpg" },
    "paletteId": "moss-night",
    "frost": { "enabled": true, "opacity": 0.5, "blur": 16 }
  },
  "workspace": {
    "sidebar": { "surface": { "opacity": 0.45, "blur": 12 } },
    "editor": { "surface": { "opacity": 0.72, "blur": 4 } },
    "chat": { "surface": { "opacity": 0.5, "blur": 10 } },
    "auxiliary": { "surface": { "opacity": 0.45, "blur": 12 } },
    "terminal": { "surface": { "opacity": 0.65, "blur": 8 } }
  },
  "performance": { "tier": "balanced" }
}
```

规则：

- Theme **不写** Cursor DOM 选择器（那是 Adapter）
- `surface.opacity` / `surface.blur` 由 Runtime 写成 `--cds-{region}-opacity` / `--cds-{region}-blur`（CSS 用 `color-mix` + `blur()`）；Adapter `mappings` 的 fill / `--cds-frost-*` 仍会同步写入
- 加载经 `scripts/theme-schema.mjs` normalize 后再 apply
- 旧扁平 schema 仍可加载；新包请只用 Contract
- 官方包：`default-atmosphere`、`moss-night`、`cyber-night`、`forest-mist`、`ink-minimal` — **仅 Schema 样例，观感有问题，不建议当成品**；请用自己的壁纸在测试窗验证
- 本地做包：按 [THEME_SCHEMA.md](THEME_SCHEMA.md) 写 `theme.json`，再用 `npm run theme:validate`

## 脚本分工（开源维护）

**用户入口**

- `scripts/install-launchers.ps1` — 装/卸桌面快捷方式  
- `scripts/start-dream-skin.ps1` — 启动 Cursor + injector  
- `scripts/restore-dream-skin.ps1` — 还原  
- `scripts/verify-dream-skin.ps1` — 探测是否注入成功  

**运行时（一般不用手点）**

- `scripts/theme-schema.mjs` — Theme Contract + legacy normalize  
- `theme/schema/` — `theme.schema.json` + defaults  
- `theme/validator/validate.mjs` — Theme 质量门槛（结构 / 类型 / 范围 / 资源）  
- `scripts/theme-validate.mjs` — CLI：`npm run theme:validate -- themes/<id>`  
- `scripts/injector.mjs` — CDP 注入；event+health 守护  
- `scripts/load-adapter.mjs` — 加载 `adapters/cursor/*.json`  
- `scripts/media-server.mjs` — 本机 loopback 媒体  
- `scripts/workshop-resolve.mjs` — Wallpaper Engine 目录解析  
- `scripts/open-media-dialog.ps1` — 置顶文件/文件夹对话框  
- `scripts/common-windows.ps1` — 公共 Windows 逻辑  
- `adapters/cursor/default.json` — Adapter（Cursor DOM 变了优先改 `regions` / `holes` / `selectors`）  

**资源**

- `assets/dream-skin.css` / `renderer-inject.js` / `palettes.json` / `theme.json`
- `themes/<id>/` — Theme Contract 包（见 [THEME_SCHEMA.md](THEME_SCHEMA.md)）
- [ADAPTER.md](ADAPTER.md) / [RUNTIME_API.md](RUNTIME_API.md) / [ROADMAP.md](ROADMAP.md) / [THEME_SCHEMA.md](THEME_SCHEMA.md)

## 常见问题

**Main 没反应 / 弹错误**  
看 `%LOCALAPPDATA%\CursorDreamSkin\launcher-main.log`。先关掉所有 Cursor 再点 Main。

**提示 operation in progress**  
卡住的启动进程会占锁；再点一次会自动清僵尸进程。也可删 `op.lock`。

**需要 Node.js**  
当前仍依赖本机 Node 18+。Release 安装包（自带运行时）尚未做。
