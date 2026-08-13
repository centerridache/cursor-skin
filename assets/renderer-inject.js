/**
 * Cursor Dream Skin — renderer payload (runs inside Cursor workbench).
 * Idempotent apply/remove. No innerHTML (Trusted Types).
 */
(function cursorDreamSkinPayload(global) {
  const MARK = "data-cursor-dream-skin";
  const ROOT_ID = "cursor-dream-skin-root";
  const STYLE_ID = "cursor-dream-skin-css";
  const HUD_ID = "cursor-dream-skin-hud";
  const VERSION = 62;
  const RUNTIME_VERSION = "0.3.0";
  const PANEL_V = "18";
  const REGION_ATTR = "data-cursor-skin";
  const HOLE_ATTR = "data-cursor-skin-hole";
  const REGION_KEYS = ["sidebar", "editor", "chat", "auxiliary", "terminal"];
  const CHROME_KEYS = ["titlebar", "statusbar", "panel", "diff"];

  /* Probe fallback only. After Adapter loads, cfg.selectors replaces this wholesale. */
  const FALLBACK_SELECTORS = {
    workbench: ".monaco-workbench",
    sidebar: ".part.sidebar, nav.ui-sidebar, .ui-sidebar",
    auxiliarybar: ".part.auxiliarybar",
    editor: ".part.editor, .part.editorgroupcontainer",
    editorPanel: '.editor-panel-container, [class*="editor-panel-container"]',
    chat: '.composer-bar, [class*="composer"], .aichat-pane, .agent-panel',
    titlebar: ".part.titlebar",
    statusbar: ".part.statusbar",
    terminal: '[data-component="terminal-tab-content"], .xterm',
    browser: '[data-component="browser-tab-content"]',
    diff: ".diff-tab-content, [data-component='diff-tab-content'], [id*='tabpanel-editor-panel-group-stable-diff']",
    agentsShell: ".workspaces-container, .workspace-container",
    glassRoot: '[class*="glass-"]',
  };

  /* Thin stamp fallback if apply() has no Adapter regions. Not merged with Adapter. */
  const FALLBACK_REGIONS = {
    sidebar: [
      "[data-cds-sidebar-dock='1']",
      "div:has(> nav.ui-sidebar)",
      "div:has(> .ui-sidebar)",
      ".monaco-workbench .part.sidebar",
    ],
    editor: [
      ".monaco-workbench .part.editor",
      ".monaco-workbench .part.editorgroupcontainer",
    ],
    chat: [".agent-panel", ".aichat-pane", ".composer-bar"],
    auxiliary: [".monaco-workbench .part.auxiliarybar", ".editor-panel-container"],
    terminal: ["[data-component='terminal-tab-content']"],
    titlebar: [".part.titlebar", "[data-cds-titlebar='1']"],
    statusbar: [".part.statusbar"],
    panel: [".monaco-workbench .part.panel"],
    diff: [".diff-tab-content", "[data-component='diff-tab-content']"],
  };

  const FALLBACK_HOLES = [];

  const DEFAULT_MAPPINGS = {
    sidebar: { fill: "--cds-sidebar", veil: "--cds-veil-sidebar", blur: "--cds-frost-sidebar" },
    editor: { fill: "--cds-editor-canvas", veil: "--cds-veil-editor", blur: "--cds-frost-editor" },
    chat: { fill: "--cds-chat-panel", veil: "--cds-veil-composer", blur: "--cds-frost-chat" },
    auxiliary: { fill: "--cds-editor-panel", veil: "--cds-veil-auxiliary", blur: "--cds-frost-auxiliary" },
    terminal: { fill: "--cds-terminal-panel", blur: "--cds-frost-terminal" },
  };

  let selectorMap = FALLBACK_SELECTORS;
  let regionMap = FALLBACK_REGIONS;
  let regionAttr = REGION_ATTR;
  let holeList = FALLBACK_HOLES.slice();
  let holeAttr = HOLE_ATTR;
  let cssMappings = Object.assign({}, DEFAULT_MAPPINGS);

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
  let themePackCatalog =
    prev && Array.isArray(prev._themePackCatalog) ? prev._themePackCatalog : [];
  let activeThemePackId =
    prev && typeof prev._activeThemePackId === "string" ? prev._activeThemePackId : "";

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

  function writeStoredMedia(imageUrl, videoUrl, label, posterKey) {
    try {
      if (imageUrl || videoUrl) {
        sessionStorage.setItem(
          "cds-media",
          JSON.stringify({
            imageUrl: imageUrl || "",
            videoUrl: videoUrl || "",
            label: label || "",
            posterKey: posterKey || "",
          })
        );
      } else {
        sessionStorage.removeItem("cds-media");
      }
    } catch (_) {
      /* ignore */
    }
  }

  function posterStorageKey(posterKey) {
    return "cds-poster:" + String(posterKey || "");
  }

  function readCachedPoster(posterKey) {
    if (!posterKey) return "";
    try {
      const v = localStorage.getItem(posterStorageKey(posterKey));
      if (v && v.indexOf("data:image/") === 0 && v.length < 900000) return v;
    } catch (_) {
      /* ignore */
    }
    return "";
  }

  function writeCachedPoster(posterKey, dataUrl) {
    if (!posterKey || !dataUrl || dataUrl.indexOf("data:image/") !== 0) return;
    if (dataUrl.length > 900000) return;
    try {
      localStorage.setItem(posterStorageKey(posterKey), dataUrl);
    } catch (_) {
      /* quota — ignore */
    }
  }

  function captureElementPoster(el, maxEdge) {
    try {
      const w0 = el.naturalWidth || el.videoWidth || 0;
      const h0 = el.naturalHeight || el.videoHeight || 0;
      if (w0 < 8 || h0 < 8) return "";
      const max = maxEdge || 1280;
      const scale = Math.min(1, max / Math.max(w0, h0));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(w0 * scale));
      c.height = Math.max(1, Math.round(h0 * scale));
      c.getContext("2d").drawImage(el, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.72);
    } catch (_) {
      return "";
    }
  }

  function setArtPlaceholder(html, imageDataUrl, posterKey, posterDataUrl) {
    const cached = readCachedPoster(posterKey);
    const poster = posterDataUrl || cached || "";
    if (poster) {
      html.style.setProperty("--cds-art", 'url("' + poster + '")');
      return "poster";
    }
    if (imageDataUrl) {
      html.style.setProperty("--cds-art", 'url("' + imageDataUrl + '")');
      return "default";
    }
    return "";
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
    const posterKey = options.posterKey || "";
    const posterDataUrl = options.posterDataUrl || "";
    const existingKey = root.getAttribute("data-cds-media-key") || "";
    const existingCustom = existingKey.indexOf("i:") === 0 || existingKey.indexOf("v:") === 0;

    // Prefer live custom media / session cache over stale default poster (early-script race).
    if (!nextImage && !nextUrl && !options.resetWallpaper) {
      const stored = readStoredMedia();
      if (stored) {
        nextImage = stored.imageUrl || "";
        nextUrl = stored.videoUrl || "";
        if (!posterKey && stored.posterKey) options.posterKey = stored.posterKey;
      } else if (existingCustom && options.preserveCustomMedia !== false) {
        return root;
      }
    }

    const effectivePosterKey = options.posterKey || posterKey || "";

    if (options.resetWallpaper) {
      writeStoredMedia("", "", "", "");
    } else if (nextImage || nextUrl) {
      writeStoredMedia(nextImage, nextUrl, options.wallpaperLabel || "", effectivePosterKey);
    }

    const epoch = options.mediaEpoch ? String(options.mediaEpoch) : "";
    const mediaKey =
      (nextUrl ? "v:" : nextImage ? "i:" : "d:") +
      (epoch ? epoch + "|" : "") +
      (nextUrl || nextImage || (imageDataUrl ? "default" : ""));
    // Only remount on hard failure — readyState dips during 4K decode and must NOT reload the blob.
    const hasBlob =
      !!(video && video._cdsObjectUrl) ||
      !!(video && video.src && String(video.src).indexOf("blob:") === 0);
    const videoBroken =
      !!nextUrl &&
      (!!video?.error ||
        (!hasBlob && !html.getAttribute("data-cds-video")) ||
        (hasBlob && video.error));
    const sameMedia = existingKey === mediaKey && mediaKey !== "" && !videoBroken;

    // Instant backdrop: cached poster → bundled default. Never clear to theme-color void
    // while a large custom still/video is still downloading as a blob.
    if (nextImage || nextUrl) {
      setArtPlaceholder(html, imageDataUrl, effectivePosterKey, posterDataUrl);
      html.setAttribute("data-cds-media-pending", "1");
    } else if (imageDataUrl) {
      html.style.setProperty("--cds-art", 'url("' + imageDataUrl + '")');
      html.removeAttribute("data-cds-media-pending");
    } else {
      html.removeAttribute("data-cds-media-pending");
    }

    if (sameMedia) {
      html.removeAttribute("data-cds-media-pending");
      if (nextUrl) {
        ensureVideoWatchdog();
        try {
          video._cdsWantPlay = true;
          syncVideoPlayback(video);
        } catch (_) {}
      }
      return root;
    }
    root.setAttribute("data-cds-media-key", mediaKey);

    if (nextImage) {
      const applyStillSrc = function (src) {
        still.onload = function () {
          if (still.naturalWidth > 0 && still.naturalHeight > 0) {
            html.setAttribute("data-cds-still", "1");
            html.removeAttribute("data-cds-media-pending");
            const shot = captureElementPoster(still, 1280);
            if (shot) {
              writeCachedPoster(effectivePosterKey, shot);
              html.style.setProperty("--cds-art", 'url("' + shot + '")');
            }
          } else {
            html.removeAttribute("data-cds-still");
          }
        };
        still.onerror = function () {
          html.removeAttribute("data-cds-still");
        };
        still.setAttribute("src", src);
        still.src = src;
      };
      // Show cached/full poster as <img> immediately while the full blob downloads.
      const instant = posterDataUrl || readCachedPoster(effectivePosterKey);
      if (instant) {
        applyStillSrc(instant);
      }
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
            if (!instant) {
              html.removeAttribute("data-cds-still");
              applyStillSrc(nextImage);
            }
          });
      } else {
        applyStillSrc(nextImage);
      }
    } else if (!nextUrl) {
      html.removeAttribute("data-cds-still");
      try {
        if (still._cdsObjectUrl) URL.revokeObjectURL(still._cdsObjectUrl);
      } catch (_) {}
      still._cdsObjectUrl = "";
      still.removeAttribute("src");
      still.src = "";
    }

    if (nextUrl) {
      // Keep CSS art / optional still poster visible until the video paints.
      video._cdsStreamUrl = nextUrl;

      const setWallStatus = function (text) {
        try {
          const el = document.querySelector("#cursor-dream-skin-hud .cds-wall-name");
          if (el && text) el.textContent = text;
        } catch (_) {}
      };

      const startVideo = function (src, attempt) {
        const tries = typeof attempt === "number" ? attempt : 0;
        video.onloadeddata = function () {
          if (video.videoWidth > 0) {
            html.setAttribute("data-cds-video", "1");
            html.removeAttribute("data-cds-media-pending");
            html.removeAttribute("data-cds-still");
            const shot = captureElementPoster(video, 1280);
            if (shot) {
              writeCachedPoster(effectivePosterKey, shot);
              html.style.setProperty("--cds-art", 'url("' + shot + '")');
              try {
                video.setAttribute("poster", shot);
              } catch (_) {}
            }
            video._cdsWantPlay = true;
            syncVideoPlayback(video);
            if (options.wallpaperLabel) setWallStatus(options.wallpaperLabel);
          } else {
            html.removeAttribute("data-cds-video");
          }
        };
        video.onerror = function () {
          html.removeAttribute("data-cds-video");
          // Electron rejects http(s) media src ("URL safety check"). Blob retry below handles that.
          if (tries < 2 && video._cdsStreamUrl && String(src).indexOf("blob:") !== 0) {
            fetchToBlobVideo(tries + 1);
            return;
          }
          if (tries < 4 && video._cdsStreamUrl && String(src).indexOf("blob:") === 0) {
            setTimeout(function () {
              fetchToBlobVideo(tries + 1);
            }, 800 * (tries + 1));
          }
        };
        video.setAttribute("src", src);
        video.src = src;
        try {
          video.load();
        } catch (_) {}
        video._cdsWantPlay = true;
        syncVideoPlayback(video);
      };

      const fetchToBlobVideo = function (attempt) {
        const tries = typeof attempt === "number" ? attempt : 0;
        setWallStatus("Loading video…");
        // Keep current frame visible while the new blob downloads (avoids white flash).
        try {
          if (video.videoWidth > 1) {
            const c = document.createElement("canvas");
            c.width = video.videoWidth;
            c.height = video.videoHeight;
            c.getContext("2d").drawImage(video, 0, 0);
            video.setAttribute("poster", c.toDataURL("image/jpeg", 0.72));
          }
        } catch (_) {}
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
            startVideo(obj, tries);
          })
          .catch(function (e) {
            setWallStatus("Video load failed — retry from panel");
            try {
              console.warn("[Dream Skin] video blob fail:", e && e.message ? e.message : e);
            } catch (_) {}
            if (tries < 3) {
              setTimeout(function () {
                fetchToBlobVideo(tries + 1);
              }, 1000 * (tries + 1));
            }
          });
      };

      // Show last video frame / image poster as still while the MP4 blob downloads.
      const instant = posterDataUrl || readCachedPoster(effectivePosterKey);
      if (instant) {
        still.onload = function () {
          if (still.naturalWidth > 0) html.setAttribute("data-cds-still", "1");
        };
        still.src = instant;
        still.setAttribute("src", instant);
        try {
          video.setAttribute("poster", instant);
        } catch (_) {}
      }

      // Cursor/Electron blocks <video src="http://127.0.0.1/..."> (URL safety check).
      // Always materialize a blob: URL from the loopback Range server.
      fetchToBlobVideo(0);
      ensureVideoWatchdog();
    } else {
      html.removeAttribute("data-cds-video");
      video._cdsStreamUrl = "";
      video._cdsWantPlay = false;
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

  // Pause wallpaper only when the page is truly hidden (minimize / occluded).
  // Do NOT use window blur/focus — Cursor Browser/webview steals focus and caused
  // pause↔play stutter while the user was still working in Cursor.
  let videoPageVisible = true;
  const nativeVideoPause = HTMLMediaElement.prototype.pause;

  function installVideoPauseGuard() {
    if (global.__cdsVideoPauseGuard === VERSION) return;
    global.__cdsVideoPauseGuard = VERSION;
    global.__cdsVideoPowerMode = "visibility-only";
    // Older injects left window blur listeners that still call video.pause().
    // Ignore those while the page is visible so playback stays smooth.
    HTMLMediaElement.prototype.pause = function () {
      try {
        if (
          global.__cdsVideoPowerMode === "visibility-only" &&
          this &&
          this.classList &&
          this.classList.contains("cds-video") &&
          !document.hidden &&
          document.visibilityState !== "hidden"
        ) {
          return;
        }
      } catch (_) {
        /* ignore */
      }
      return nativeVideoPause.apply(this, arguments);
    };
  }

  function hardPauseVideo(video) {
    try {
      nativeVideoPause.call(video);
    } catch (_) {
      /* ignore */
    }
  }

  function videoShouldRun() {
    try {
      if (document.visibilityState === "hidden" || document.hidden) return false;
      if (!videoPageVisible) return false;
    } catch (_) {
      /* ignore */
    }
    return true;
  }

  function syncVideoPlayback(video) {
    if (!video || !video.getAttribute("src")) return;
    const want = video._cdsWantPlay !== false && videoShouldRun();
    video._cdsPowerPaused = !want;
    if (want) {
      if (video.paused || video.ended) {
        try {
          if (video.ended) video.currentTime = 0;
        } catch (_) {}
        const play = video.play();
        if (play && typeof play.catch === "function") play.catch(function () {});
      }
    } else if (!video.paused) {
      hardPauseVideo(video);
    }
  }

  function ensureVideoPerf() {
    if (global.__cdsVideoPerfBound === VERSION) return;
    global.__cdsVideoPerfBound = VERSION;
    installVideoPauseGuard();
    try {
      if (global.__cdsVideoCapRaf) cancelAnimationFrame(global.__cdsVideoCapRaf);
    } catch (_) {}
    global.__cdsVideoCapLoop = false;
    global.__cdsVideoCapRaf = 0;
    try {
      document.documentElement.removeAttribute("data-cds-video-cap");
      const stale = document.querySelectorAll("#" + ROOT_ID + " .cds-video-canvas");
      for (let i = 0; i < stale.length; i++) stale[i].remove();
    } catch (_) {}

    const sync = function () {
      try {
        const video = document.querySelector("#" + ROOT_ID + " .cds-video");
        if (!video) return;
        syncVideoPlayback(video);
      } catch (_) {
        /* ignore */
      }
    };

    document.addEventListener("visibilitychange", function () {
      videoPageVisible = document.visibilityState !== "hidden" && !document.hidden;
      sync();
    });
    // Recover if an older inject left the video power-paused while still visible.
    videoPageVisible = document.visibilityState !== "hidden" && !document.hidden;
    sync();
  }

  function ensureVideoWatchdog() {
    ensureVideoPerf();
    if (global.__cdsVideoWatchdog === VERSION) return;
    global.__cdsVideoWatchdog = VERSION;
    let repairing = false;

    const softRepair = function (video) {
      if (repairing) return;
      const url = video && video._cdsStreamUrl;
      if (!url) return;
      repairing = true;
      fetch(url)
        .then(function (r) {
          if (!r.ok) throw new Error("repair fetch " + r.status);
          return r.blob();
        })
        .then(function (blob) {
          try {
            if (video._cdsObjectUrl) URL.revokeObjectURL(video._cdsObjectUrl);
          } catch (_) {}
          const obj = URL.createObjectURL(blob);
          video._cdsObjectUrl = obj;
          video.src = obj;
          video.load();
          video._cdsWantPlay = true;
          syncVideoPlayback(video);
          document.documentElement.setAttribute("data-cds-video", "1");
        })
        .catch(function () {
          /* leave poster up */
        })
        .then(function () {
          repairing = false;
        });
    };

    const kick = function () {
      try {
        const html = document.documentElement;
        if (html.getAttribute(MARK) !== "1") return;
        const video = document.querySelector("#" + ROOT_ID + " .cds-video");
        if (!video || !video.getAttribute("src")) return;
        if (video.error) {
          softRepair(video);
          return;
        }
        if (video.videoWidth > 0) html.setAttribute("data-cds-video", "1");
        // Keep visibility flag honest (older injects could leave a stuck pause).
        videoPageVisible = document.visibilityState !== "hidden" && !document.hidden;
        syncVideoPlayback(video);
      } catch (_) {
        /* ignore */
      }
    };
    setInterval(kick, 4000);
  }

  let lastPaletteTokens =
    prev && prev._lastPaletteTokens && typeof prev._lastPaletteTokens === "object"
      ? prev._lastPaletteTokens
      : null;
  let frostLevel = readFrostLevelSafe();
  let workspaceOpacity = readWorkspaceOpacitySafe();
  let workspaceBlur = readWorkspaceBlurSafe();
  let workspaceSourcePackId = "";

  function clamp01(n, fallback) {
    const x = Number(n);
    if (!Number.isFinite(x)) return fallback;
    return Math.min(1, Math.max(0, x));
  }

  function clampBlur(n, fallback) {
    const x = Number(n);
    if (!Number.isFinite(x)) return fallback;
    return Math.min(64, Math.max(0, x));
  }

  function frostCss(px) {
    const n = Math.round(clampBlur(px, 0));
    if (n <= 0) return "none";
    return "blur(" + n + "px) saturate(1.2)";
  }

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

  function defaultWorkspaceOpacity() {
    return { sidebar: 0.45, editor: 0.72, auxiliary: 0.45, chat: 0.55, terminal: 0.6 };
  }

  function defaultWorkspaceBlur() {
    return { sidebar: 12, editor: 4, chat: 10, auxiliary: 12, terminal: 8 };
  }

  function readRegionMap(raw, defaults, clampFn) {
    const d = defaults;
    const keys = Object.keys(d);
    const out = {};
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      out[k] = clampFn(raw && raw[k], d[k]);
    }
    return out;
  }

  function readWorkspaceOpacitySafe() {
    try {
      const raw = JSON.parse(localStorage.getItem("cds-workspace-opacity") || "");
      if (raw && typeof raw === "object") {
        const d = defaultWorkspaceOpacity();
        const next = readRegionMap(raw, d, clamp01);
        if (raw.chat == null && raw.editor != null) next.chat = clamp01(raw.editor, d.chat);
        return next;
      }
    } catch (_) {
      /* ignore */
    }
    return defaultWorkspaceOpacity();
  }

  function readWorkspaceBlurSafe() {
    try {
      const raw = JSON.parse(localStorage.getItem("cds-workspace-blur") || "");
      if (raw && typeof raw === "object") return readRegionMap(raw, defaultWorkspaceBlur(), clampBlur);
    } catch (_) {
      /* ignore */
    }
    return defaultWorkspaceBlur();
  }

  function writeWorkspaceOpacity() {
    try {
      localStorage.setItem("cds-workspace-opacity", JSON.stringify(workspaceOpacity));
    } catch (_) {
      /* ignore */
    }
  }

  function writeWorkspaceBlur() {
    try {
      localStorage.setItem("cds-workspace-blur", JSON.stringify(workspaceBlur));
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
      float: 0.14 + t * 0.42,
      tool: 0.08 + t * 0.45,
    };
  }

  function panelRgba(opacity, dark, tokenHex) {
    const a = clamp01(opacity, 0.5);
    if (tokenHex) {
      const mixed = hexToRgba(tokenHex, a);
      if (mixed) return mixed;
    }
    return dark
      ? "rgba(8, 10, 18, " + a + ")"
      : "rgba(255, 255, 255, " + a + ")";
  }

  function fillRgb(dark, tokenHex) {
    if (tokenHex && typeof tokenHex === "string") {
      let h = tokenHex.trim().replace("#", "");
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      if (/^[0-9a-fA-F]{6}$/.test(h)) {
        const n = parseInt(h, 16);
        return "rgb(" + ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255) + ")";
      }
    }
    return dark ? "rgb(8, 10, 18)" : "rgb(255, 255, 255)";
  }

  function surfaceOpacity(node, fallback) {
    if (node && typeof node === "object" && typeof node.opacity === "number") {
      return clamp01(node.opacity, fallback);
    }
    return fallback;
  }

  function surfaceBlur(node, fallback) {
    if (node && typeof node === "object" && typeof node.blur === "number") {
      return clampBlur(node.blur, fallback);
    }
    return fallback;
  }

  function ingestWorkspaceFromConfig(cfg) {
    if (!cfg || typeof cfg !== "object") return false;
    const dOp = defaultWorkspaceOpacity();
    const dBlur = defaultWorkspaceBlur();
    let next = {
      sidebar: workspaceOpacity.sidebar,
      editor: workspaceOpacity.editor,
      auxiliary: workspaceOpacity.auxiliary,
      chat: workspaceOpacity.chat,
      terminal: workspaceOpacity.terminal,
    };
    let nextBlur = {
      sidebar: workspaceBlur.sidebar,
      editor: workspaceBlur.editor,
      auxiliary: workspaceBlur.auxiliary,
      chat: workspaceBlur.chat,
      terminal: workspaceBlur.terminal,
    };
    let changed = false;
    const surfaces = cfg.surfaces;
    if (surfaces && typeof surfaces === "object") {
      for (let i = 0; i < REGION_KEYS.length; i++) {
        const k = REGION_KEYS[i];
        next[k] = surfaceOpacity(surfaces[k], next[k]);
        nextBlur[k] = surfaceBlur(surfaces[k], nextBlur[k]);
      }
      changed = true;
    } else if (cfg.veil && typeof cfg.veil === "object") {
      const v = cfg.veil;
      if (typeof v.sidebar === "number") next.sidebar = clamp01(v.sidebar, next.sidebar);
      if (typeof v.editor === "number") next.editor = clamp01(v.editor, next.editor);
      if (typeof v.auxiliary === "number") next.auxiliary = clamp01(v.auxiliary, next.auxiliary);
      if (typeof v.composer === "number") next.chat = clamp01(v.composer, next.chat);
      changed = true;
    }
    if (!changed) return false;
    workspaceOpacity = readRegionMap(next, dOp, clamp01);
    workspaceBlur = readRegionMap(nextBlur, dBlur, clampBlur);
    writeWorkspaceOpacity();
    writeWorkspaceBlur();
    return true;
  }

  function shouldIngestWorkspace(cfg) {
    if (!cfg) return false;
    if (cfg.forceWorkspace === true) return true;
    if (!cfg.surfaces && !cfg.veil) return false;
    if (typeof cfg.themePackId === "string" && cfg.themePackId && cfg.themePackId !== workspaceSourcePackId) {
      return true;
    }
    try {
      return !localStorage.getItem("cds-workspace-opacity");
    } catch (_) {
      return true;
    }
  }

  function syncWorkspaceSliders() {
    const hud = document.getElementById(HUD_ID);
    if (!hud) return;
    const rows = [
      ["sidebar", workspaceOpacity.sidebar],
      ["editor", workspaceOpacity.editor],
      ["auxiliary", workspaceOpacity.auxiliary],
    ];
    for (let i = 0; i < rows.length; i++) {
      const key = rows[i][0];
      const pct = Math.round(rows[i][1] * 100);
      const range = hud.querySelector('[data-ws-region="' + key + '"]');
      const valueEl = hud.querySelector('[data-ws-value="' + key + '"]');
      if (range && Number(range.value) !== pct) range.value = String(pct);
      if (valueEl) valueEl.textContent = pct + "%";
    }
  }

  function mappingFor(key) {
    const maps = cssMappings && typeof cssMappings === "object" ? cssMappings : DEFAULT_MAPPINGS;
    return maps[key] || DEFAULT_MAPPINGS[key] || {};
  }

  function fillTokenFor(key) {
    if (!lastPaletteTokens) return "";
    if (key === "sidebar") return lastPaletteTokens["sideBar.background"] || "";
    return lastPaletteTokens["editor.background"] || "";
  }

  function applyWorkspaceSurfaces() {
    const html = document.documentElement;
    const dark = html.getAttribute("data-cds-scheme") !== "light";
    for (let i = 0; i < REGION_KEYS.length; i++) {
      const key = REGION_KEYS[i];
      const map = mappingFor(key);
      const op = clamp01(workspaceOpacity[key], defaultWorkspaceOpacity()[key]);
      const blur = clampBlur(workspaceBlur[key], defaultWorkspaceBlur()[key]);
      const token = fillTokenFor(key);
      html.style.setProperty("--cds-" + key + "-opacity", String(op));
      html.style.setProperty("--cds-" + key + "-blur", Math.round(blur) + "px");
      html.style.setProperty("--cds-" + key + "-fill", fillRgb(dark, token));
      const filter = op < 0.02 ? "none" : frostCss(blur);
      html.style.setProperty("--cds-" + key + "-filter", filter);
      if (map.fill) html.style.setProperty(map.fill, panelRgba(op, dark, token));
      if (map.veil) html.style.setProperty(map.veil, String(op));
      if (map.blur) html.style.setProperty(map.blur, filter);
      if (op < 0.02) html.setAttribute("data-cds-clear-" + key, "1");
      else html.removeAttribute("data-cds-clear-" + key);
    }
    applyVeil({
      sidebar: workspaceOpacity.sidebar,
      editor: workspaceOpacity.editor,
      auxiliary: workspaceOpacity.auxiliary,
      composer: workspaceOpacity.chat,
    });
    tagSidebarDock();
    syncWorkspaceSliders();
  }

  function setWorkspaceOpacity(partial, opts) {
    const p = partial && typeof partial === "object" ? partial : {};
    const keys = REGION_KEYS;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (typeof p[k] === "number") workspaceOpacity[k] = clamp01(p[k], workspaceOpacity[k]);
    }
    if (opts && opts.linkChatToEditor && typeof p.editor === "number") {
      workspaceOpacity.chat = workspaceOpacity.editor;
    }
    if (opts && opts.linkTerminalToAuxiliary && typeof p.auxiliary === "number") {
      workspaceOpacity.terminal = workspaceOpacity.auxiliary;
    }
    writeWorkspaceOpacity();
    applyWorkspaceSurfaces();
    return Object.assign({}, workspaceOpacity);
  }

  function setWorkspaceBlur(partial) {
    const p = partial && typeof partial === "object" ? partial : {};
    for (let i = 0; i < REGION_KEYS.length; i++) {
      const k = REGION_KEYS[i];
      if (typeof p[k] === "number") workspaceBlur[k] = clampBlur(p[k], workspaceBlur[k]);
    }
    writeWorkspaceBlur();
    applyWorkspaceSurfaces();
    return Object.assign({}, workspaceBlur);
  }

  function tagSidebarDock() {
    try {
      const navs = document.querySelectorAll("nav.ui-sidebar, .ui-sidebar");
      for (let i = 0; i < navs.length; i++) {
        const dock = navs[i].parentElement;
        if (dock) {
          dock.setAttribute("data-cds-sidebar-dock", "1");
          dock.setAttribute(regionAttr || REGION_ATTR, "sidebar");
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  function splitSelectorList(input) {
    if (Array.isArray(input)) {
      const out = [];
      for (let i = 0; i < input.length; i++) {
        const part = splitSelectorList(input[i]);
        for (let j = 0; j < part.length; j++) out.push(part[j]);
      }
      return out;
    }
    const s = String(input || "");
    const parts = [];
    let buf = "";
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "[") depth += 1;
      else if (c === "]" && depth) depth -= 1;
      if (c === "," && depth === 0) {
        const t = buf.trim();
        if (t) parts.push(t);
        buf = "";
      } else {
        buf += c;
      }
    }
    const last = buf.trim();
    if (last) parts.push(last);
    return parts;
  }

  function skipSkinHost(el) {
    if (!el || !el.getAttribute) return true;
    if (el.id === ROOT_ID || el.id === HUD_ID || el.id === STYLE_ID) return true;
    if (el.closest && el.closest("#" + HUD_ID)) return true;
    return false;
  }

  function stampSelectorList(list, attr, value) {
    const sels = splitSelectorList(list || []);
    for (let i = 0; i < sels.length; i++) {
      let nodes;
      try {
        nodes = document.querySelectorAll(sels[i]);
      } catch (_) {
        continue;
      }
      for (let n = 0; n < nodes.length; n++) {
        const el = nodes[n];
        if (skipSkinHost(el)) continue;
        if (el.getAttribute(attr) !== value) el.setAttribute(attr, value);
      }
    }
  }

  function tagAdapterRegions() {
    const attr = regionAttr || REGION_ATTR;
    const regions = regionMap && typeof regionMap === "object" ? regionMap : FALLBACK_REGIONS;
    const keys = REGION_KEYS.concat(CHROME_KEYS);
    for (let r = 0; r < keys.length; r++) {
      const key = keys[r];
      stampSelectorList(regions[key] || [], attr, key);
    }
    tagAdapterHoles();
  }

  function tagAdapterHoles() {
    const attr = holeAttr || HOLE_ATTR;
    stampSelectorList(Array.isArray(holeList) ? holeList : FALLBACK_HOLES, attr, "1");
  }

  function selectorHitsUntagged(sel, attr, value) {
    let el;
    try {
      el = document.querySelector(sel);
    } catch (_) {
      return false;
    }
    if (!el || skipSkinHost(el)) return false;
    return el.getAttribute(attr) !== value;
  }

  function hasUntaggedRegionTarget() {
    const attr = regionAttr || REGION_ATTR;
    const regions = regionMap && typeof regionMap === "object" ? regionMap : FALLBACK_REGIONS;
    const keys = REGION_KEYS.concat(CHROME_KEYS);
    for (let r = 0; r < keys.length; r++) {
      const key = keys[r];
      const sels = splitSelectorList(regions[key] || []);
      for (let i = 0; i < sels.length; i++) {
        if (selectorHitsUntagged(sels[i], attr, key)) return true;
      }
    }
    return false;
  }

  function hasUntaggedHoleTarget() {
    const attr = holeAttr || HOLE_ATTR;
    const sels = splitSelectorList(Array.isArray(holeList) ? holeList : FALLBACK_HOLES);
    for (let i = 0; i < sels.length; i++) {
      if (selectorHitsUntagged(sels[i], attr, "1")) return true;
    }
    return false;
  }

  function hasUntaggedTarget() {
    return hasUntaggedRegionTarget() || hasUntaggedHoleTarget();
  }

  function isOwnSkinHostNode(node) {
    if (!node || node.nodeType !== 1) return true;
    const id = node.id;
    return id === ROOT_ID || id === HUD_ID || id === STYLE_ID;
  }

  function mutationsOnlyOwnSkinHosts(mutations) {
    if (!mutations || !mutations.length) return true;
    for (let i = 0; i < mutations.length; i++) {
      const m = mutations[i];
      const added = m.addedNodes;
      const removed = m.removedNodes;
      for (let n = 0; n < added.length; n++) {
        if (!isOwnSkinHostNode(added[n])) return false;
      }
      for (let n = 0; n < removed.length; n++) {
        if (!isOwnSkinHostNode(removed[n])) return false;
      }
    }
    return true;
  }

  function applyFrostLevel(level) {
    frostLevel = Math.min(100, Math.max(0, Math.round(level)));
    writeFrostLevel(frostLevel);
    const a = frostAlphas(frostLevel);
    const html = document.documentElement;
    html.style.setProperty("--cds-frost-level", String(frostLevel));
    const t = frostLevel / 100;
    const blur = Math.round(8 + t * 28);
    const soft = Math.round(6 + t * 18);
    html.style.setProperty("--cds-frost", "blur(" + blur + "px) saturate(1.25)");
    html.style.setProperty("--cds-frost-soft", "blur(" + soft + "px) saturate(1.15)");
    const dark = html.getAttribute("data-cds-scheme") !== "light";
    html.style.setProperty(
      "--cds-tool-surface",
      dark ? "rgba(8, 10, 14, " + a.tool + ")" : "rgba(248, 250, 252, " + a.tool + ")"
    );
    html.style.setProperty(
      "--cds-float",
      dark ? "rgba(12, 14, 22, " + a.float + ")" : "rgba(18, 22, 34, " + a.float + ")"
    );
    tagSidebarDock();
    const label = document.querySelector("#cursor-dream-skin-hud [data-cds-frost-value]");
    if (label) label.textContent = frostLevel + "%";
    const slider = document.querySelector("#cursor-dream-skin-hud [data-cds-frost-range]");
    if (slider && Number(slider.value) !== frostLevel) slider.value = String(frostLevel);
  }

  function applyPaletteTint(tokens) {
    const html = document.documentElement;
    if (!tokens || typeof tokens !== "object") {
      lastPaletteTokens = null;
      html.removeAttribute("data-cds-palette");
      applyFrostLevel(frostLevel);
      applyWorkspaceSurfaces();
      return;
    }
    lastPaletteTokens = tokens;
    const accent = tokens["button.background"] || tokens.focusBorder || "";
    const border = hexToRgba(tokens.focusBorder || tokens["button.background"], 0.35);
    applyFrostLevel(frostLevel);
    applyWorkspaceSurfaces();
    if (accent) html.style.setProperty("--cds-accent", accent);
    if (border) html.style.setProperty("--cds-float-border", border);
    html.setAttribute("data-cds-palette", "1");
  }

  function isVisiblyOpen(el) {
    if (!el) return false;
    try {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) return false;
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") return false;
      return true;
    } catch (_) {
      return false;
    }
  }

  function syncToolPaneMark() {
    try {
      const html = document.documentElement;
      let mode = "";
      const active = document.querySelector(
        ".editor-panel-container [role='tab'][aria-selected='true'], [class*='editor-panel-container'] [role='tab'][aria-selected='true']"
      );
      const text = ((active && active.textContent) || "").toLowerCase().replace(/\s+/g, " ");
      if (/browser/.test(text)) mode = "browser";
      else if (/powershell|terminal|cmd|pwsh/.test(text)) mode = "terminal";
      else if (/changes|diff/.test(text)) mode = "diff";
      if (!mode) {
        const browserPanel = document.querySelector("[id*='tabpanel-editor-panel-group-browser']");
        if (browserPanel && browserPanel.getAttribute("aria-hidden") !== "true" && isVisiblyOpen(browserPanel)) {
          mode = "browser";
        }
      }
      if (!mode) {
        if (isVisiblyOpen(document.querySelector('[data-component="browser-tab-content"]'))) mode = "browser";
        else if (isVisiblyOpen(document.querySelector('[data-component="terminal-tab-content"]'))) mode = "terminal";
      }
      if (mode) html.setAttribute("data-cds-tool-pane", mode);
      else html.removeAttribute("data-cds-tool-pane");
    } catch (_) {
      /* ignore */
    }
  }

  function findXtermInstance() {
    const root = document.querySelector(".xterm");
    if (!root) return null;
    let el = root;
    while (el) {
      try {
        const keys = Object.keys(el);
        for (let i = 0; i < keys.length; i++) {
          const v = el[keys[i]];
          if (v && typeof v === "object" && v.options && typeof v.write === "function") {
            return v;
          }
        }
      } catch (_) {}
      el = el.parentElement;
    }
    return null;
  }

  /** Make Agents terminal canvas draw a transparent background so wallpaper shows. */
  function frostTerminalSurface() {
    try {
      const term = findXtermInstance();
      if (!term || !term.options) return;
      const nextBg = "#00000000";
      const theme = Object.assign({}, term.options.theme || {}, { background: nextBg });
      let changed = false;
      if (!term.options.allowTransparency) {
        term.options.allowTransparency = true;
        changed = true;
      }
      const prevBg = term.options.theme && term.options.theme.background;
      if (prevBg !== nextBg) {
        term.options.theme = theme;
        changed = true;
      }
      const colors =
        term._core && term._core._themeService && term._core._themeService._colors;
      if (colors && colors.background) {
        if (colors.background.css !== nextBg) {
          colors.background.css = nextBg;
          colors.background.rgba = 0x00000000;
          changed = true;
        }
        try {
          if (term._core._themeService._onChangeColors && term._core._themeService._onChangeColors.fire) {
            term._core._themeService._onChangeColors.fire(colors);
          }
        } catch (_) {}
      }
      if (changed) {
        try {
          term.refresh(0, Math.max(0, (term.rows || 1) - 1));
        } catch (_) {}
        try {
          if (term._core && term._core._renderService && term._core._renderService.refreshRows) {
            term._core._renderService.refreshRows(0, Math.max(0, (term.rows || 1) - 1));
          }
        } catch (_) {}
      }
    } catch (_) {
      /* ignore */
    }
  }

  const TOOL_PANE_HOST_SEL =
    '[data-component="terminal-tab-content"], [data-component="browser-tab-content"]';

  function healToolPaneDamage() {
    try {
      document.querySelectorAll(TOOL_PANE_HOST_SEL).forEach(function (host) {
        if (!host || !host.style) return;
        // Old injectors forced overflow/flex/absolute webview sizing and
        // blew terminal hosts to 50kpx tall — strip those leftovers only.
        host.style.removeProperty("overflow");
        host.style.removeProperty("min-height");
        host.style.removeProperty("position");
        host.style.removeProperty("flex");
        host.style.removeProperty("isolation");
        host.style.removeProperty("background");
        host.style.removeProperty("background-color");
      });
      document.querySelectorAll("webview").forEach(function (wv) {
        if (!wv) return;
        const st = String(wv.getAttribute("style") || "");
        if (/position:\s*absolute/i.test(st) || /important/i.test(st)) {
          wv.removeAttribute("style");
          wv.removeAttribute("width");
          wv.removeAttribute("height");
        }
      });
      document.querySelectorAll(".webview-browser-container").forEach(function (el) {
        if (!el || !el.style) return;
        const st = String(el.getAttribute("style") || "");
        if (/opacity:\s*1\s*!important/i.test(st) || /z-index:\s*20\s*!important/i.test(st)) {
          el.style.removeProperty("opacity");
          el.style.removeProperty("pointer-events");
          el.style.removeProperty("z-index");
          el.style.removeProperty("visibility");
        }
      });
      frostTerminalSurface();
    } catch (_) {
      /* ignore */
    }
  }

  /** True when leftover inline styles from old sizeToolWebviews loops are present. */
  function legacyToolPaneDamagePresent() {
    try {
      const hosts = document.querySelectorAll(TOOL_PANE_HOST_SEL);
      for (let i = 0; i < hosts.length; i++) {
        const s = hosts[i] && hosts[i].style;
        if (!s) continue;
        const minH = parseFloat(s.minHeight) || 0;
        if (minH > 4000) return true;
        if (s.position === "absolute" || s.position === "fixed") return true;
        if (s.isolation) return true;
      }
      const webviews = document.querySelectorAll("webview");
      for (let i = 0; i < webviews.length; i++) {
        const st = String(webviews[i].getAttribute("style") || "");
        if (/position:\s*absolute/i.test(st) || /important/i.test(st)) return true;
      }
      const boxes = document.querySelectorAll(".webview-browser-container");
      for (let i = 0; i < boxes.length; i++) {
        const st = String(boxes[i].getAttribute("style") || "");
        if (/opacity:\s*1\s*!important/i.test(st) || /z-index:\s*20\s*!important/i.test(st)) {
          return true;
        }
      }
    } catch (_) {
      /* ignore */
    }
    return false;
  }

  function xtermNeedsFrost() {
    try {
      const term = findXtermInstance();
      if (!term || !term.options) return false;
      if (!term.options.allowTransparency) return true;
      const prevBg = term.options.theme && term.options.theme.background;
      return prevBg !== "#00000000";
    } catch (_) {
      return false;
    }
  }

  function stopToolPaneShieldBurst() {
    if (!global.__cdsToolPaneShieldTimer) return;
    try {
      clearInterval(global.__cdsToolPaneShieldTimer);
    } catch (_) {}
    global.__cdsToolPaneShieldTimer = null;
  }

  /**
   * Race leftover sizeToolWebviews intervals we cannot clearInterval.
   * Only armed when legacy inline damage is actually present; stops once clean or max burst.
   */
  function armToolPaneShieldBurst(gen) {
    if (global.__cdsToolPaneGen !== gen) return;
    if (global.__cdsToolPaneShieldTimer) return;
    const started = Date.now();
    const burstMs = 2000;
    global.__cdsToolPaneShieldTimer = setInterval(function () {
      if (global.__cdsToolPaneGen !== gen) {
        stopToolPaneShieldBurst();
        return;
      }
      healToolPaneDamage();
      if (!legacyToolPaneDamagePresent() || Date.now() - started >= burstMs) {
        stopToolPaneShieldBurst();
      }
    }, 200);
  }

  function ensureToolPaneWatch() {
    const gen = VERSION;
    global.__cdsToolPaneGen = gen;
    // Disable any older injector loops that still call sizeToolWebviews.
    global.__cdsToolPaneWatch = gen;
    if (global.__cdsToolPaneWatchTimer) {
      try {
        clearInterval(global.__cdsToolPaneWatchTimer);
      } catch (_) {}
      global.__cdsToolPaneWatchTimer = null;
    }
    stopToolPaneShieldBurst();
    if (global.__cdsToolPaneShieldFallback) {
      try {
        clearInterval(global.__cdsToolPaneShieldFallback);
      } catch (_) {}
      global.__cdsToolPaneShieldFallback = null;
    }
    if (global.__cdsToolPaneClickHandler) {
      try {
        document.removeEventListener("click", global.__cdsToolPaneClickHandler, true);
      } catch (_) {}
      global.__cdsToolPaneClickHandler = null;
    }
    const kick = function () {
      if (global.__cdsToolPaneGen !== gen) return;
      syncToolPaneMark();
      tagSidebarDock();
      healToolPaneDamage();
      if (legacyToolPaneDamagePresent()) armToolPaneShieldBurst(gen);
    };
    global.__cdsToolPaneClickHandler = kick;
    document.addEventListener("click", kick, true);
    global.__cdsToolPaneWatchTimer = setInterval(kick, 2500);
    // Slow safety net only — not the main heal path. Catches a new xterm/webview
    // that appeared without a click, or leftover damage from an uncleared old loop.
    global.__cdsToolPaneShieldFallback = setInterval(function () {
      if (global.__cdsToolPaneGen !== gen) return;
      if (global.__cdsToolPaneShieldTimer) return;
      if (!legacyToolPaneDamagePresent() && !xtermNeedsFrost()) return;
      healToolPaneDamage();
      if (legacyToolPaneDamagePresent()) armToolPaneShieldBurst(gen);
    }, 8000);
    kick();
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
    const packBtns = hud.querySelectorAll("button[data-theme-pack-id]");
    for (let i = 0; i < packBtns.length; i++) {
      const btn = packBtns[i];
      btn.setAttribute(
        "data-active",
        btn.getAttribute("data-theme-pack-id") === activeThemePackId ? "1" : "0"
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
    activeThemePackId = "";
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

  function queueThemePack(packId) {
    activeThemePackId = packId || "";
    pending.push({
      type: "theme-pack",
      packId: packId,
      at: Date.now(),
    });
    setPanelActive();
  }

  function queueWallpaper(filePath, name) {
    pending.push({
      type: "wallpaper",
      path: filePath,
      name: name || "",
      at: Date.now(),
    });
    wallpaperLabel = name || "Custom";
    activeThemePackId = "";
    setPanelActive();
  }

  function queueWallpaperBrowse(folder) {
    pending.push({
      type: folder ? "wallpaper-browse-folder" : "wallpaper-browse",
      at: Date.now(),
    });
    activeThemePackId = "";
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

  function viewportBox() {
    const el = document.documentElement;
    const vv = window.visualViewport;
    const heights = [
      el && el.clientHeight,
      window.innerHeight,
      vv && vv.height,
    ];
    const widths = [
      el && el.clientWidth,
      window.innerWidth,
      vv && vv.width,
    ];
    const hOk = heights.filter(function (n) {
      return typeof n === "number" && n >= 320 && n <= 2200;
    });
    const wOk = widths.filter(function (n) {
      return typeof n === "number" && n >= 480 && n <= 3840;
    });
    return {
      w: wOk.length ? Math.max.apply(null, wOk) : 1200,
      h: hOk.length ? Math.min.apply(null, hOk) : 800,
      ox: 0,
      oy: 0,
    };
  }

  function panelSize(hud) {
    const collapsed = hud.getAttribute("data-collapsed") !== "0";
    return {
      collapsed: collapsed,
      w: collapsed ? 118 : 260,
      h: collapsed ? 40 : Math.min(560, Math.max(hud.getBoundingClientRect().height || 320, 40)),
    };
  }

  function defaultPanelPos(hud) {
    const s = panelSize(hud);
    const vp = viewportBox();
    return {
      x: Math.max(vp.ox + 8, vp.ox + vp.w - s.w - 16),
      y: Math.max(vp.oy + 44, vp.oy + vp.h - s.h - 16),
    };
  }

  function clampPanel(hud, left, top) {
    const s = panelSize(hud);
    const vp = viewportBox();
    const margin = 8;
    const minY = 44 + vp.oy;
    const minX = margin + vp.ox;
    const maxX = Math.max(minX, vp.ox + vp.w - s.w - margin);
    const maxY = Math.max(minY, vp.oy + vp.h - s.h - margin);
    return {
      x: Math.min(Math.max(minX, left), maxX),
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
      const d = defaultPanelPos(hud);
      placePanel(hud, d.x, d.y);
      return;
    }
    const vp = viewportBox();
    const offscreen =
      pos.y > vp.oy + vp.h - 8 ||
      pos.x > vp.ox + vp.w - 8 ||
      pos.y < vp.oy - 40 ||
      pos.x < vp.ox - 40;
    const coversNav = pos.x < 240 && pos.y < 140;
    if (offscreen || coversNav) {
      const d = defaultPanelPos(hud);
      placePanel(hud, d.x, d.y);
      writePos(d.x, d.y);
      return;
    }
    placePanel(hud, pos.x, pos.y);
  }

  /** Kick compositor after maximize/restore — clears fixed-bg / frost smear ghosts. */
  function healViewportAfterResize() {
    try {
      const root = document.getElementById(ROOT_ID);
      if (root) {
        root.style.transform = "translateZ(0) scale(1.0001)";
        void root.offsetWidth;
        root.style.transform = "translateZ(0)";
      }
      const html = document.documentElement;
      html.setAttribute("data-cds-resize-heal", "1");
      requestAnimationFrame(function () {
        html.removeAttribute("data-cds-resize-heal");
      });
      healToolPaneDamage();
      tagFloatingChrome();
      syncTitleBarVars();
    } catch (_) {
      /* ignore */
    }
  }

  function ensureViewportResizeWatch() {
    if (global.__cdsViewportResizeWatch === VERSION) return;
    global.__cdsViewportResizeWatch = VERSION;
    let timer = null;
    let lastW = window.innerWidth;
    let lastH = window.innerHeight;
    window.addEventListener("resize", function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        const w = window.innerWidth;
        const h = window.innerHeight;
        if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 2) return;
        lastW = w;
        lastH = h;
        healViewportAfterResize();
      }, 60);
    });
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

    body.appendChild(sectionTitle("Skin packs"));
    const packMount = document.createElement("div");
    packMount.setAttribute("data-theme-packs-mount", "1");
    packMount.setAttribute(
      "data-sig",
      themePackCatalog
        .map(function (p) {
          return p.id;
        })
        .join(",")
    );
    if (!themePackCatalog.length) {
      const empty = document.createElement("div");
      empty.className = "cds-hud-note";
      empty.textContent = "No packs in /themes — add theme.json folders";
      packMount.appendChild(empty);
    } else {
      for (let i = 0; i < themePackCatalog.length; i++) {
        const p = themePackCatalog[i];
        packMount.appendChild(
          makeBtn(
            p.name,
            {
              className: "cds-pack-btn",
              "data-theme-pack-id": p.id,
              "data-scheme": p.scheme || "dark",
              title: p.tagline || p.name,
            },
            function () {
              queueThemePack(p.id);
            }
          )
        );
      }
    }
    body.appendChild(packMount);

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

    body.appendChild(sectionTitle("Workspace"));
    function makeWsSlider(label, key, hint) {
      const row = document.createElement("div");
      row.className = "cds-frost-row cds-ws-row";
      const head = document.createElement("div");
      head.className = "cds-frost-head";
      const lab = document.createElement("div");
      lab.className = "cds-frost-label";
      lab.textContent = label;
      const val = document.createElement("div");
      val.className = "cds-frost-value";
      val.setAttribute("data-ws-value", key);
      val.textContent = Math.round(workspaceOpacity[key] * 100) + "%";
      head.appendChild(lab);
      head.appendChild(val);
      row.appendChild(head);
      const range = document.createElement("input");
      range.type = "range";
      range.min = "0";
      range.max = "100";
      range.step = "1";
      range.value = String(Math.round(workspaceOpacity[key] * 100));
      range.className = "cds-frost-range";
      range.setAttribute("data-ws-region", key);
      range.title = hint;
      range.addEventListener("input", function () {
        const n = (Number(range.value) || 0) / 100;
        const patch = {};
        patch[key] = n;
        const api = global.__cursorDreamSkin;
        const opts = {
          linkChatToEditor: key === "editor",
          linkTerminalToAuxiliary: key === "auxiliary",
        };
        if (api && typeof api.setWorkspaceOpacity === "function") {
          api.setWorkspaceOpacity(patch, opts);
        } else {
          setWorkspaceOpacity(patch, opts);
        }
      });
      row.appendChild(range);
      return row;
    }
    body.appendChild(makeWsSlider("Sidebar", "sidebar", "Left column · files / explorer"));
    body.appendChild(makeWsSlider("Editor", "editor", "Center · code (chat follows)"));
    body.appendChild(makeWsSlider("Right", "auxiliary", "Right column · Changes / browser"));
    const wsHint = document.createElement("div");
    wsHint.className = "cds-hud-note";
    wsHint.textContent = "Three columns · lower = more wallpaper";
    body.appendChild(wsHint);

    body.appendChild(sectionTitle("Frost"));
    const frostRow = document.createElement("div");
    frostRow.className = "cds-frost-row";
    const frostLabel = document.createElement("div");
    frostLabel.className = "cds-frost-label";
    frostLabel.textContent = "Blur";
    const frostValue = document.createElement("div");
    frostValue.className = "cds-frost-value";
    frostValue.setAttribute("data-cds-frost-value", "1");
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
    frostRange.setAttribute("data-cds-frost-range", "1");
    frostRange.title = "Floating chrome blur · does not change wallpaper or column opacity";
    frostRange.addEventListener("input", function () {
      const api = global.__cursorDreamSkin;
      const n = Number(frostRange.value) || 0;
      if (api && typeof api.setFrostLevel === "function") api.setFrostLevel(n);
      else applyFrostLevel(n);
    });
    frostRow.appendChild(frostRange);
    const frostHint = document.createElement("div");
    frostHint.className = "cds-hud-note";
    frostHint.textContent = "Floating chrome only · does not blur wallpaper";
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
      "WE folder OK · large media shows a poster first, then upgrades · video uses blob (Electron blocks http)";
    body.appendChild(note);

    hud.appendChild(body);
  }

  function rehomeSkinHosts() {
    const body = document.body;
    if (!body) return false;
    let root = document.getElementById(ROOT_ID) || global.__cdsHostRoot;
    if (root) {
      global.__cdsHostRoot = root;
      if (!root.isConnected || root.parentElement !== body) {
        body.insertBefore(root, body.firstChild);
      }
    }
    let hud = document.getElementById(HUD_ID) || global.__cdsHostHud;
    if (hud) {
      global.__cdsHostHud = hud;
      if (!hud.isConnected || !body.contains(hud)) {
        body.appendChild(hud);
      }
    }
    return !!(document.getElementById(ROOT_ID) && document.getElementById(HUD_ID));
  }

  function ensureHostWatch() {
    if (global.__cdsHostWatch === VERSION) return;
    global.__cdsHostWatch = VERSION;
    if (global.__cdsHostFlushTimer) {
      try {
        clearTimeout(global.__cdsHostFlushTimer);
      } catch (_) {}
      global.__cdsHostFlushTimer = null;
    }
    global.__cdsHostStampPending = false;
    const recoverIfHostsMissing = function () {
      const ok = rehomeSkinHosts();
      if (ok || global.__cdsReapplying) return;
      const cfg = global.__cdsLastApplyConfig;
      if (!cfg) return;
      global.__cdsReapplying = true;
      try {
        apply(
          Object.assign({}, cfg, {
            skipMediaReload: !!document.getElementById(ROOT_ID),
            preserveCustomMedia: true,
          })
        );
      } catch (_) {
        /* ignore */
      }
      global.__cdsReapplying = false;
    };
    const stampIfUntagged = function () {
      if (hasUntaggedTarget()) tagAdapterRegions();
    };
    const flushHostWatch = function () {
      if (global.__cdsHostFlushTimer) {
        try {
          clearTimeout(global.__cdsHostFlushTimer);
        } catch (_) {}
        global.__cdsHostFlushTimer = null;
      }
      const wantStamp = !!global.__cdsHostStampPending;
      global.__cdsHostStampPending = false;
      if (wantStamp) stampIfUntagged();
      recoverIfHostsMissing();
    };
    const scheduleHostFlush = function (wantStamp) {
      if (wantStamp) global.__cdsHostStampPending = true;
      if (global.__cdsHostFlushTimer) {
        try {
          clearTimeout(global.__cdsHostFlushTimer);
        } catch (_) {}
      }
      global.__cdsHostFlushTimer = setTimeout(flushHostWatch, 200);
    };
    if (global.__cdsHostMo) {
      try {
        global.__cdsHostMo.disconnect();
      } catch (_) {}
    }
    const mo = new MutationObserver(function (mutations) {
      if (mutationsOnlyOwnSkinHosts(mutations)) {
        scheduleHostFlush(false);
        return;
      }
      scheduleHostFlush(true);
    });
    global.__cdsHostMo = mo;
    const start = function () {
      if (!document.body) {
        setTimeout(start, 40);
        return;
      }
      try {
        mo.observe(document.documentElement, { childList: true });
        mo.observe(document.body, { childList: true });
      } catch (_) {
        /* ignore */
      }
      recoverIfHostsMissing();
    };
    start();
    if (global.__cdsHostTimer) {
      try {
        clearInterval(global.__cdsHostTimer);
      } catch (_) {}
    }
    global.__cdsHostTimer = setInterval(function () {
      stampIfUntagged();
      recoverIfHostsMissing();
    }, 1200);
  }

  function ensurePanel() {
    let hud = document.getElementById(HUD_ID);
    if (hud && hud.getAttribute("data-cds-panel-v") !== PANEL_V) {
      hud.remove();
      hud = null;
    }
    if (hud) {
      const wall = hud.querySelector(".cds-wall-name");
      if (wall) wall.textContent = wallpaperLabel || "Default";
      const palMount = hud.querySelector("[data-palettes-mount]");
      const packMount = hud.querySelector("[data-theme-packs-mount]");
      const sig = paletteCatalog.map(function (p) { return p.id; }).join(",");
      const packSig = themePackCatalog.map(function (p) { return p.id; }).join(",");
      if (
        (palMount && palMount.getAttribute("data-sig") !== sig) ||
        (packMount && packMount.getAttribute("data-sig") !== packSig) ||
        !packMount
      ) {
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
    hud.setAttribute("data-cds-panel-v", PANEL_V);
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
    global.__cdsHostHud = hud;
    global.__cdsHostRoot = document.getElementById(ROOT_ID) || global.__cdsHostRoot;
    try {
      applyPanelPosition(hud);
    } catch (e) {
      try {
        console.warn("[Dream Skin] panel position:", e && e.message ? e.message : e);
      } catch (_) {}
      const d = defaultPanelPos(hud);
      placePanel(hud, d.x, d.y);
    }
    bindPanelViewport(hud);
    setCollapsed(hud, readCollapsed());
    setPanelActive();
    return hud;
  }

  function apply(config) {
    const cfg = config || {};
    if (cfg.selectors && typeof cfg.selectors === "object" && Object.keys(cfg.selectors).length) {
      selectorMap = cfg.selectors;
    } else {
      selectorMap = FALLBACK_SELECTORS;
    }
    if (cfg.regions && typeof cfg.regions === "object" && Object.keys(cfg.regions).length) {
      regionMap = cfg.regions;
    } else {
      regionMap = FALLBACK_REGIONS;
    }
    if (typeof cfg.regionAttr === "string" && cfg.regionAttr) regionAttr = cfg.regionAttr;
    if (Array.isArray(cfg.holes)) {
      holeList = cfg.holes.slice();
    } else {
      holeList = FALLBACK_HOLES.slice();
    }
    if (typeof cfg.holeAttr === "string" && cfg.holeAttr) holeAttr = cfg.holeAttr;
    if (cfg.mappings && typeof cfg.mappings === "object" && Object.keys(cfg.mappings).length) {
      cssMappings = Object.assign({}, DEFAULT_MAPPINGS, cfg.mappings);
    }
    frostLevel = readFrostLevel();
    if (typeof cfg.frost === "number" && !Number.isNaN(cfg.frost)) {
      frostLevel = Math.min(100, Math.max(0, Math.round(cfg.frost)));
      writeFrostLevel(frostLevel);
    } else if (cfg.frost && typeof cfg.frost === "object" && typeof cfg.frost.level === "number") {
      frostLevel = Math.min(100, Math.max(0, Math.round(cfg.frost.level)));
      writeFrostLevel(frostLevel);
    }
    ensureStyle(cfg.cssText || "");
    global.__cdsLastApplyConfig = cfg;
    ensureRoot(cfg.imageDataUrl || "", cfg.art || {}, cfg.videoUrl || "", cfg.imageUrl || "", {
      skipMediaReload: cfg.skipMediaReload === true,
      resetWallpaper: cfg.resetWallpaper === true,
      preserveCustomMedia: cfg.preserveCustomMedia !== false,
      wallpaperLabel: cfg.wallpaperLabel || "",
      mediaEpoch: cfg.mediaEpoch || 0,
      posterKey: cfg.posterKey || "",
      posterDataUrl: cfg.posterDataUrl || "",
    });
    if (cfg.paletteTokens) lastPaletteTokens = cfg.paletteTokens;
    else if (cfg.paletteId === "") lastPaletteTokens = null;
    if (shouldIngestWorkspace(cfg)) {
      ingestWorkspaceFromConfig(cfg);
      if (typeof cfg.themePackId === "string") workspaceSourcePackId = cfg.themePackId;
    }
    applyPaletteTint(cfg.paletteTokens === undefined ? lastPaletteTokens : cfg.paletteTokens || null);
    const html = document.documentElement;
    html.setAttribute(MARK, "1");
    if (cfg.themeId) activeThemeId = cfg.themeId;
    if (typeof cfg.paletteId === "string") activePaletteId = cfg.paletteId;
    if (typeof cfg.wallpaperLabel === "string") wallpaperLabel = cfg.wallpaperLabel;
    if (Array.isArray(cfg.palettes)) paletteCatalog = cfg.palettes;
    if (Array.isArray(cfg.themePacks)) themePackCatalog = cfg.themePacks;
    if (typeof cfg.themePackId === "string") activeThemePackId = cfg.themePackId;
    const scheme =
      cfg.scheme === "light" || cfg.scheme === "dark"
        ? cfg.scheme
        : schemeForTheme(cfg.themeId || activeThemeId);
    html.setAttribute("data-cds-scheme", scheme);
    applyFrostLevel(frostLevel);
    applyWorkspaceSurfaces();
    tagSidebarDock();
    tagAdapterRegions();
    tagFloatingChrome();
    syncTitleBarVars();
    healToolPaneDamage();
    ensureToolPaneWatch();
    ensureViewportResizeWatch();
    syncToolPaneMark();
    try {
      ensurePanel();
      setPanelActive();
      ensureHostWatch();
      rehomeSkinHosts();
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
      themePackId: activeThemePackId,
      wallpaperLabel: wallpaperLabel,
      frost: frostLevel,
      workspace: snapshotWorkspace(),
      video: !!cfg.videoUrl,
      imageUrl: !!cfg.imageUrl,
    };
  }

  function snapshotWorkspace() {
    return {
      sidebar: workspaceOpacity.sidebar,
      editor: workspaceOpacity.editor,
      auxiliary: workspaceOpacity.auxiliary,
      chat: workspaceOpacity.chat,
      terminal: workspaceOpacity.terminal,
      blur: {
        sidebar: workspaceBlur.sidebar,
        editor: workspaceBlur.editor,
        chat: workspaceBlur.chat,
        auxiliary: workspaceBlur.auxiliary,
        terminal: workspaceBlur.terminal,
      },
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
    document.querySelectorAll("[" + (regionAttr || REGION_ATTR) + "]").forEach(function (el) {
      el.removeAttribute(regionAttr || REGION_ATTR);
    });
    document.querySelectorAll("[data-cursor-skin]").forEach(function (el) {
      el.removeAttribute("data-cursor-skin");
    });
    document.querySelectorAll("[" + (holeAttr || HOLE_ATTR) + "]").forEach(function (el) {
      el.removeAttribute(holeAttr || HOLE_ATTR);
    });
    document.querySelectorAll("[data-cursor-skin-hole]").forEach(function (el) {
      el.removeAttribute("data-cursor-skin-hole");
    });
    document.querySelectorAll("[data-cds-sidebar-dock]").forEach(function (el) {
      el.removeAttribute("data-cds-sidebar-dock");
    });
    const html = document.documentElement;
    html.removeAttribute(MARK);
    html.removeAttribute("data-cds-scheme");
    html.removeAttribute("data-cds-video");
    html.removeAttribute("data-cds-still");
    html.removeAttribute("data-cds-palette");
    REGION_KEYS.forEach(function (key) {
      html.removeAttribute("data-cds-clear-" + key);
    });
    [
      "--cds-art",
      "--cds-focus-x",
      "--cds-focus-y",
      "--cds-veil-sidebar",
      "--cds-veil-auxiliary",
      "--cds-veil-editor",
      "--cds-veil-composer",
      "--cds-sidebar",
      "--cds-sidebar-opacity",
      "--cds-sidebar-blur",
      "--cds-sidebar-fill",
      "--cds-sidebar-filter",
      "--cds-editor-opacity",
      "--cds-editor-blur",
      "--cds-editor-fill",
      "--cds-editor-filter",
      "--cds-chat-opacity",
      "--cds-chat-blur",
      "--cds-chat-fill",
      "--cds-chat-filter",
      "--cds-auxiliary-opacity",
      "--cds-auxiliary-blur",
      "--cds-auxiliary-fill",
      "--cds-auxiliary-filter",
      "--cds-terminal-opacity",
      "--cds-terminal-blur",
      "--cds-terminal-fill",
      "--cds-terminal-filter",
      "--cds-chat-panel",
      "--cds-editor-panel",
      "--cds-editor-canvas",
      "--cds-terminal-panel",
      "--cds-frost-sidebar",
      "--cds-frost-editor",
      "--cds-frost-chat",
      "--cds-frost-auxiliary",
      "--cds-frost-terminal",
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
    const s = selectorMap || FALLBACK_SELECTORS;
    const regions = {
      sidebar: q('[data-cursor-skin="sidebar"]'),
      editor: q('[data-cursor-skin="editor"]'),
      chat: q('[data-cursor-skin="chat"]'),
      auxiliary: q('[data-cursor-skin="auxiliary"]'),
      terminal: q('[data-cursor-skin="terminal"]'),
      titlebar: q('[data-cursor-skin="titlebar"]'),
      statusbar: q('[data-cursor-skin="statusbar"]'),
      diff: q('[data-cursor-skin="diff"]'),
    };
    const regionHealth = {
      sidebar: regions.sidebar,
      editor: regions.editor,
      chat: regions.chat,
      auxiliary: regions.auxiliary,
      terminal: regions.terminal,
    };
    return {
      workbench: q(s.workbench || FALLBACK_SELECTORS.workbench),
      sidebar: q(s.sidebar || FALLBACK_SELECTORS.sidebar),
      auxiliarybar: q(s.auxiliarybar || FALLBACK_SELECTORS.auxiliarybar),
      editor: q(s.editor || FALLBACK_SELECTORS.editor),
      editorPanel: q(s.editorPanel || FALLBACK_SELECTORS.editorPanel),
      titlebar: q(s.titlebar || FALLBACK_SELECTORS.titlebar),
      statusbar: q(s.statusbar || FALLBACK_SELECTORS.statusbar),
      composer: q(s.chat || FALLBACK_SELECTORS.chat),
      terminal: q(s.terminal || FALLBACK_SELECTORS.terminal),
      browser: q(s.browser || FALLBACK_SELECTORS.browser),
      diff: q(s.diff || FALLBACK_SELECTORS.diff),
      agentsShell: q(s.agentsShell || FALLBACK_SELECTORS.agentsShell),
      glassRoot: q(s.glassRoot || FALLBACK_SELECTORS.glassRoot),
      regions: regions,
      regionHealth: regionHealth,
      holes: q("[" + (holeAttr || HOLE_ATTR) + "]"),
      skinActive: document.documentElement.getAttribute(MARK) === "1",
      rootPresent: !!document.getElementById(ROOT_ID),
      stylePresent: !!document.getElementById(STYLE_ID),
      hudPresent: !!document.getElementById(HUD_ID),
      scheme: detectScheme(),
      activeThemeId: activeThemeId,
      activePaletteId: activePaletteId,
      activeThemePackId: activeThemePackId,
      wallpaperLabel: wallpaperLabel,
      frostLevel: frostLevel,
      workspace: snapshotWorkspace(),
      runtimeVersion: RUNTIME_VERSION,
      title: document.title || "",
      bodyClasses: document.body ? String(document.body.className).slice(0, 240) : "",
    };
  }

  function getState() {
    return {
      runtimeVersion: RUNTIME_VERSION,
      payloadVersion: VERSION,
      frost: frostLevel,
      workspace: snapshotWorkspace(),
      scheme: detectScheme(),
      themeId: activeThemeId,
      paletteId: activePaletteId,
      themePackId: activeThemePackId,
      wallpaperLabel: wallpaperLabel,
      skinActive: document.documentElement.getAttribute(MARK) === "1",
    };
  }

  /**
   * Public Skin Runtime API (v0.2). Themes / tools should prefer this over DOM hacks.
   * Partial apply queues injector work when media/theme-pack changes are requested.
   */
  function cursorSkinApply(partial) {
    const p = partial && typeof partial === "object" ? partial : {};
    if (typeof p.frost === "number") {
      applyFrostLevel(p.frost);
    } else if (p.frost && typeof p.frost === "object") {
      if (typeof p.frost.level === "number") applyFrostLevel(p.frost.level);
    }
    if (p.workspace && typeof p.workspace === "object") {
      const patch = {};
      const blurPatch = {};
      REGION_KEYS.forEach(function (k) {
        const block = p.workspace[k];
        if (typeof block === "number") patch[k] = block;
        else if (block && typeof block === "object") {
          if (typeof block.opacity === "number") patch[k] = block.opacity;
          if (typeof block.blur === "number") blurPatch[k] = block.blur;
          if (block.surface && typeof block.surface === "object") {
            if (typeof block.surface.opacity === "number") patch[k] = block.surface.opacity;
            if (typeof block.surface.blur === "number") blurPatch[k] = block.surface.blur;
          }
        }
      });
      if (Object.keys(patch).length) setWorkspaceOpacity(patch);
      if (Object.keys(blurPatch).length) setWorkspaceBlur(blurPatch);
    }
    if (typeof p.themePackId === "string" && p.themePackId) {
      queueThemePack(p.themePackId);
    }
    if (typeof p.paletteId === "string" && p.paletteId) {
      queuePalette(p.paletteId);
    }
    if (typeof p.themeId === "string" && p.themeId) {
      const scheme =
        p.scheme === "light" || p.scheme === "dark"
          ? p.scheme
          : schemeForTheme(p.themeId);
      queueTheme(p.themeId, scheme);
    }
    if (p.wallpaper && typeof p.wallpaper === "object") {
      const src = p.wallpaper.source || p.wallpaper.path || p.wallpaper.src || "";
      if (src) {
        pending.push({
          type: "wallpaper",
          path: String(src),
          name: p.wallpaper.name || "",
        });
      }
    }
    // Local-only visual refresh (no injector round-trip) for frost already applied.
    return getState();
  }

  global.__cursorDreamSkin = {
    apply: apply,
    remove: remove,
    probe: probe,
    queueTheme: queueTheme,
    queuePalette: queuePalette,
    queueThemePack: queueThemePack,
    setFrostLevel: applyFrostLevel,
    setWorkspaceOpacity: setWorkspaceOpacity,
    setWorkspaceBlur: setWorkspaceBlur,
    drainRequests: drainRequests,
    themes: THEMES,
    version: VERSION,
    runtimeVersion: RUNTIME_VERSION,
    getState: getState,
    _pending: pending,
    get _activeThemeId() {
      return activeThemeId;
    },
    get _activePaletteId() {
      return activePaletteId;
    },
    get _activeThemePackId() {
      return activeThemePackId;
    },
    get _wallpaperLabel() {
      return wallpaperLabel;
    },
    get _paletteCatalog() {
      return paletteCatalog;
    },
    get _themePackCatalog() {
      return themePackCatalog;
    },
    get _lastPaletteTokens() {
      return lastPaletteTokens;
    },
  };

  global.CursorSkin = {
    version: RUNTIME_VERSION,
    apply: cursorSkinApply,
    getState: getState,
    setFrost: applyFrostLevel,
    setWorkspace: setWorkspaceOpacity,
    setWorkspaceBlur: setWorkspaceBlur,
    listThemes: function () {
      return themePackCatalog.slice();
    },
    listPalettes: function () {
      return paletteCatalog.slice();
    },
    listBaseThemes: function () {
      return THEMES.slice();
    },
    /** @deprecated internal escape hatch */
    _legacy: global.__cursorDreamSkin,
  };

  return global.__cursorDreamSkin;
})(typeof window !== "undefined" ? window : globalThis);
