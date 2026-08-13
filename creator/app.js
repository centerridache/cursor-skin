const REGION_LABELS = {
  sidebar: "Sidebar",
  editor: "Editor",
  chat: "Chat",
  auxiliary: "Right",
  terminal: "Terminal",
};

const state = {
  contract: null,
  sessionId: "",
  idTouched: false,
  theme: null,
  bust: 0,
};

function slugify(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "my-theme";
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function defaultTheme(contract) {
  const d = contract.defaults;
  return {
    schemaVersion: contract.schemaVersion,
    identity: {
      id: "my-theme",
      name: "My Theme",
      version: d.identity.version,
      author: "",
      description: "",
      preview: d.identity.preview,
    },
    appearance: {
      wallpaper: { ...d.appearance.wallpaper },
      baseTheme: d.appearance.baseTheme,
      scheme: d.appearance.scheme,
      frost: { ...d.appearance.frost },
    },
    workspace: clone(d.workspace),
    performance: { ...d.performance },
  };
}

function $(id) {
  return document.getElementById(id);
}

function fileUrl(rel) {
  if (!rel || !state.sessionId) return "";
  return `/api/session/${state.sessionId}/file?path=${encodeURIComponent(rel)}&t=${state.bust}`;
}

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/zip")) {
    if (!res.ok) throw new Error("export failed");
    return res.blob();
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
}

function readFormIntoTheme() {
  const t = state.theme;
  t.identity.name = $("name").value.trim() || "My Theme";
  t.identity.id = $("id").value.trim() || slugify(t.identity.name);
  t.identity.author = $("author").value.trim();
  t.identity.version = $("version").value.trim() || "1.0.0";
  t.identity.description = $("description").value.trim();
  t.appearance.scheme = $("scheme").value;
  t.appearance.baseTheme = $("baseTheme").value;
  t.appearance.frost.enabled = $("frost-enabled").checked;
  t.appearance.frost.opacity = Number($("frost-opacity").value) / 100;
  t.appearance.frost.blur = Number($("frost-blur").value);
  for (const key of state.contract.regions) {
    const op = document.querySelector(`[data-op="${key}"]`);
    const bl = document.querySelector(`[data-bl="${key}"]`);
    if (!t.workspace[key]) t.workspace[key] = { surface: { opacity: 0.5, blur: 8 } };
    if (!t.workspace[key].surface) t.workspace[key].surface = {};
    if (op) t.workspace[key].surface.opacity = Number(op.value) / 100;
    if (bl) t.workspace[key].surface.blur = Number(bl.value);
  }
}

function fillForm() {
  const t = state.theme;
  $("name").value = t.identity.name || "";
  $("id").value = t.identity.id || "";
  $("author").value = t.identity.author || "";
  $("version").value = t.identity.version || "1.0.0";
  $("description").value = t.identity.description || "";
  $("scheme").value = t.appearance.scheme === "light" ? "light" : "dark";
  $("baseTheme").value = t.appearance.baseTheme || "Cursor Dark";
  $("frost-enabled").checked = t.appearance.frost?.enabled !== false;
  $("frost-opacity").value = String(Math.round((t.appearance.frost?.opacity ?? 0.5) * 100));
  $("frost-blur").value = String(t.appearance.frost?.blur ?? 16);
  $("frost-opacity-val").textContent = $("frost-opacity").value + "%";
  $("frost-blur-val").textContent = $("frost-blur").value + "px";
  for (const key of state.contract.regions) {
    const surface = t.workspace?.[key]?.surface || {};
    const op = document.querySelector(`[data-op="${key}"]`);
    const bl = document.querySelector(`[data-bl="${key}"]`);
    const opVal = document.querySelector(`[data-op-val="${key}"]`);
    const blVal = document.querySelector(`[data-bl-val="${key}"]`);
    if (op) op.value = String(Math.round((surface.opacity ?? 0.5) * 100));
    if (bl) bl.value = String(surface.blur ?? 8);
    if (opVal) opVal.textContent = op.value + "%";
    if (blVal) blVal.textContent = bl.value + "px";
  }
  $("wallpaper-name").textContent = t.appearance.wallpaper?.src
    ? "当前：" + t.appearance.wallpaper.src
    : "尚未选择壁纸";
  $("preview-name").textContent = t.identity.preview ? "当前：" + t.identity.preview : "";
}

