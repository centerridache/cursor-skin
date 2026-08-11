# cursor-skin

给 **Cursor** 桌面端换氛围壁纸与毛玻璃 UI 的 Windows 小工具。

通过本机 CDP（Chrome DevTools Protocol）注入，**不修改** `Cursor.exe` / `app.asar`，可随时还原。

> 非官方项目，与 Anysphere / Cursor 无关。  
> Idea & UX inspired by [Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin) — see [Credits](#credits--acknowledgements).

![cursor-skin demo](docs/media/demo.gif)

## Status

**目前处于测试阶段（early / WIP）。** API、选择器、面板和启动方式都可能随 Cursor 更新而失效或改动，欢迎提 Issue / PR，但请先用测试窗试用，并自行承担风险。

做这个项目的原因很简单：看过 Codex 上的 Dream Skin 之后，想在 Cursor 里也有类似体验，搜了一圈发现几乎没有现成的「cursor-skin」一类工具，就用 AI 一起把这条路跑通了。Cursor 用户量不如一些大众编辑器，但手里天天开着它的人并不少——希望能帮到同样想给工作区加一点氛围的人。

### Known issues（当前已知）

| 问题 | 说明 | 状态 |
|------|------|------|
| **Changes / Diff 仍不透明** | 右侧 **Changes**（stable-diff）区域常被实心底挡住，壁纸透不出；与侧栏/对话的统一 Frost 不一致。部分 Monaco diff 子层也盖死背景。 | 待修 |
| **启动白闪** | 注入完成前可能先露出主题底色/空窗，随后壁纸才接上。 | 后续再改（海报/提前 CSS） |
| **Agents Terminal 字体发虚** | 为透出壁纸开了 xterm 透明背景，部分环境字对比度不够、发虚。 | 已知权衡 / 待调 |
| **Agents Browser 网页不透** | 网页内容是原生 WebContentsView，Frost 无法让页面透壁纸；右侧栏外壳仍跟滑条变。 | Electron 限制 |
| **大图 / 视频首次偏慢** | 媒体仍需进 blob（Electron 限制）。视频仅在 **最小化 / 页面隐藏** 时暂停，恢复后再播（不用 window blur，避免切面板卡顿）。 | 已知 |
| **动态壁纸偶发停播** | 视频壁纸有时会停住不再播（非最小化场景也会出现）。 | 正在排查 |
| **小窗→最大化重影** | 偶发右侧半透明重影；部分像 Cursor / Electron 合成问题。 | 偶发 |
| **多 injector** | 同时只应跑 **一个** injector；多开会互相抢注入，布局异常。 | 使用约束 |

其它边角：主题包/选择器随 Cursor 大版本可能失效；迁仓库目录后需重跑 `install-launchers.ps1`。

---

## Features

- 全窗壁纸：静图 / GIF / MP4 / WebM，也支持 Wallpaper Engine 工坊文件夹
- 侧栏与右侧编辑区毛玻璃，壁纸可透出
- 应用内 **Dream Skin** 面板：明暗主题、配色、壁纸、**统一透明度滑条**（左侧栏 / 对话 / 右侧栏一起变）
- 桌面一键启动（测试窗 / 主会话 / 还原）
- 可逆：关掉 injector 即恢复，无二进制补丁

## Requirements

- Windows 10 / 11
- [Node.js](https://nodejs.org/) 18+（在 `PATH` 里）
- 已安装 Cursor

## Quick start

本仓库**没有**独立 Dream Skin `.exe`；「一键启动」是桌面快捷方式（`.lnk` → `.vbs` → PowerShell），图标用的是 Cursor。迁目录后请重新执行下面的安装命令。

```powershell
git clone https://github.com/centerridache/cursor-skin.git
cd cursor-skin
powershell -NoProfile -File scripts\install-launchers.ps1
```

桌面会出现三个快捷方式：

| Shortcut | When to use |
|----------|-------------|
| **Cursor Dream Skin** | 日常试用 — 独立测试窗（不碰主会话） |
| **Cursor Dream Skin (Main)** | 给真实主 Cursor 上皮肤（会重启 Cursor，先保存） |
| **Restore Cursor Dream Skin** | 停 injector / 关掉测试窗 |

打开带皮肤的窗口后，点右下角 **◐ Dream Skin** 芯片即可换风格、上传壁纸、调节透明度、切换主题包。

> 用系统里普通的 Cursor 图标启动 = **没有**皮肤（没有调试端口）。  
> `tools/RePKG.exe` 仅用于 WE 场景包解包，不是启动器。

更细的中文说明（含重装快捷方式）：[docs/USAGE.md](docs/USAGE.md) · 媒体 / WE：[docs/MEDIA.md](docs/MEDIA.md) · 安全：[docs/SECURITY.md](docs/SECURITY.md)

### Scripts only

```powershell
# 测试窗（推荐）
powershell -NoProfile -File scripts\start-dream-skin.ps1 -TestWindow

# 主会话（会关掉当前 Cursor 再开）
powershell -NoProfile -File scripts\start-dream-skin.ps1 -RestartExisting

powershell -NoProfile -File scripts\verify-dream-skin.ps1
powershell -NoProfile -File scripts\restore-dream-skin.ps1
```

## In-app panel

- 收缩芯片默认在 **右下角**（避开系统标题栏吸附区）
- 可拖芯片或面板标题；窗口缩放时会夹回可视区
- **Skin packs**：一键应用 `themes/<id>/` 包（壁纸 + 霜化 + 可选配色）
- **Base**：Cursor Dark / Light / Contrast
- **Color styles**：Moss Night、Ink Paper、Slate Glow、Terminal Amber、Ocean Depth、Graphite、Rose Ember、Snow Peak、Matcha 等（`assets/palettes.json`）
- **Frost**：左侧栏 / 对话 / 右侧栏 **统一** 透明度 0–100（越低壁纸越明显）；**Changes / Diff 目前仍常不透明**（见上方 Known issues）；Browser 网页内容本身仍不透明（Electron 限制）
- **Wallpaper**：选文件、选 WE 文件夹、粘贴路径、或重置（有 active pack 时回到该包默认壁纸）

自建主题包见 [docs/USAGE.md](docs/USAGE.md#theme-packs主题包)。

## Layout

```text
assets/     theme + CSS + inject payload + palettes + default art
themes/     shareable skin packs (theme.json + wallpaper)
scripts/    start / restore / verify / injector / launchers
docs/       USAGE, MEDIA, SECURITY, SELECTORS
tools/      optional RePKG for WE scene packs
```

运行时状态目录：`%LOCALAPPDATA%\CursorDreamSkin\`

## Notes

- 请用本仓库的快捷方式启动，这样 Cursor 才会带上 `--remote-debugging-port`
- Agents 等区域可能用 hashed class；壁纸层仍生效。选择器见 [docs/SELECTORS.md](docs/SELECTORS.md)
- 注入脚本遵守 Trusted Types，不用 `innerHTML`
- CDP 权限较强（仅 loopback）— 用完可 Restore。详见 [docs/SECURITY.md](docs/SECURITY.md)

Cursor 大版本更新后若皮肤失效，可探测 DOM：

```powershell
node scripts\probe-dom.mjs --port 9342
```

## Credits & acknowledgements

**cursor-skin** 的产品思路与体验参考了社区项目：

| Project | Author / repo | What we learned from |
|---------|---------------|----------------------|
| **[Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin)** | [Fei-Away](https://github.com/Fei-Away) | 用「氛围壁纸 + 毛玻璃」给 AI IDE 换肤的整体方向；桌面一键启动、应用内小面板换主题/壁纸等交互启发 |

本仓库是面向 **Cursor** 的独立实现（CDP 注入、Windows 启动脚本、面板与选择器等均为自行编写），**并非** Codex Dream Skin 的 fork，也不包含其闭源/二进制补丁逻辑。若你也在用 Codex，请直接支持原作者项目。

其它依赖与素材：

- Cursor / VS Code workbench 为第三方产品，商标归其权利人所有
- 可选 [RePKG](https://github.com/notscuffed/repkg)（`tools/`）用于解开部分 Wallpaper Engine 场景包 — 按其上游许可证使用
- 默认示例壁纸仅作氛围示意；请自行使用有权使用的图片/视频

## License

[MIT](LICENSE) © cursor-skin contributors

---

**Disclaimer:** Unofficial. Use at your own risk. Enabling the remote debugging port increases local attack surface — prefer the isolated test window for daily experiments.
