# Theme Contract（定型）

> **规定「一个 Cursor Skin Theme 到底是什么」。**  
> Theme 只描述语义（要什么），**不写** Cursor DOM 选择器（那是 Adapter）。

机器可读定义：[`theme/schema/theme.schema.json`](../theme/schema/theme.schema.json)  
默认值：[`theme/schema/defaults.mjs`](../theme/schema/defaults.mjs)  
归一化：[`scripts/theme-schema.mjs`](../scripts/theme-schema.mjs)  
校验：[`theme/validator/validate.mjs`](../theme/validator/validate.mjs)（CLI：`npm run theme:validate`）

```text
Theme
├── identity      主题是谁
├── appearance    长什么样
├── workspace     各区域 surface（sidebar / editor / chat / auxiliary / terminal）
└── performance   有多重
```

`schemaVersion`：**始终为 `1`**（本 Contract）。  
旧版扁平 `schemaVersion: 1|2`（无 `identity` 块）仍由 Runtime **兼容加载**，新主题请只写本格式。

---

## 完整示例

```json
{
  "schemaVersion": 1,
  "identity": {
    "id": "cyber-night",
    "name": "Cyber Night",
    "version": "1.0.0",
    "author": "cursor-skin",
    "description": "Neon cyberpunk workspace.",
    "preview": "preview.jpg"
  },
  "appearance": {
    "wallpaper": { "type": "image", "src": "wallpaper/main.jpg" },
    "baseTheme": "Cursor Dark",
    "scheme": "dark",
    "paletteId": "slate-glow",
    "frost": { "enabled": true, "opacity": 0.5, "blur": 20 },
    "effects": { "glow": false, "vignette": true },
    "art": { "focusX": 0.68, "focusY": 0.38 }
  },
  "workspace": {
    "sidebar": { "surface": { "opacity": 0.4, "blur": 14 } },
    "editor": { "surface": { "opacity": 0.7, "blur": 4 }, "transparent": true },
    "chat": { "surface": { "opacity": 0.48, "blur": 10 }, "glass": true },
    "auxiliary": { "surface": { "opacity": 0.42, "blur": 12 } },
    "terminal": { "surface": { "opacity": 0.62, "blur": 8 }, "glass": true }
  },
  "performance": {
    "tier": "balanced"
  }
}
```

---

## 1. identity

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 稳定 id，建议与文件夹名一致，`kebab-case` |
| `name` | 是 | 显示名 |
| `version` | 否 | semver，默认 `1.0.0` |
| `author` | 否 | 作者署名 |
| `description` | 否 | 说明 |
| `preview` | 否 | 预览图相对路径，默认 `preview.jpg` |

Runtime 不依赖 identity 做渲染；社区列表会用。

---

## 2. appearance

视觉层。**禁止**放 `.part.sidebar` 等选择器。

| 字段 | 说明 |
|------|------|
| `wallpaper.type` | `image` \| `video` |
| `wallpaper.src` | 相对主题目录 |
| `paletteId` | 引用 `assets/palettes.json` |
| `palette` | 内联 token（有则优先于 `paletteId`） |
| `frost.enabled` | 是否启用霜化 |
| `frost.opacity` | 0–1，面板通透感 |
| `frost.blur` | 0–64，约等于「雾感」；Runtime 映射为 frost 滑条档位 |
| `effects.glow` / `vignette` | 预留效果开关（Adapter / CSS 后续接线） |
| `art` | 壁纸焦点 |

### Runtime 映射（当前）

- `frost.blur` → `frostLevel ≈ clamp(round(blur * 2.5), 20, 85)`（优先于 opacity）
- 否则 `frost.opacity` → `frostLevel ≈ round(opacity * 100)`
- `frost.enabled: false` → 低档霜化

---

## 3. workspace

用户感知的主要 Workspace 区域（**不是** Cursor 每一个面板）。

```text
┌──────────┬──────────────────────┬──────────────┐
│ sidebar  │   editor  /  chat    │  auxiliary   │
│          │                      │  (Changes…)  │
└──────────┴──────────────────────┴──────────────┘
                    terminal (bottom)
```

| 区域 | 语义 |
|------|------|
| `sidebar` | 左侧 Explorer / Search / SCM 等 |
| `editor` | 中间主编辑区（代码优先可读） |
| `chat` | AI Chat / Composer（与 editor 分开，可更通透） |
| `auxiliary` | 右侧辅助栏（Changes / Agent 等先统一控） |
| `terminal` | 底部终端 |

