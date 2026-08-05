/**
 * Cursor Dream Skin — renderer payload (runs inside Cursor workbench).
 * Idempotent apply/remove. No innerHTML (Trusted Types).
 */
(function cursorDreamSkinPayload(global) {
  const MARK = "data-cursor-dream-skin";
  const ROOT_ID = "cursor-dream-skin-root";
  const STYLE_ID = "cursor-dream-skin-css";
  const HUD_ID = "cursor-dream-skin-hud";
  const VERSION = 18;

  const THEMES = [
    { id: "Cursor Dark", label: "Dark", scheme: "dark" },
    { id: "Cursor Light", label: "Light", scheme: "light" },
    { id: "Cursor Dark High Contrast", label: "Contrast", scheme: "dark" },
  ];

  const prev = global.__cursorDreamSkin;
  const pending =
    prev && Array.isArray(prev._pending) ? prev._pending : [];
  let activeThemeId =
    prev && typeof prev._activeThemeId === "string" ? prev._activeThemeId : "";
  let activePaletteId =
    prev && typeof prev._activePaletteId === "string" ? prev._activePaletteId : "";
  let wallpaperLabel =
    prev && typeof prev._wallpaperLabel === "string" ? prev._wallpaperLabel : "Default";
  let paletteCatalog =
    prev && Array.isArray(prev._paletteCatalog) ? prev._paletteCatalog : [];

  function detectScheme() {
    try {
      const body = document.body;
      const cls = body ? String(body.className || "") : "";
      if (/\bcursor-light\b/.test(cls) || /\bvscode-light\b/.test(cls)) return "light";
      if (/\bcursor-dark\b/.test(cls) || /\bvscode-dark\b/.test(cls) || /\bvs-dark\b/.test(cls)) {
        return "dark";
      }
      if (/\bvs\b/.test(cls) && !/\bvs-dark\b/.test(cls)) return "light";
      if (body && body.classList.contains("vscode-high-contrast")) return "dark";
      const cs = getComputedStyle(document.documentElement).colorScheme;
      if (cs === "light" || cs === "dark") return cs;
    } catch (_) {
      /* ignore */
    }
    return "dark";
  }

  function ensureStyle(cssText) {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    // Avoid rewriting identical CSS (brief unstyled flash on theme switch).
    if (el.textContent === (cssText || "")) return el;
    el.textContent = cssText || "";
    return el;
  }

  function readStoredMedia() {
    try {
      const raw = sessionStorage.getItem("cds-media");
      if (!raw) return null;
      const o = JSON.parse(raw);
      if (!o || typeof o !== "object") return null;
      if (o.imageUrl || o.videoUrl) return o;
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  function writeStoredMedia(imageUrl, videoUrl, label) {
    try {
      if (imageUrl || videoUrl) {
        sessionStorage.setItem(
          "cds-media",
          JSON.stringify({
            imageUrl: imageUrl || "",
            videoUrl: videoUrl || "",
            label: label || "",
          })
        );
      } else {
        sessionStorage.removeItem("cds-media");
      }
    } catch (_) {
      /* ignore */
    }
  }

  function ensureRoot(imageDataUrl, art, videoUrl, imageUrl, opts) {
    const options = opts || {};
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      root.setAttribute("aria-hidden", "true");

      const wallpaper = document.createElement("div");
      wallpaper.className = "cds-wallpaper";
      const still = document.createElement("img");
      still.className = "cds-still";
      still.alt = "";
      still.draggable = false;
      const video = document.createElement("video");
      video.className = "cds-video";
      video.setAttribute("playsinline", "true");
      video.setAttribute("muted", "true");
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.preload = "auto";
      const veil = document.createElement("div");
      veil.className = "cds-veil";
      root.appendChild(wallpaper);
      root.appendChild(still);
      root.appendChild(video);
      root.appendChild(veil);

      const body = document.body || document.documentElement;
      body.insertBefore(root, body.firstChild);
    } else if (root.parentElement === document.documentElement && document.body) {
      document.body.insertBefore(root, document.body.firstChild);
    }

    let still = root.querySelector(".cds-still");
    if (!still) {
      still = document.createElement("img");
      still.className = "cds-still";
      still.alt = "";
      still.draggable = false;
      const wall = root.querySelector(".cds-wallpaper");
      if (wall && wall.nextSibling) root.insertBefore(still, wall.nextSibling);
      else root.appendChild(still);
    }

    let video = root.querySelector(".cds-video");
    if (!video) {
      video = document.createElement("video");
      video.className = "cds-video";
      video.setAttribute("playsinline", "true");
      video.setAttribute("muted", "true");
      video.muted = true;
      video.loop = true;
      video.autoplay = true;
      video.preload = "auto";
      const after = still.nextSibling;
      if (after) root.insertBefore(video, after);
      else root.appendChild(video);
    }

    const html = document.documentElement;
    if (art) {
      if (typeof art.focusX === "number") {
        html.style.setProperty("--cds-focus-x", Math.round(art.focusX * 100) + "%");
      }
      if (typeof art.focusY === "number") {
        html.style.setProperty("--cds-focus-y", Math.round(art.focusY * 100) + "%");
      }
    }

    // Theme/palette pass: leave wallpaper DOM untouched.
    if (options.skipMediaReload) {
      return root;
    }

    let nextImage = imageUrl || "";
    let nextUrl = videoUrl || "";
    const existingKey = root.getAttribute("data-cds-media-key") || "";
    const existingCustom = existingKey.indexOf("i:") === 0 || existingKey.indexOf("v:") === 0;

    // Prefer live custom media / session cache over stale default poster (early-script race).
    if (!nextImage && !nextUrl && !options.resetWallpaper) {
      const stored = readStoredMedia();
      if (stored) {
        nextImage = stored.imageUrl || "";
        nextUrl = stored.videoUrl || "";
      } else if (existingCustom && options.preserveCustomMedia !== false) {
        return root;
      }
    }

    if (options.resetWallpaper) {
      writeStoredMedia("", "", "");
    } else if (nextImage || nextUrl) {
      writeStoredMedia(nextImage, nextUrl, options.wallpaperLabel || "");
    }

    const mediaKey =
      (nextUrl ? "v:" : nextImage ? "i:" : "d:") +
      (nextUrl || nextImage || (nextImage || nextUrl ? "" : imageDataUrl ? "default" : ""));
    const sameMedia = existingKey === mediaKey && mediaKey !== "";

    // Bundled default art only when no custom still/video (avoids theme-switch flash).
    if (nextImage || nextUrl) {
      html.style.setProperty("--cds-art", "none");
    } else if (imageDataUrl) {
      html.style.setProperty("--cds-art", 'url("' + imageDataUrl + '")');
    }

    if (sameMedia) {
      return root;
    }
    root.setAttribute("data-cds-media-key", mediaKey);

    if (nextImage) {
      const applyStillSrc = function (src) {
        still.onload = function () {
          if (still.naturalWidth > 0 && still.naturalHeight > 0) {
            html.setAttribute("data-cds-still", "1");
          } else {
            html.removeAttribute("data-cds-still");
          }
        };
        still.onerror = function () {
          html.removeAttribute("data-cds-still");
        };
        // Keep previous frame visible until the new source paints.
        if (still.src && still.src !== src) {
          /* leave data-cds-still as-is during swap */
        }
        still.setAttribute("src", src);
        still.src = src;
      };
      if (/^https?:\/\/127\.0\.0\.1(?::\d+)?\//i.test(nextImage)) {
        fetch(nextImage)
          .then(function (r) {
            if (!r.ok) throw new Error("still fetch " + r.status);
            return r.blob();
          })
          .then(function (blob) {
            try {
              if (still._cdsObjectUrl) URL.revokeObjectURL(still._cdsObjectUrl);
            } catch (_) {}
            const obj = URL.createObjectURL(blob);
            still._cdsObjectUrl = obj;
            applyStillSrc(obj);
          })
          .catch(function () {
            html.removeAttribute("data-cds-still");
            applyStillSrc(nextImage);
          });
      } else {
        applyStillSrc(nextImage);
      }
    } else {
      html.removeAttribute("data-cds-still");
      try {
        if (still._cdsObjectUrl) URL.revokeObjectURL(still._cdsObjectUrl);
      } catch (_) {}
      still._cdsObjectUrl = "";
      still.removeAttribute("src");
      still.src = "";
    }

    if (nextUrl) {
      html.removeAttribute("data-cds-still");
      const startVideo = function (src) {
        video.onloadeddata = function () {
          if (video.videoWidth > 0) {
            html.setAttribute("data-cds-video", "1");
            const play = video.play();
            if (play && typeof play.catch === "function") play.catch(function () {});
          } else {
            html.removeAttribute("data-cds-video");
          }
        };
        video.onerror = function () {
          html.removeAttribute("data-cds-video");
        };
        video.setAttribute("src", src);
        video.src = src;
        try {
          video.load();
        } catch (_) {}
        const play = video.play();
        if (play && typeof play.catch === "function") play.catch(function () {});
      };
      if (/^https?:\/\/127\.0\.0\.1(?::\d+)?\//i.test(nextUrl)) {
        fetch(nextUrl)
          .then(function (r) {
            if (!r.ok) throw new Error("video fetch " + r.status);
            return r.blob();
          })
          .then(function (blob) {
            try {
              if (video._cdsObjectUrl) URL.revokeObjectURL(video._cdsObjectUrl);
            } catch (_) {}
            const obj = URL.createObjectURL(blob);
            video._cdsObjectUrl = obj;
            startVideo(obj);
          })
          .catch(function () {
            startVideo(nextUrl);
          });
      } else {
        startVideo(nextUrl);
      }
    } else {
      html.removeAttribute("data-cds-video");
      try {
        if (video._cdsObjectUrl) URL.revokeObjectURL(video._cdsObjectUrl);
      } catch (_) {}
      video._cdsObjectUrl = "";
      video.removeAttribute("src");
      video.src = "";
      try {
        video.pause();
        video.load();
      } catch (_) {
        /* ignore */
      }
    }
    return root;
  }

  let lastPaletteTokens =
    prev && prev._lastPaletteTokens && typeof prev._lastPaletteTokens === "object"
      ? prev._lastPaletteTokens
      : null;
  let frostLevel = readFrostLevelSafe();

  function readFrostLevelSafe() {
    try {
      const n = Number(localStorage.getItem("cds-frost"));
      if (Number.isFinite(n)) return Math.min(100, Math.max(0, Math.round(n)));
    } catch (_) {
      /* ignore */
    }
    return 28;
  }

  function readFrostLevel() {
    return readFrostLevelSafe();
  }

  function writeFrostLevel(level) {
    try {
      localStorage.setItem("cds-frost", String(level));
    } catch (_) {
      /* ignore */
    }
  }

  function applyVeil(veil) {
    if (!veil) return;
    const html = document.documentElement;
    const map = {
      sidebar: "--cds-veil-sidebar",
      auxiliary: "--cds-veil-auxiliary",
      editor: "--cds-veil-editor",
      composer: "--cds-veil-composer",
    };
    for (const key of Object.keys(map)) {
      if (typeof veil[key] === "number") {
        html.style.setProperty(map[key], String(veil[key]));
      }
    }
  }

  function hexToRgba(hex, alpha) {
    if (!hex || typeof hex !== "string") return "";
    let h = hex.trim().replace("#", "");
    if (h.length === 3) {
      h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    }
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return "";
    const n = parseInt(h, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return "rgba(" + r + ", " + g + ", " + b + ", " + alpha + ")";
  }

  function frostAlphas(level) {
    const t = Math.min(100, Math.max(0, level)) / 100;
    return {
      side: 0.04 + t * 0.48,
      editor: 0.05 + t * 0.5,
      veilSide: 0.05 + t * 0.5,
      veilAux: 0.05 + t * 0.45,
      veilEditor: 0.08 + t * 0.52,
      veilComposer: 0.04 + t * 0.4,
      float: 0.14 + t * 0.4,
    };
  }

  function applyFrostLevel(level) {
    frostLevel = Math.min(100, Math.max(0, Math.round(level)));
    writeFrostLevel(frostLevel);
    const a = frostAlphas(frostLevel);
    applyVeil({
      sidebar: a.veilSide,
      auxiliary: a.veilAux,
      editor: a.veilEditor,
      composer: a.veilComposer,
    });
    const html = document.documentElement;
    html.style.setProperty("--cds-frost-level", String(frostLevel));
    const dark = html.getAttribute("data-cds-scheme") !== "light";
    if (lastPaletteTokens) {
      const side = hexToRgba(lastPaletteTokens["sideBar.background"], a.side);
      const editor = hexToRgba(lastPaletteTokens["editor.background"], a.editor);
      if (side) html.style.setProperty("--cds-sidebar", side);
      if (editor) html.style.setProperty("--cds-editor-panel", editor);
    } else {
      html.style.setProperty(
        "--cds-sidebar",
        dark ? "rgba(8, 10, 18, " + a.side + ")" : "rgba(255, 255, 255, " + a.side + ")"
      );
      html.style.setProperty(
        "--cds-editor-panel",
        dark ? "rgba(12, 14, 22, " + a.editor + ")" : "rgba(255, 255, 255, " + a.editor + ")"
      );
    }
    html.style.setProperty(
      "--cds-float",
      dark ? "rgba(12, 14, 22, " + a.float + ")" : "rgba(18, 22, 34, " + a.float + ")"
    );
    const label = document.querySelector("#cursor-dream-skin-hud .cds-frost-value");
    if (label) label.textContent = frostLevel + "%";
    const slider = document.querySelector("#cursor-dream-skin-hud .cds-frost-range");
    if (slider && Number(slider.value) !== frostLevel) slider.value = String(frostLevel);
  }

  function applyPaletteTint(tokens) {
    const html = document.documentElement;
    if (!tokens || typeof tokens !== "object") {
      lastPaletteTokens = null;
      html.removeAttribute("data-cds-palette");
      applyFrostLevel(frostLevel);
      return;
    }
    lastPaletteTokens = tokens;
    const a = frostAlphas(frostLevel);
    const side = hexToRgba(tokens["sideBar.background"], a.side);
    const editor = hexToRgba(tokens["editor.background"], a.editor);
    const accent = tokens["button.background"] || tokens.focusBorder || "";
    const border = hexToRgba(tokens.focusBorder || tokens["button.background"], 0.35);
    if (side) html.style.setProperty("--cds-sidebar", side);
    if (editor) html.style.setProperty("--cds-editor-panel", editor);
    if (accent) html.style.setProperty("--cds-accent", accent);
    if (border) html.style.setProperty("--cds-float-border", border);
    html.setAttribute("data-cds-palette", "1");
  }

  function tagFloatingChrome() {
    try {
      const nodes = document.querySelectorAll("div");
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        if (el.id === ROOT_ID || el.id === HUD_ID) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 80 || r.height < 20) continue;
        const s = getComputedStyle(el);
        const bg = s.backgroundColor;
        if (!bg || bg === "rgba(0, 0, 0, 0)" || bg === "transparent") continue;
        if (
          r.top <= 4 &&
          r.height >= 28 &&
          r.height <= 52 &&
          r.width >= window.innerWidth * 0.7
        ) {
          el.setAttribute("data-cds-titlebar", "1");
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  function syncTitleBarVars() {
    try {
      const html = document.documentElement;
      html.style.setProperty("--vscode-titleBar-activeBackground", "rgba(18, 22, 34, 0.15)");
      html.style.setProperty("--vscode-titleBar-inactiveBackground", "rgba(18, 22, 34, 0.1)");
      html.style.setProperty("--vscode-titleBar-activeForeground", "rgba(255,255,255,0.9)");
      html.style.setProperty("--vscode-titleBar-inactiveForeground", "rgba(255,255,255,0.6)");
      if (html.getAttribute("data-cds-scheme") === "light") {
        html.style.setProperty("--vscode-titleBar-activeBackground", "rgba(255, 255, 255, 0.08)");
        html.style.setProperty("--vscode-titleBar-inactiveBackground", "rgba(255, 255, 255, 0.04)");
        html.style.setProperty("--vscode-titleBar-activeForeground", "rgba(20,20,20,0.88)");
        html.style.setProperty("--vscode-titleBar-inactiveForeground", "rgba(20,20,20,0.55)");
      }
    } catch (_) {
      /* ignore */
    }
  }

  function schemeForTheme(themeId) {
    if (themeId && /light/i.test(themeId) && !/high contrast/i.test(themeId)) {
      return "light";
    }
    if (themeId) return "dark";
    return detectScheme();
  }

  function setPanelActive() {
    const hud = document.getElementById(HUD_ID);
    if (!hud) return;
    const themeBtns = hud.querySelectorAll("button[data-theme-id]");
    for (let i = 0; i < themeBtns.length; i++) {
      const btn = themeBtns[i];
      btn.setAttribute(
        "data-active",
        !activePaletteId && btn.getAttribute("data-theme-id") === activeThemeId ? "1" : "0"
      );
    }
    const palBtns = hud.querySelectorAll("button[data-palette-id]");
    for (let i = 0; i < palBtns.length; i++) {
      const btn = palBtns[i];
      btn.setAttribute(
        "data-active",
        btn.getAttribute("data-palette-id") === activePaletteId ? "1" : "0"
      );
    }
    const wall = hud.querySelector(".cds-wall-name");
    if (wall) wall.textContent = wallpaperLabel || "Default";
  }

  function queueTheme(themeId, scheme) {
    const nextScheme = scheme || schemeForTheme(themeId);
    activePaletteId = "";
    pending.push({
      type: "theme",
      themeId: themeId,
      scheme: nextScheme,
      at: Date.now(),
    });
    const html = document.documentElement;
    html.setAttribute("data-cds-scheme", nextScheme);
    activeThemeId = themeId;
    setPanelActive();
    syncTitleBarVars();
  }

  function queuePalette(paletteId, scheme, baseTheme) {
    const nextScheme = scheme || "dark";
    activePaletteId = paletteId;
    activeThemeId = baseTheme || activeThemeId;
    pending.push({
      type: "palette",
      paletteId: paletteId,
      scheme: nextScheme,
      themeId: baseTheme || "",
      at: Date.now(),
    });
    document.documentElement.setAttribute("data-cds-scheme", nextScheme);
    setPanelActive();
    syncTitleBarVars();
  }

  function queueWallpaper(filePath, name) {
    pending.push({
      type: "wallpaper",
      path: filePath,
      name: name || "",
      at: Date.now(),
    });
    wallpaperLabel = name || "Custom";
    setPanelActive();
  }

  function queueWallpaperBrowse(folder) {
    pending.push({
      type: folder ? "wallpaper-browse-folder" : "wallpaper-browse",
      at: Date.now(),
    });
    setPanelActive();
  }

  function queueWallpaperReset() {
    pending.push({ type: "wallpaper-reset", at: Date.now() });
    wallpaperLabel = "Default";
    setPanelActive();
  }

  function drainRequests() {
    if (!pending.length) return [];
    return pending.splice(0, pending.length);
  }

  function readCollapsed() {
    try {
      return localStorage.getItem("cds-hud-collapsed") !== "0";
    } catch (_) {
      return true;
    }
  }

  function writeCollapsed(collapsed) {
    try {
      localStorage.setItem("cds-hud-collapsed", collapsed ? "1" : "0");
    } catch (_) {
      /* ignore */
    }
  }

  function readPos() {
    try {
      // v2 keys: older top-titlebar positions conflicted with window drag/snap
      const x = Number(localStorage.getItem("cds-panel-x2"));
      const y = Number(localStorage.getItem("cds-panel-y2"));
      if (Number.isFinite(x) && Number.isFinite(y)) return { x: x, y: y };
    } catch (_) {
      /* ignore */
    }
    return null;
  }

  function writePos(x, y) {
    try {
      localStorage.setItem("cds-panel-x2", String(Math.round(x)));
      localStorage.setItem("cds-panel-y2", String(Math.round(y)));
    } catch (_) {
      /* ignore */
    }
  }

  function panelSize(hud) {
    const collapsed = hud.getAttribute("data-collapsed") !== "0";
    const rect = hud.getBoundingClientRect();
    return {
      collapsed: collapsed,
      w: collapsed ? 118 : Math.min(280, rect.width || 240),
      h: collapsed ? 40 : Math.min(560, Math.max(rect.height || 40, 40)),
    };
  }

  function defaultPanelPos(hud) {
    const s = panelSize(hud);
    return {
      x: Math.max(8, window.innerWidth - s.w - 16),
      y: Math.max(8, window.innerHeight - s.h - 16),
    };
  }

  function clampPanel(hud, left, top) {
    const s = panelSize(hud);
    const margin = 8;
    // Stay out of the native title-bar drag strip (Windows snap / window move).
    const minY = 44;
    const maxX = Math.max(margin, window.innerWidth - s.w - margin);
    const maxY = Math.max(minY, window.innerHeight - s.h - margin);
    return {
      x: Math.min(Math.max(margin, left), maxX),
      y: Math.min(Math.max(minY, top), maxY),
    };
  }

  function placePanel(hud, left, top) {
    const c = clampPanel(hud, left, top);
    hud.style.left = c.x + "px";
    hud.style.top = c.y + "px";
    hud.style.right = "auto";
    hud.style.bottom = "auto";
    return c;
  }

  function applyPanelPosition(hud) {
    const pos = readPos();
    if (!pos) {
      const d = defaultCornerPos(hud);
      placePanel(hud, d.x, d.y);
      return;
    }
    placePanel(hud, pos.x, pos.y);
  }

  function bindPanelViewport(hud) {
    if (hud.getAttribute("data-cds-resize") === "1") return;
    hud.setAttribute("data-cds-resize", "1");
    let timer = null;
    function reclamp() {
      const rect = hud.getBoundingClientRect();
      const placed = placePanel(hud, rect.left, rect.top);
      writePos(placed.x, placed.y);
    }
    window.addEventListener("resize", function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(reclamp, 80);
    });
  }

  function fillChipButton(btn, iconText, labelText) {
    while (btn.firstChild) btn.removeChild(btn.firstChild);
    const icon = document.createElement("span");
    icon.className = "cds-chip-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = iconText;
    btn.appendChild(icon);
    const label = document.createElement("span");
    label.className = "cds-chip-label";
    label.textContent = labelText;
    btn.appendChild(label);
  }

  function setCollapsed(hud, collapsed) {
    hud.setAttribute("data-collapsed", collapsed ? "1" : "0");
    writeCollapsed(collapsed);
    const chip = hud.querySelector(":scope > .cds-hud-chip");
    if (chip) {
      chip.setAttribute("aria-expanded", collapsed ? "false" : "true");
      chip.setAttribute(
        "title",
        collapsed ? "Drag to move · Click to open Dream Skin" : "Collapse panel"
      );
      fillChipButton(chip, "◐", "Dream Skin");
    }
    const collapseBtn = hud.querySelector(".cds-collapse-btn");
    if (collapseBtn) {
      collapseBtn.setAttribute("title", "Collapse");
      collapseBtn.setAttribute("aria-label", "Collapse Dream Skin panel");
    }
    // Re-clamp after size change so chip doesn't keep expanded width geometry
    const rect = hud.getBoundingClientRect();
    const placed = placePanel(hud, rect.left, rect.top);
    writePos(placed.x, placed.y);
  }

  function sectionTitle(text) {
    const el = document.createElement("div");
    el.className = "cds-sec-title";
    el.textContent = text;
    return el;
  }

  function makeBtn(label, attrs, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("data-active", "0");
    for (const k of Object.keys(attrs || {})) {
      if (k === "className") {
        btn.className = attrs[k];
        continue;
      }
      if (k === "accent") continue;
      btn.setAttribute(k, attrs[k]);
    }
    if (attrs && attrs.accent) {
      const swatch = document.createElement("span");
      swatch.className = "cds-swatch";
      swatch.style.background = attrs.accent;
      btn.appendChild(swatch);
      const text = document.createElement("span");
      text.className = "cds-btn-label";
      text.textContent = label;
      btn.appendChild(text);
    } else {
      btn.textContent = label;
    }
    btn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      onClick(ev);
    });
    return btn;
  }

  function attachDrag(hud, handle, options) {
    const opts = options || {};
    let dragging = false;
    let moved = false;
    let ox = 0;
    let oy = 0;
    let startX = 0;
    let startY = 0;

    handle.addEventListener("pointerdown", function (ev) {
      if (ev.button !== 0) return;
      if (!opts.allowButton && ev.target.closest("button") && ev.target !== handle) {
        return;
      }
      dragging = true;
      moved = false;
      startX = ev.clientX;
      startY = ev.clientY;
      const rect = hud.getBoundingClientRect();
      ox = ev.clientX - rect.left;
      oy = ev.clientY - rect.top;
      try {
        handle.setPointerCapture(ev.pointerId);
      } catch (_) {
        /* ignore */
      }
      // Keep Electron/Cursor from treating this as native title-bar window drag.
      ev.preventDefault();
      ev.stopPropagation();
    });

    handle.addEventListener("pointermove", function (ev) {
      if (!dragging) return;
      if (!moved) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (dx * dx + dy * dy < 25) return;
        moved = true;
        hud.setAttribute("data-dragging", "1");
      }
      placePanel(hud, ev.clientX - ox, ev.clientY - oy);
      ev.preventDefault();
      ev.stopPropagation();
    });

    function endDrag(ev) {
      if (!dragging) return;
      dragging = false;
      hud.removeAttribute("data-dragging");
      const rect = hud.getBoundingClientRect();
      const placed = placePanel(hud, rect.left, rect.top);
      writePos(placed.x, placed.y);
      try {
        handle.releasePointerCapture(ev.pointerId);
      } catch (_) {
        /* ignore */
      }
      if (ev) {
        ev.preventDefault();
        ev.stopPropagation();
      }
      if (!moved && typeof opts.onTap === "function") {
        opts.onTap(ev);
      }
    }

    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);
  }

  function rebuildPanelBody(hud) {
    let body = hud.querySelector(".cds-hud-body");
    if (body) body.remove();

    body = document.createElement("div");
    body.className = "cds-hud-body";

    const header = document.createElement("div");
    header.className = "cds-panel-header";
    const title = document.createElement("div");
    title.className = "cds-panel-title";
    title.textContent = "Dream Skin";
    header.appendChild(title);
    const collapseBtn = document.createElement("button");
    collapseBtn.type = "button";
    collapseBtn.className = "cds-hud-chip cds-collapse-btn";
    collapseBtn.title = "Collapse";
    collapseBtn.setAttribute("aria-label", "Collapse Dream Skin panel");
    fillChipButton(collapseBtn, "✕", "Hide");
    collapseBtn.addEventListener("click", function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      setCollapsed(hud, true);
    });
    header.appendChild(collapseBtn);
    body.appendChild(header);
    attachDrag(hud, header, {});

    body.appendChild(sectionTitle("Base theme"));
    for (let i = 0; i < THEMES.length; i++) {
      const t = THEMES[i];
      body.appendChild(
        makeBtn(t.label, { "data-theme-id": t.id, "data-scheme": t.scheme }, function () {
          queueTheme(t.id, t.scheme);
        })
      );
    }

    body.appendChild(sectionTitle("Color styles"));
    const palMount = document.createElement("div");
    palMount.setAttribute("data-palettes-mount", "1");
    palMount.setAttribute(
      "data-sig",
      paletteCatalog.map(function (p) {
        return p.id;
      }).join(",")
    );
    if (!paletteCatalog.length) {
      const empty = document.createElement("div");
      empty.className = "cds-hud-note";
      empty.textContent = "No palettes loaded";
      palMount.appendChild(empty);
    } else {
      for (let i = 0; i < paletteCatalog.length; i++) {
        const p = paletteCatalog[i];
        palMount.appendChild(
          makeBtn(
            p.label,
            {
              className: "cds-palette-btn",
              "data-palette-id": p.id,
              "data-scheme": p.scheme || "dark",
              accent: p.accent || "#6b9fff",
            },
            function () {
              queuePalette(p.id, p.scheme, p.baseTheme);
            }
          )
        );
      }
    }
    body.appendChild(palMount);

    body.appendChild(sectionTitle("Frost"));
    const frostRow = document.createElement("div");
    frostRow.className = "cds-frost-row";
    const frostLabel = document.createElement("div");
    frostLabel.className = "cds-frost-label";
    frostLabel.textContent = "UI opacity";
    const frostValue = document.createElement("div");
    frostValue.className = "cds-frost-value";
    frostValue.textContent = frostLevel + "%";
    const frostHead = document.createElement("div");
    frostHead.className = "cds-frost-head";
    frostHead.appendChild(frostLabel);
    frostHead.appendChild(frostValue);
    frostRow.appendChild(frostHead);
    const frostRange = document.createElement("input");
    frostRange.type = "range";
    frostRange.min = "0";
    frostRange.max = "100";
    frostRange.step = "1";
    frostRange.value = String(frostLevel);
    frostRange.className = "cds-frost-range";
    frostRange.title = "0 = clear wallpaper · 100 = stronger frost";
    frostRange.addEventListener("input", function () {
      applyFrostLevel(Number(frostRange.value) || 0);
    });
    frostRow.appendChild(frostRange);
    const frostHint = document.createElement("div");
    frostHint.className = "cds-hud-note";
    frostHint.textContent = "Lower = more wallpaper · Higher = more readable panels";
    frostRow.appendChild(frostHint);
    body.appendChild(frostRow);

    body.appendChild(sectionTitle("Wallpaper"));
    const wallRow = document.createElement("div");
    wallRow.className = "cds-wall-row";
    const wallName = document.createElement("div");
    wallName.className = "cds-wall-name";
    wallName.textContent = wallpaperLabel || "Default";
    wallRow.appendChild(wallName);
    body.appendChild(wallRow);

    body.appendChild(
      makeBtn("Upload file…", {
        className: "cds-action-btn",
        "data-action": "browse-wallpaper",
      }, function () {
        wallName.textContent = "File dialog opening…";
        queueWallpaperBrowse(false);
      })
    );
    body.appendChild(
      makeBtn("Upload WE folder…", {
        className: "cds-action-btn cds-action-btn-alt",
        "data-action": "browse-folder",
      }, function () {
        wallName.textContent = "Folder dialog opening…";
        queueWallpaperBrowse(true);
      })
    );

    const pathInput = document.createElement("input");
    pathInput.type = "text";
    pathInput.className = "cds-path-input";
    pathInput.placeholder = "Or paste file / workshop folder path";
    pathInput.spellcheck = false;
    body.appendChild(pathInput);
    body.appendChild(
      makeBtn("Apply path", { className: "cds-action-btn-ghost", "data-action": "apply-path" }, function () {
        const p = String(pathInput.value || "").trim().replace(/^["']|["']$/g, "");
        if (!p) {
          wallName.textContent = "Paste a full path first";
          return;
        }
        wallName.textContent = "Applying (may take a bit for big MP4/scene)…";
        queueWallpaper(p, p.split(/[/\\]/).pop() || "custom");
      })
    );

    body.appendChild(
      makeBtn("Reset wallpaper", {
        className: "cds-action-btn-ghost",
        "data-action": "reset-wallpaper",
      }, function () {
        queueWallpaperReset();
      })
    );

    const note = document.createElement("div");
    note.className = "cds-hud-note";
    note.textContent =
      "WE folder OK · video auto · scene uses RePKG · big MP4 via blob";
    body.appendChild(note);

    hud.appendChild(body);
  }

  function ensurePanel() {
    let hud = document.getElementById(HUD_ID);
    if (hud && hud.getAttribute("data-cds-panel-v") !== "12") {
      hud.remove();
      hud = null;
    }
    if (hud) {
      const wall = hud.querySelector(".cds-wall-name");
      if (wall) wall.textContent = wallpaperLabel || "Default";
      const palMount = hud.querySelector("[data-palettes-mount]");
      const sig = paletteCatalog.map(function (p) { return p.id; }).join(",");
      if (palMount && palMount.getAttribute("data-sig") !== sig) {
        rebuildPanelBody(hud);
      }
      setPanelActive();
      applyPanelPosition(hud);
      bindPanelViewport(hud);
      return hud;
    }

    hud = document.createElement("div");
    hud.id = HUD_ID;
    hud.className = "cds-panel-root";
    hud.setAttribute("data-cds-hud", "1");
    hud.setAttribute("data-cds-panel-v", "12");
    hud.setAttribute("data-collapsed", readCollapsed() ? "1" : "0");

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "cds-hud-chip";
    chip.setAttribute("aria-label", "Open Dream Skin");
    fillChipButton(chip, "◐", "Dream Skin");
    attachDrag(hud, chip, {
      allowButton: true,
      onTap: function () {
        setCollapsed(hud, false);
      },
    });
    hud.appendChild(chip);

    rebuildPanelBody(hud);
    (document.body || document.documentElement).appendChild(hud);
    applyPanelPosition(hud);
    bindPanelViewport(hud);
    setCollapsed(hud, readCollapsed());
    setPanelActive();
    return hud;
  }

  function apply(config) {
    const cfg = config || {};
    frostLevel = readFrostLevel();
    ensureStyle(cfg.cssText || "");
    ensureRoot(cfg.imageDataUrl || "", cfg.art || {}, cfg.videoUrl || "", cfg.imageUrl || "", {
      skipMediaReload: cfg.skipMediaReload === true,
      resetWallpaper: cfg.resetWallpaper === true,
      preserveCustomMedia: cfg.preserveCustomMedia !== false,
      wallpaperLabel: cfg.wallpaperLabel || "",
    });
    if (cfg.paletteTokens) lastPaletteTokens = cfg.paletteTokens;
    else if (cfg.paletteId === "") lastPaletteTokens = null;
    applyPaletteTint(cfg.paletteTokens === undefined ? lastPaletteTokens : cfg.paletteTokens || null);
    const html = document.documentElement;
    html.setAttribute(MARK, "1");
    if (cfg.themeId) activeThemeId = cfg.themeId;
    if (typeof cfg.paletteId === "string") activePaletteId = cfg.paletteId;
    if (typeof cfg.wallpaperLabel === "string") wallpaperLabel = cfg.wallpaperLabel;
    if (Array.isArray(cfg.palettes)) paletteCatalog = cfg.palettes;
    const scheme =
      cfg.scheme === "light" || cfg.scheme === "dark"
        ? cfg.scheme
        : schemeForTheme(cfg.themeId || activeThemeId);
    html.setAttribute("data-cds-scheme", scheme);
    applyFrostLevel(frostLevel);
    tagFloatingChrome();
    syncTitleBarVars();
    try {
      ensurePanel();
      setPanelActive();
    } catch (e) {
      try {
        console.warn("[Dream Skin] panel error:", e && e.message ? e.message : e);
      } catch (_) {}
    }
    return {
      ok: true,
      hasWorkbench: !!document.querySelector(".monaco-workbench"),
      scheme: html.getAttribute("data-cds-scheme"),
      rootPresent: !!document.getElementById(ROOT_ID),
      hudPresent: !!document.getElementById(HUD_ID),
      paletteId: activePaletteId,
      wallpaperLabel: wallpaperLabel,
      frost: frostLevel,
      video: !!cfg.videoUrl,
      imageUrl: !!cfg.imageUrl,
    };
  }

  function remove() {
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
    const root = document.getElementById(ROOT_ID);
    if (root) root.remove();
    const hud = document.getElementById(HUD_ID);
    if (hud) hud.remove();
    document.querySelectorAll("[data-cds-titlebar]").forEach(function (el) {
      el.removeAttribute("data-cds-titlebar");
    });
    const html = document.documentElement;
    html.removeAttribute(MARK);
    html.removeAttribute("data-cds-scheme");
    html.removeAttribute("data-cds-video");
    html.removeAttribute("data-cds-still");
    html.removeAttribute("data-cds-palette");
    [
      "--cds-art",
      "--cds-focus-x",
      "--cds-focus-y",
      "--cds-veil-sidebar",
      "--cds-veil-auxiliary",
      "--cds-veil-editor",
      "--cds-veil-composer",
      "--cds-sidebar",
      "--cds-editor-panel",
      "--cds-accent",
      "--cds-float-border",
      "--vscode-titleBar-activeBackground",
      "--vscode-titleBar-inactiveBackground",
      "--vscode-titleBar-activeForeground",
      "--vscode-titleBar-inactiveForeground",
    ].forEach(function (v) {
      html.style.removeProperty(v);
    });
    return { ok: true, removed: true };
  }

  function probe() {
    function q(sel) {
      try {
        return !!document.querySelector(sel);
      } catch (_) {
        return false;
      }
    }
    return {
      workbench: q(".monaco-workbench"),
      sidebar: q(".part.sidebar"),
      auxiliarybar: q(".part.auxiliarybar"),
      editor: q(".part.editor, .part.editorgroupcontainer"),
      titlebar: q(".part.titlebar"),
      statusbar: q(".part.statusbar"),
      composer: q('.composer-bar, [class*="composer"], .aichat-pane'),
      agentsShell: q(".workspaces-container, .workspace-container"),
      glassRoot: q('[class*="glass-"]'),
      skinActive: document.documentElement.getAttribute(MARK) === "1",
      rootPresent: !!document.getElementById(ROOT_ID),
      stylePresent: !!document.getElementById(STYLE_ID),
      hudPresent: !!document.getElementById(HUD_ID),
      scheme: detectScheme(),
      activeThemeId: activeThemeId,
      activePaletteId: activePaletteId,
      wallpaperLabel: wallpaperLabel,
      title: document.title || "",
      bodyClasses: document.body ? String(document.body.className).slice(0, 240) : "",
    };
  }

  global.__cursorDreamSkin = {
    apply: apply,
    remove: remove,
    probe: probe,
    queueTheme: queueTheme,
    queuePalette: queuePalette,
    drainRequests: drainRequests,
    themes: THEMES,
    version: VERSION,
    _pending: pending,
    get _activeThemeId() {
      return activeThemeId;
    },
    get _activePaletteId() {
      return activePaletteId;
    },
    get _wallpaperLabel() {
      return wallpaperLabel;
    },
    get _paletteCatalog() {
      return paletteCatalog;
    },
    get _lastPaletteTokens() {
      return lastPaletteTokens;
    },
  };
  return global.__cursorDreamSkin;
})(typeof window !== "undefined" ? window : globalThis);
