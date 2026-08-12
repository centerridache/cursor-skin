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

## Phase 2 — Theme System（v0.3 · 当前）

Theme = 工作空间状态描述（不只是壁纸配置）。

- [x] Theme Schema v2（`theme.json` + wallpaper / preview / README）
- [x] 加载器 normalize（v1 兼容 + v2 workspace 字段）
- [x] 官方示例主题 5 个
- [x] 文档契约 [THEME_SCHEMA.md](THEME_SCHEMA.md)

---

## Phase 3 — Theme Creator（v0.4）

- 本地 Creator（预览 + 导出 `theme.zip`）
- 先不做复杂 GUI / 登录

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
