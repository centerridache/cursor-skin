# Cursor Skin

**v0.3** · Open-source **Theme Runtime** for Cursor

让 Cursor 活起来。

一个轻量级的 **Cursor 动态皮肤引擎 / Theme Runtime**：在 IDE 里叠上动态壁纸、透明与毛玻璃 UI、主题包——**不修改** Cursor 安装文件，也不另起一套壁纸进程。

![Cursor Skin demo](docs/media/demo.gif)

> 非官方项目，与 Anysphere / Cursor 无关。  
> **v0.3（early / WIP）**：Theme Contract + Validator + Runtime。选择器仍可能随 Cursor 更新失效。  
> **请用自己的壁纸在测试窗里试**，不要依赖仓库自带的示例主题（见下方说明）。

文档：[使用](docs/USAGE.md) · [Theme Schema](docs/THEME_SCHEMA.md) · [Runtime API](docs/RUNTIME_API.md) · [路线图](docs/ROADMAP.md) · [媒体](docs/MEDIA.md) · [安全](docs/SECURITY.md)

---

## 这是什么

Cursor Skin 是面向 **Cursor IDE** 的轻量视觉定制层。

它把动态壁纸、半透明 UI、毛玻璃和主题系统直接做进 Cursor 窗口里——利用 Cursor 自带的 Chromium 渲染（含 GPU / 视频解码），而不是再挂一个全屏壁纸程序。

不是「再贴一张背景图」那么简单，而是一套可切换、可还原的 **皮肤运行时（Theme Runtime）**。  
v0.2 起提供稳定门面 `window.CursorSkin`（见 [docs/RUNTIME_API.md](docs/RUNTIME_API.md)）。  
v0.3 起主题包遵循 [Theme Contract](docs/THEME_SCHEMA.md)（`identity` / `appearance` / `workspace` / `performance`）。

### 示例主题包（有问题，不建议当成品用）

`themes/` 里的包只是 Theme Contract 的样例，**部分区域/透明度/雾感在当前 Cursor 上会错、会脏、会对不齐**。

- **不建议**日常使用自带主题  
- **建议**自己准备静图或视频壁纸，在独立测试窗里调 Sidebar / Editor / Right，确认能接受再开主会话  
- 自建包用 [Theme Schema](docs/THEME_SCHEMA.md) + `npm run theme:validate`

| id | 仅作样例 |
|----|----------|
| `default-atmosphere` | 默认氛围 |
| `moss-night` | 苔绿夜 |
| `cyber-night` | 冷青赛博 |
| `forest-mist` | 森雾 |
| `ink-minimal` | 石墨极简 |

面板 **Skin packs** 仍能一键加载这些样例，方便对照 Schema；观感请自行测试。

---

## 功能特点

### 动态壁纸

支持本地：

- 静图：PNG / JPG / WebP / GIF  
- 视频：MP4 / WebM  

常见氛围都能上：雨夜、星空、赛博、自然风景……面板里选文件或粘贴路径即可。

### 毛玻璃 UI

