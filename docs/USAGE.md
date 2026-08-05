# Cursor Dream Skin — 使用说明

## 一句话

用带调试端口的方式启动官方 Cursor，再注入壁纸与面板。**不修改** `Cursor.exe`。

## 推荐用法（桌面快捷方式）

在仓库根目录执行一次：

```powershell
powershell -NoProfile -File scripts\install-launchers.ps1
```

桌面会出现三个快捷方式：

| 快捷方式 | 用途 | 是否动你的主 Cursor |
|----------|------|---------------------|
| **Cursor Dream Skin** | 独立测试窗 + 皮肤 | 否（推荐日常） |
| **Cursor Dream Skin (Main)** | 主会话上皮肤 | **是，会重启主 Cursor**（先保存） |
| **Restore Cursor Dream Skin** | 停 injector / 关测试窗 | 仅测窗 |

打开带皮肤的窗口后，点右下角附近的 **Dream Skin** 芯片换风格、上传壁纸。

> 用普通 Cursor 图标启动 = **没有**皮肤（没有调试端口）。

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

## 状态与日志

`%LOCALAPPDATA%\CursorDreamSkin\`

| 文件 | 含义 |
|------|------|
| `injector.log` | 注入守护进程日志 |
| `launcher-main.log` | Main 快捷方式失败时的原因 |
| `session.json` | 当前端口 / PID |
| `wallpapers/` | 你上传的壁纸副本 |
| `active-palette.json` | 上次色板 |

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

## 常见问题

**Main 没反应 / 弹错误**  
看 `%LOCALAPPDATA%\CursorDreamSkin\launcher-main.log`。先关掉所有 Cursor 再点 Main。

**提示 operation in progress**  
卡住的启动进程会占锁；再点一次会自动清僵尸进程。也可删 `op.lock`。

**需要 Node.js**  
当前仍依赖本机 Node 18+。Release 安装包（自带运行时）尚未做。
