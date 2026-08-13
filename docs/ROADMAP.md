# Cursor Skin — Roadmap

定位：**开源 AI IDE Theme Runtime**（非商业化、让用户创造主题）。

## 总目标

从「Cursor 动态皮肤工具」升级为 **Workspace Theme Runtime**：标准、Runtime、生态分层。

```text
Theme Community ---- Theme Creator ---- AI Generator
                 |
            Theme Schema
                 |
          Cursor Skin Runtime
                 |
          Cursor / other Electron IDEs
```

---

## Phase 1 — Runtime 稳固（v0.2）

目标：别人敢 clone 着用。

- [x] 轻量守护：CDP target 事件 + 稀疏 health + 独立 drain
- [x] 公开 `window.CursorSkin` Runtime API
- [x] Cursor selector adapter（`adapters/cursor/`）
- [x] 文档：RUNTIME_API / ROADMAP / README v0.2

不做：注入后完全退出、拆多仓库、Theme Schema 大改。

---

## Phase 2 — Theme System（v0.3）

Theme = 工作空间状态描述（不只是壁纸配置）。

- [x] Theme Contract 定型：`identity` / `appearance` / `workspace` / `performance`
- [x] Workspace = semantic regions + `surface`（sidebar / editor / chat / auxiliary / terminal）
- [x] JSON Schema + defaults + normalize（兼容旧扁平包）
- [x] 官方示例主题 5 个（Contract 样例；**不作为成品推荐**）
- [x] 文档 [THEME_SCHEMA.md](THEME_SCHEMA.md)
- [x] Theme Validator（`npm run theme:validate`）

---

## Phase 2b — Theme Validator（完成）

- [x] `theme validate` CLI，与 Schema 共用 defaults / ranges / 资源上限
- [x] 结构 / 类型 / 范围 / 资源存在性 / 性能警告

---

## Phase 2c — Adapter / CSS 解耦（完成）

- [x] Theme 只表达语义；选择器仅在 `adapters/cursor/`
- [x] 面板 Workspace 三滑块：Sidebar / Editor / Right 独立透明度
- [x] Runtime 按 Adapter `regions` 打 `data-cursor-skin`
- [x] 五块 Workspace 表面 CSS 走属性选择器 + 变量（见 [ADAPTER.md](ADAPTER.md)）
- [x] Adapter `holes` + `data-cursor-skin-hole`（内层实心底挖洞）
- [x] Adapter `mappings`：`surface.blur` → `--cds-frost-{region}`
- [x] Chrome 区域：`titlebar` / `statusbar` / `panel` / `diff`

---

## Phase 3 — Theme Creator（暂缓）

本地可视化编辑 / 导入导出 `theme.zip` 先不做。手写 `theme.json` + `npm run theme:validate`。

---

## Phase 4 — AI Theme Generator（v0.5）

- 自然语言 → theme.json + tokens + 壁纸提示

---

## Phase 5 — 社区生态

- 独立 `cursor-skin-themes` 仓库（Fork + PR）
- **不做**登录、云同步、收费商城

---

## 明确不做

登录系统、云同步、在线付费主题市场、过早的复杂 GUI。
