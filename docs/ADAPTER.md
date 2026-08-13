# Adapter

> Theme 描述「要什么」。Adapter 决定「Cursor 当前 DOM 怎么实现」。

Cursor 更新只改 Adapter，**不改 Theme**。

```text
Theme (workspace.sidebar.surface)
        ↓
     Runtime
        ↓
Adapter.regions / holes / mappings
        ↓
  data-cursor-skin="sidebar"
  data-cursor-skin-hole
        ↓
   CSS variables / attribute selectors
```

## 文件

[`adapters/cursor/default.json`](../adapters/cursor/default.json)

| 字段 | 用途 |
|------|------|
| `selectors` | probe / health（节点在不在） |
| `regions` | 语义区域 → 选择器列表（打 `data-cursor-skin`） |
| `holes` | 内层实心底 → 打 `data-cursor-skin-hole`（透明，露出壁纸） |
| `mappings` | 区域 → CSS 变量（`fill` / `veil` / `blur`） |
| `attr` | 默认 `data-cursor-skin` |
| `holeAttr` | 默认 `data-cursor-skin-hole` |
| `capabilities` | Runtime 能力声明 |

## Regions

Workspace（跟 Theme 契约对齐，走 opacity / blur）：

`sidebar` · `editor` · `chat` · `auxiliary` · `terminal`

Chrome（只打标，不进 HUD 透明度滑块）：

`titlebar` · `statusbar` · `panel` · `diff`

## Mappings

Runtime 把 `surface.opacity` / `surface.blur` 写到这些变量；CSS 只读变量，不读 Theme。

| 区域 | fill | veil | blur |
|------|------|------|------|
| sidebar | `--cds-sidebar` | `--cds-veil-sidebar` | `--cds-frost-sidebar` |
| editor | `--cds-editor-canvas` | `--cds-veil-editor` | `--cds-frost-editor` |
| chat | `--cds-chat-panel` | `--cds-veil-composer` | `--cds-frost-chat` |
| auxiliary | `--cds-editor-panel` | `--cds-veil-auxiliary` | `--cds-frost-auxiliary` |
| terminal | `--cds-terminal-panel` | — | `--cds-frost-terminal` |

全局 Frost 滑块只改 `--cds-frost` / `--cds-frost-soft`（浮动层），**不覆盖**各列 `surface.blur`。

## CSS

表面与挖洞只写属性：

```css
[data-cursor-skin="sidebar"] { ... }
[data-cursor-skin="chat"] { ... }
[data-cursor-skin-hole] { background: transparent; }
[data-cursor-skin="titlebar"] { ... }
```

Composer 输入框（`.ui-prompt-input__container`）仍是 Cursor 侧浮动卡片打磨，不是 hole。

## Cursor 升级后

1. `node scripts/probe-dom.mjs --port 9342`
2. 只改 `adapters/cursor/default.json` 的 `regions` / `holes` / `selectors`
3. 不必改官方 `themes/*/theme.json`，也不必为换 class 名改 `dream-skin.css`

加载：injector `--adapter`（默认本文件）。