function renderWorkspaceMount() {
  const mount = $("workspace-mount");
  mount.textContent = "";
  const maxBlur = state.contract.surfaceBlurMax || 64;
  for (const key of state.contract.regions) {
    const row = document.createElement("div");
    row.className = "ws-row";
    const lab = document.createElement("strong");
    lab.textContent = REGION_LABELS[key] || key;
    const sliders = document.createElement("div");
    sliders.className = "ws-sliders";

    const opLine = document.createElement("span");
    opLine.append("Opacity ");
    const opVal = document.createElement("span");
    opVal.setAttribute("data-op-val", key);
    opLine.appendChild(opVal);
    const op = document.createElement("input");
    op.type = "range";
    op.min = "0";
    op.max = "100";
    op.setAttribute("data-op", key);

    const blLine = document.createElement("span");
    blLine.append("Blur ");
    const blVal = document.createElement("span");
    blVal.setAttribute("data-bl-val", key);
    blLine.appendChild(blVal);
    const bl = document.createElement("input");
    bl.type = "range";
    bl.min = "0";
    bl.max = String(maxBlur);
    bl.setAttribute("data-bl", key);

    sliders.append(opLine, op, blLine, bl);
    row.append(lab, sliders);
    mount.appendChild(row);
    op.addEventListener("input", onFormInput);
    bl.addEventListener("input", onFormInput);
  }
}

function renderTiers() {
  const mount = $("tier-mount");
  mount.textContent = "";
  for (const tier of state.contract.performanceTiers) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = tier;
    btn.dataset.tier = tier;
    btn.addEventListener("click", () => {
      state.theme.performance.tier = tier;
      syncTiers();
      refreshPreview();
    });
    mount.appendChild(btn);
  }
  syncTiers();
}

function syncTiers() {
  const current = state.theme.performance?.tier || "balanced";
  for (const btn of $("tier-mount").querySelectorAll("button")) {
    btn.setAttribute("aria-pressed", btn.dataset.tier === current ? "true" : "false");
  }
}

function paneRgba(opacity, light) {
  const t = Math.min(1, Math.max(0, Number(opacity) || 0));
  const a = 0.08 + t * 0.72;
  return light ? `rgba(248, 250, 252, ${a})` : `rgba(10, 14, 22, ${a})`;
}

function refreshPreview() {
  readFormIntoTheme();
  $("frost-opacity-val").textContent = $("frost-opacity").value + "%";
  $("frost-blur-val").textContent = $("frost-blur").value + "px";
  for (const key of state.contract.regions) {
    const op = document.querySelector(`[data-op="${key}"]`);
    const bl = document.querySelector(`[data-bl="${key}"]`);
    const opVal = document.querySelector(`[data-op-val="${key}"]`);
    const blVal = document.querySelector(`[data-bl-val="${key}"]`);
    if (opVal && op) opVal.textContent = op.value + "%";
    if (blVal && bl) blVal.textContent = bl.value + "px";
  }

  const t = state.theme;
  $("preview-title").textContent = `${t.identity.name} · ${t.performance.tier}`;
  $("json-out").textContent = JSON.stringify(t, null, 2);

  const stage = $("stage");
  const light = t.appearance.scheme === "light";
  stage.setAttribute("data-scheme", light ? "light" : "dark");

  const wall = $("wall");
  const src = t.appearance.wallpaper?.src;
  const kind = t.appearance.wallpaper?.type;
  wall.textContent = "";
  wall.style.backgroundImage = "";
  if (src) {
    const url = fileUrl(src);
    if (kind === "video") {
      const v = document.createElement("video");
      v.src = url;
      v.autoplay = true;
      v.loop = true;
      v.muted = true;
      v.playsInline = true;
      wall.appendChild(v);
    } else {
      wall.style.backgroundImage = `url("${url}")`;
    }
  }

  const frostOn = t.appearance.frost?.enabled !== false;
  const frostBlur = frostOn ? t.appearance.frost?.blur ?? 16 : 0;
  const chrome = stage.querySelector("[data-chrome]");
  chrome.style.background = paneRgba(t.appearance.frost?.opacity ?? 0.5, light);
  chrome.style.backdropFilter = frostBlur ? `blur(${frostBlur}px)` : "none";

  for (const key of state.contract.regions) {
    const el = stage.querySelector(`[data-region="${key}"]`);
    if (!el) continue;
    const surface = t.workspace[key]?.surface || {};
    const blur = frostOn ? surface.blur ?? 0 : 0;
    el.style.background = paneRgba(surface.opacity, light);
    el.style.backdropFilter = blur ? `blur(${blur}px) saturate(1.15)` : "none";
  }
  syncTiers();
}

function onFormInput(e) {
  if (e?.target?.id === "id") state.idTouched = true;
  if (e?.target?.id === "name" && !state.idTouched) {
    $("id").value = slugify($("name").value);
  }
  refreshPreview();
}

