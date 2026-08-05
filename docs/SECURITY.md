# Cursor Dream Skin — Security Notes

This tool is **not** affiliated with Anysphere / Cursor.

## What it does

- Launches the official `Cursor.exe` with `--remote-debugging-port=<loopback port>`
- Connects only to `127.0.0.1`
- Injects CSS and a decorative wallpaper DOM node through the Chrome DevTools Protocol (CDP)
- Does **not** modify Cursor install files, `app.asar`, or code signatures
- Does **not** read or change API keys, account data, or project files beyond what CDP can see in the renderer

## CDP risk model

Chromium remote debugging on loopback is powerful and **has no same-user authentication**. Any local process running as your Windows user can attach while the port is open.

While a themed session is active:

- Do not run untrusted local software
- Prefer `scripts\restore-dream-skin.ps1` when you are done so the debug port is closed
- Do not expose the CDP port via firewall, SSH reverse tunnels, or LAN binds (this tool binds loopback only)

## Trust boundaries

| Component | Trust |
|-----------|--------|
| Official Cursor binaries | Unmodified |
| Theme image / CSS / video under `assets/` or `%LOCALAPPDATA%\CursorDreamSkin` | Local user-controlled |
| Loopback media server (`127.0.0.1`, tokenized `/media`) | Serves one wallpaper video file only |
| Injector (`scripts/injector.mjs`) | Runs as your user; can evaluate JS in Cursor renderers |

Only load theme assets you trust. A malicious CSS/JS payload in this repo's injection path could alter the Cursor UI or scrape visible DOM content.

## Restore

```powershell
powershell -NoProfile -File scripts\restore-dream-skin.ps1
```

This stops the injector, closes Cursor processes started for the themed session, and relaunches Cursor without CDP.