### Surface（第二层）

每个区域用统一的 `surface`，便于以后扩展 tint / border：

```json
"sidebar": {
  "surface": { "opacity": 0.45, "blur": 12 }
}
```

| 字段 | 范围 | 说明 |
|------|------|------|
| `surface.opacity` | 0–1 | 区域通透感（原样写入 `--cds-{region}-opacity`，即面板填充 alpha） |
| `surface.blur` | 0–64 | 区域雾感（原样写入 `--cds-{region}-blur`，单位 px） |
| `surface.tint` / `border` | string | 预留 |

兼容：顶层 `opacity` 仍可读，Validator 会警告并建议改 `surface.opacity`。  
`editor.transparent` / `chat.glass` / `terminal.glass` 仍为可选快捷开关。

**不要**在 Theme 里写 `.part.sidebar`——选择器只属于 Adapter。

### Runtime 映射（当前）

Theme `workspace.{region}.surface` → injector `cfg.surfaces` → Runtime 一等变量 → CSS：

| Region | opacity | blur | fill（无 alpha） |
|--------|---------|------|------------------|
| sidebar | `--cds-sidebar-opacity` | `--cds-sidebar-blur` | `--cds-sidebar-fill` |
| editor | `--cds-editor-opacity` | `--cds-editor-blur` | `--cds-editor-fill` |
| chat | `--cds-chat-opacity` | `--cds-chat-blur` | `--cds-chat-fill` |
| auxiliary | `--cds-auxiliary-opacity` | `--cds-auxiliary-blur` | `--cds-auxiliary-fill` |
| terminal | `--cds-terminal-opacity` | `--cds-terminal-blur` | `--cds-terminal-fill` |

`opacity: 0.45` → `--cds-sidebar-opacity: 0.45` → Adapter fill `--cds-sidebar: rgba(..., 0.45)`。opacity ≈ 0 时 `--cds-{region}-filter` 为 `none`，避免整窗把墙纸磨砂掉。Editor / auxiliary / terminal **不加** `backdrop-filter`（否则 Browse 变黑）。Browser 打开时 auxiliary 打穿。Right 滑块同时带动 terminal 透明度。

**Frost / Blur 滑块**只改浮动层（`--cds-frost` / `--cds-frost-soft`），**不**模糊墙纸，也**不**改各列 `surface.blur`。

Changes 独立拆分：等 Adapter 成熟后再加 `workspace.changes`，第一版用 `auxiliary`。

---

## 4. performance

```json
{ "performance": { "tier": "lite" | "balanced" | "quality" } }
```

| tier | 意图 |
|------|------|
| `lite` | 降 frost、少效果 |
| `balanced` | 默认 |
| `quality` | 完整效果 |

当前 Runtime：lite 略降 frostLevel，quality 略升。Validator 会对 quality + 高 blur / 视频发出 GPU 警告。

---

## Theme Validator

```powershell
npm run theme:validate -- themes/cyber-night
npm run theme:validate -- themes
```

检查层：结构 → 类型 → 范围 → 资源存在 → 体积上限 → 性能警告（不阻断）。  
与 Schema 共用 `defaults.mjs` 的 ranges / `RESOURCE_LIMITS`。  
`--allow-legacy`：旧扁平包仅做软检查（警告格式，仍校 id / wallpaper）。

---

## 目录布局

```text
themes/my-pack/
  theme.json
  preview.jpg
  wallpaper/
    main.jpg
  README.md
```

---

## 资源上限（Validator 强制）

见 `theme/schema/defaults.mjs` → `RESOURCE_LIMITS`：

| 类型 | 上限 |
|------|------|
| 图片 | 20 MB |
| 视频 | 500 MB |
| preview | 5 MB |

---

## 兼容

| 格式 | 识别 |
|------|------|
| **Contract**（本页） | 存在 `identity` + `appearance` |
| Legacy flat v2 | 无 identity，有 `environment` / 顶层 workspace 字段 |
| Legacy flat v1 | 顶层 `id` + `wallpaper` + `frost`/`veil` |

---

## 投稿检查清单

```powershell
npm run theme:validate -- themes/<your-pack>
```

- [ ] Validator 通过（无 ✗）
- [ ] `identity.id` = 文件夹名
- [ ] wallpaper / preview 存在且在资源上限内
- [ ] **没有** DOM 选择器字段
- [ ] 面板 Skin packs 能加载（自测观感；仓库样例主题不保证好看）

手写 `theme.json` + Validator 即可。Theme Creator GUI 暂缓。