function formatReport(result) {
  const lines = [];
  const c = result.checks || {};
  const mark = (ok) => (ok ? "✓" : "✗");
  lines.push("Cursor Skin Theme Validator");
  lines.push("");
  if (Object.keys(c).length) {
    lines.push(`${mark(c.schema)} Schema`);
    lines.push(`${mark(c.identity)} Identity`);
    lines.push(`${mark(c.appearance)} Appearance`);
    lines.push(`${mark(c.workspace)} Workspace`);
    lines.push(`${mark(c.wallpaper)} Wallpaper`);
    lines.push(`${mark(c.preview)} Preview`);
    lines.push(`${mark(c.assets)} Assets`);
    lines.push("");
  }
  for (const w of result.warnings || []) lines.push("⚠ " + w.message);
  if (result.warnings?.length) lines.push("");
  for (const err of result.errors || []) lines.push("✗ " + err.message);
  if (result.errors?.length) lines.push("");
  lines.push(result.ok ? (result.warnings?.length ? "Theme is valid (with warnings)." : "Theme is valid.") : "Theme is invalid.");
  return lines.join("\n");
}

function showReport(result) {
  const el = $("report");
  el.textContent = formatReport(result);
  el.dataset.ok = result.ok ? "1" : "0";
}

function wallpaperRel(file) {
  const ext = (file.name.match(/\.[a-z0-9]+$/i) || [".jpg"])[0].toLowerCase();
  const video = file.type.startsWith("video/") || [".mp4", ".webm"].includes(ext);
  return { rel: "wallpaper/main" + ext, type: video ? "video" : "image" };
}

async function putFile(rel, file) {
  const buf = await file.arrayBuffer();
  const res = await fetch(`/api/session/${state.sessionId}/file?path=${encodeURIComponent(rel)}`, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: buf,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "upload failed");
  state.bust += 1;
}

async function onWallpaper(file) {
  if (!file) return;
  const { rel, type } = wallpaperRel(file);
  await putFile(rel, file);
  state.theme.appearance.wallpaper = { type, src: rel };
  if (type === "image") state.theme.identity.preview = rel;
  fillForm();
  refreshPreview();
}

async function onPreview(file) {
  if (!file) return;
  const ext = (file.name.match(/\.[a-z0-9]+$/i) || [".jpg"])[0].toLowerCase();
  const rel = "preview" + ext;
  await putFile(rel, file);
  state.theme.identity.preview = rel;
  fillForm();
  refreshPreview();
}

async function validateNow() {
  readFormIntoTheme();
  const result = await api(`/api/session/${state.sessionId}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme: state.theme }),
  });
  showReport(result);
  return result;
}

async function exportZip() {
  readFormIntoTheme();
  const result = await validateNow();
  if (!result.ok) return;
  const blob = await api(`/api/session/${state.sessionId}/export`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ theme: state.theme }),
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${state.theme.identity.id}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importZip(file) {
  const buf = await file.arrayBuffer();
  const json = await api(`/api/session/${state.sessionId}/import`, {
    method: "POST",
    headers: { "Content-Type": "application/zip" },
    body: buf,
  });
  state.theme = json.theme;
  state.idTouched = true;
  state.bust += 1;
  fillForm();
  refreshPreview();
  await validateNow();
}

async function loadExample() {
  const id = $("example").value;
  if (!id) return;
  const json = await api(`/api/session/${state.sessionId}/load-example`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  state.theme = json.theme;
  state.idTouched = true;
  state.bust += 1;
  fillForm();
  refreshPreview();
  $("report").textContent = `已载入官方示例 ${id}。可改完再校验 / 导出。`;
  $("report").dataset.ok = "";
}

async function boot() {
  const [contract, session, examples] = await Promise.all([
    api("/api/contract"),
    api("/api/session", { method: "POST" }),
    api("/api/examples"),
  ]);
  state.contract = contract;
  state.sessionId = session.id;
  state.theme = defaultTheme(contract);

  renderWorkspaceMount();
  renderTiers();

  const ex = $("example");
  for (const pack of examples.examples || []) {
    const opt = document.createElement("option");
    opt.value = pack.id;
    opt.textContent = pack.name + " (" + pack.id + ")";
    ex.appendChild(opt);
  }

  for (const id of ["name", "id", "author", "version", "description", "scheme", "baseTheme", "frost-enabled", "frost-opacity", "frost-blur"]) {
    $(id).addEventListener("input", onFormInput);
  }
  $("wallpaper").addEventListener("change", (e) => onWallpaper(e.target.files[0]).catch(showErr));
  $("preview").addEventListener("change", (e) => onPreview(e.target.files[0]).catch(showErr));
  $("import-zip").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) importZip(f).catch(showErr);
    e.target.value = "";
  });
  $("btn-validate").addEventListener("click", () => validateNow().catch(showErr));
  $("btn-export").addEventListener("click", () => exportZip().catch(showErr));
  $("btn-example").addEventListener("click", () => loadExample().catch(showErr));

  fillForm();
  refreshPreview();
}

function showErr(err) {
  $("report").textContent = String(err.message || err);
  $("report").dataset.ok = "0";
}

boot().catch(showErr);
