# Theme Creator

本地可视化编辑器。它**不是**另一套 Theme 格式，而是把 [Theme Contract](THEME_SCHEMA.md) 填成表单。

```text
Theme Schema  (defaults / ranges)
      /     |      \
 Runtime  Validator  Creator
```

## 启动

```powershell
npm run creator
```

会打开 `http://127.0.0.1:3847/`（只绑本机）。不要 `--open`：

```powershell
node scripts/creator-server.mjs
```

## 第一版能做什么

- 编辑 identity / wallpaper / frost / workspace（五区域 opacity + blur）/ performance
- 右侧 Workspace 预览（语义区域，不是 Cursor DOM）
- **校验**：同一套 `theme/validator/validate.mjs`（含资源存在与体积）
- **导入 / 导出** `theme.zip`

导出结构：

```text
my-theme.zip
└── my-theme/
    ├── theme.json
    ├── preview.jpg   （静图壁纸可与 wallpaper 同一文件）
    ├── wallpaper/main.jpg|mp4|…
    └── README.md
```

导入后可继续改，再校验、再导出。官方示例可一键载入再另存。

## 不做（第一版）

复杂 GUI、登录、云同步、在 Cursor 里实时预览（那是 Runtime）。