- 左侧栏 / 对话区 / 右侧栏统一透明度滑条（Frost）  
- 壁纸可从半透明层透出  
- 部分区域受 Electron 限制仍不透（见 [已知问题](#已知问题)）

### 主题系统

`themes/<id>/` 主题包，一键切换：

- 壁纸  
- 霜化强度  
- 可选配色 / 明暗基调  

仓库自带示例包；自建方式见 [docs/USAGE.md](docs/USAGE.md#theme-packs主题包)。

### 应用内面板

右下角 **◐ Dream Skin** 芯片：换主题包、配色、壁纸、透明度；可拖动、可收起。

---

## 安全的运行时注入

Cursor Skin 用本机 **Chrome DevTools Protocol（CDP）** 做运行时注入。

**不会：**

- 修改 `Cursor.exe`  
- 修改 `app.asar`  
- 替换官方安装文件  

**好处：**

- Cursor 大版本更新后更不容易「装坏」  
- 关掉 injector / 点 Restore 即可恢复  
- 不污染原始安装  

启动会带上 loopback 调试端口，用完建议 Restore。细节：[docs/SECURITY.md](docs/SECURITY.md)。

---

## 性能设计

设计目标：加视觉效果的同时，尽量少抢 CPU / 内存。

当前做法包括：

- 走 Cursor 自带 Chromium 解码与合成（不另开壁纸引擎）  
- 窗口 **最小化 / 页面隐藏** 时暂停视频壁纸，恢复显示再播  
- 避免用 window blur 乱暂停（Cursor 里切面板容易误触发、反而卡顿）  

实测整体机器占用通常不大，但仍取决于壁纸分辨率与码率——优先 **1080p、24–30fps** 的 H.264。

> **说明：** 用本仓库脚本 / 快捷方式启动 Cursor，会比普通双击 Cursor **更慢一些**（要带调试端口、等 injector 注入）。这是换肤路径的代价，日常写代码仍可用普通 Cursor 图标（无皮肤）。

---

## Wallpaper Engine 兼容

可以导入 **部分** Steam Wallpaper Engine 工坊文件夹，**不是**完整复刻 WE。

| 类型 | 支持情况 |
|------|----------|
| 视频壁纸（`video`） | 支持，自动选 MP4 / WebM |
| 图片 / 解包后的静图 | 支持 |
| Scene 场景包 | **实验**：用 RePKG 抽出主纹理，变成**静图**（无 WE 视差 / 特效 / 音乐） |
| Web 壁纸 | **尚未支持**（路线图） |

Cursor Skin **不会**重新实现 Wallpaper Engine；目标是用轻量方式吃掉常见资源。详见 [docs/MEDIA.md](docs/MEDIA.md)。

---

## 快速开始

需要：Windows 10/11、[Node.js](https://nodejs.org/) 18+、已安装 Cursor。

本仓库**没有**独立 `.exe` 启动器；桌面快捷方式由脚本安装（`.lnk` → `.vbs` → PowerShell）。

```powershell
git clone https://github.com/centerridache/cursor-skin.git
cd cursor-skin
powershell -NoProfile -File scripts\install-launchers.ps1
```

| 快捷方式 | 用途 |
|----------|------|
| **Cursor Dream Skin** | 独立测试窗（推荐，不碰主会话） |
| **Cursor Dream Skin (Main)** | 给主 Cursor 上皮肤（会重启，先保存） |
| **Restore Cursor Dream Skin** | 停 injector / 关测试窗 |

打开后点右下角 **Dream Skin** 换壁纸与主题。

> 普通 Cursor 图标启动 = **没有**皮肤（没有调试端口）。  
> 迁目录后请重跑 `install-launchers.ps1`。

仅脚本：

```powershell
powershell -NoProfile -File scripts\start-dream-skin.ps1 -TestWindow
powershell -NoProfile -File scripts\start-dream-skin.ps1 -RestartExisting
powershell -NoProfile -File scripts\restore-dream-skin.ps1
```

更多：[docs/USAGE.md](docs/USAGE.md) · [docs/RUNTIME_API.md](docs/RUNTIME_API.md) · [docs/MEDIA.md](docs/MEDIA.md) · [docs/SECURITY.md](docs/SECURITY.md)

---

## 已知问题

用户更常碰到的先写：

- **启动比普通 Cursor 慢**：脚本要开调试端口并注入皮肤  
- **大尺寸视频首次加载偏慢**（需进 blob）  
- **动态壁纸偶发停播**（非最小化也会停）— 正在排查  
- **部分 UI 无法完全透明**（Electron / 原生层限制），例如 Agents Browser 网页内容  
- **Cursor 大版本更新后** 选择器可能失效，需再适配  

其它：

| 问题 | 说明 | 状态 |
|------|------|------|
| **启动白闪** | 注入完成前可能先闪主题底色 | 后续再改 |
| **Agents Terminal 字体发虚** | xterm 透壁纸后对比度可能不够 | 已知权衡 |
| **小窗→最大化重影** | 偶发右侧半透明重影 | 偶发 |
| **多 injector** | 同时只应跑一个 injector | 使用约束 |

失效时可探测 DOM：`node scripts\probe-dom.mjs --port 9342`（见 [docs/SELECTORS.md](docs/SELECTORS.md)）。

---

## 路线规划

完整阶段见 [docs/ROADMAP.md](docs/ROADMAP.md)。

### v0.3（当前）

- **Theme Contract** 定型（identity / appearance / workspace / performance）  
- `theme/schema/` + normalize（兼容旧扁平包）  
- **Theme Validator**：`npm run theme:validate` / `npm run test:theme`  
- 示例 5 主题（仅样例，见上方警告）  
- CDP event+health 守护、`window.CursorSkin`  
- Adapter `regions` / `holes` / `mappings` → `data-cursor-skin`；CSS 只写属性  
- Runtime：按需 Tool Pane heal、Region untagged probe（不再 1.2s 全量扫 DOM）  
- Theme Creator 本地 GUI **暂缓**（手写 `theme.json` 即可）

### 近期 Runtime / Contract（摘要）

- Workspace 五区域 `surface.opacity` / `surface.blur` 写入 CSS 变量；editor/auxiliary/terminal 不再用会把 BrowserView 涂黑的 `backdrop-filter`  
- Adapter 作为静态 Region/Hole 的唯一来源；health 只记录 Region miss，不自动 re-apply  
- Validator 补齐 tagline / art.safeArea 等字段；未知字段与未知 workspace region 为 **error**；禁止键递归进 array  
- 去掉 Theme Creator（`npm run creator`）

### 性能（约 5 秒实机采样）

测试环境：16 逻辑线程笔记本 + NVIDIA 核显/独显；Cursor 主会话在跑。壁纸为 **4K H.264 视频**。数字含 Cursor 自身 UI，不是纯注入脚本。

| 场景 | Cursor CPU | 占整机大约 | GPU | 视频解码（NVDEC） |
|------|------------|------------|-----|-------------------|
| 不注入皮肤 | ~1.0 核 | ~6.5% | ~34% | 0% |
| 皮肤 + 4K 壁纸播放 | ~1.3 核 | ~8% | ~38% | **~60%** |
| 皮肤仍在、壁纸暂停（切后台 / 最小化同类路径） | ~1.0 核 | ~6% | ~37% | **0%** |

结论：4K 动态壁纸的开销主要在 **GPU 解码**，不在 Theme 轮询。窗口隐藏时 Runtime 会停视频。更省电请用 **1080p** 或静图（见 [MEDIA.md](docs/MEDIA.md)）。Injector 守护在 5 秒采样里 CPU 可忽略。

### 下一步

- 动态壁纸稳定性；社区主题仓库  

---

## 仓库结构

```text
assets/      CSS、注入脚本、默认素材、配色
adapters/   Cursor Adapter（regions + holes + mappings）
theme/      Theme Contract（schema + validator + defaults）
themes/     官方 / 本地主题包
scripts/    启动 / 还原 / injector / theme-schema / theme-validate
docs/       使用、Theme Contract、Runtime API、路线图
tools/      可选 RePKG（解 WE scene.pkg）
package.json  version 0.3.0
```

状态目录：`%LOCALAPPDATA%\CursorDreamSkin\`

---

## 致谢

感谢以下项目对 AI 开发工具「氛围换肤」方向的探索：

- [Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin)（[Fei-Away](https://github.com/Fei-Away)）

Cursor Skin 是面向 **Cursor** 的**独立实现**（CDP、Windows 脚本、面板与选择器均为自行编写），**不是** Codex Dream Skin 的 fork，也不包含其闭源 / 二进制补丁逻辑。若你也在用 Codex，请直接支持原作者。

其它：Cursor / VS Code 商标归权利人所有；可选 [RePKG](https://github.com/notscuffed/repkg) 按其上游许可证使用；请使用你有权使用的壁纸素材。

---

## License

[MIT](LICENSE) © cursor-skin contributors

**免责声明：** 非官方工具，风险自担。开启本机调试端口会扩大本机攻击面——日常试用优先用独立测试窗。
