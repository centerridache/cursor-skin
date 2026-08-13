/**
 * Theme Creator local server (127.0.0.1 only).
 *
 *   npm run creator
 *   node scripts/creator-server.mjs
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import {
  CONTRACT_SCHEMA_VERSION,
  DEFAULTS,
  PERFORMANCE_TIERS,
  RESOURCE_LIMITS,
  SURFACE_BLUR_MAX,
  WORKSPACE_REGIONS,
} from "../theme/schema/defaults.mjs";
import { validateThemeDocument } from "../theme/validator/validate.mjs";
import { packZip, unpackZip } from "./zip-lite.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CREATOR_DIR = path.join(ROOT, "creator");
const THEMES_DIR = path.join(ROOT, "themes");
const HOST = "127.0.0.1";
const PORT = Number(process.env.CREATOR_PORT || 3847);
const JSON_LIMIT = 2 * 1024 * 1024;
const BLOB_LIMIT = RESOURCE_LIMITS.videoMaxBytes + 8 * 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const sessions = new Map();

function newSession() {
  const id = crypto.randomBytes(8).toString("hex");
  sessions.set(id, { files: new Map(), created: Date.now() });
  pruneSessions();
  return id;
}

function pruneSessions() {
  const maxAge = 2 * 60 * 60 * 1000;
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (now - s.created > maxAge) sessions.delete(id);
  }
}

function getSession(id) {
  const s = sessions.get(String(id || ""));
  if (!s) return null;
  s.created = Date.now();
  return s;
}

function safeRel(rel) {
  const cleaned = String(rel || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!cleaned || cleaned.includes("\0") || cleaned.split("/").includes("..")) return "";
  return cleaned;
}

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(body == null ? "" : String(body));
  res.writeHead(status, {
    "Content-Length": buf.length,
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(buf);
}

function sendJson(res, status, obj) {
  send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8" });
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0;
    req.on("data", (c) => {
      n += c.length;
      if (n > limit) {
        reject(Object.assign(new Error("body too large"), { code: "too-large" }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, JSON_LIMIT);
  if (!buf.length) return {};
  return JSON.parse(buf.toString("utf8"));
}

function virtualFilesFromSession(session) {
  const out = {};
  for (const [rel, rec] of session.files) out[rel] = { size: rec.data.length };
  return out;
}

function stripZipRoot(name) {
  const parts = safeRel(name).split("/");
  if (parts.length > 1 && parts[0] && !parts[0].includes(".")) return parts.slice(1).join("/");
  return parts.join("/");
}

function listExamples() {
  if (!fs.existsSync(THEMES_DIR)) return [];
  return fs
    .readdirSync(THEMES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(THEMES_DIR, d.name, "theme.json")))
    .map((d) => {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, d.name, "theme.json"), "utf8"));
        return {
          id: raw.identity?.id || d.name,
          name: raw.identity?.name || d.name,
          description: raw.identity?.description || "",
        };
      } catch {
        return { id: d.name, name: d.name, description: "" };
      }
    });
}

function loadExampleInto(session, exampleId) {
  const id = String(exampleId || "").trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error("invalid example id");
  const dir = path.join(THEMES_DIR, id);
  const themeJson = path.join(dir, "theme.json");
  if (!fs.existsSync(themeJson)) throw new Error("example not found");
  const theme = JSON.parse(fs.readFileSync(themeJson, "utf8"));
  session.files.clear();
  const walk = (abs, relBase) => {
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
      const full = path.join(abs, ent.name);
      if (ent.isDirectory()) walk(full, rel);
      else if (ent.name !== "theme.json" && ent.name !== "README.md") {
        session.files.set(rel.replace(/\\/g, "/"), {
          data: fs.readFileSync(full),
          mime: MIME[path.extname(ent.name).toLowerCase()] || "application/octet-stream",
        });
      }
    }
  };
  walk(dir, "");
  return theme;
}

function buildReadme(theme) {
  const id = theme.identity?.id || "theme";
  const name = theme.identity?.name || id;
  const author = theme.identity?.author || "";
  const desc = theme.identity?.description || "";
  return `# ${name}

${desc}

- id: \`${id}\`
- author: ${author || "(unknown)"}
- schemaVersion: ${theme.schemaVersion || CONTRACT_SCHEMA_VERSION}

Made with Cursor Skin Theme Creator. Validate with:

\`\`\`
npm run theme:validate -- themes/${id}
\`\`\`
`;
}

function collectExportEntries(theme, session) {
  const id = String(theme.identity?.id || "theme").trim();
  const entries = [
    {
      name: `${id}/theme.json`,
      data: Buffer.from(JSON.stringify(theme, null, 2) + "\n", "utf8"),
    },
    {
      name: `${id}/README.md`,
      data: Buffer.from(buildReadme(theme), "utf8"),
    },
  ];
  for (const [rel, rec] of session.files) {
    if (rel === "theme.json" || rel === "README.md") continue;
    entries.push({ name: `${id}/${rel}`, data: rec.data });
  }
  return entries;
}

function serveCreator(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";
  const abs = path.resolve(CREATOR_DIR, "." + rel);
  if (!abs.startsWith(CREATOR_DIR + path.sep) && abs !== CREATOR_DIR) {
    send(res, 403, "forbidden");
    return;
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    send(res, 404, "not found");
    return;
  }
  const ext = path.extname(abs).toLowerCase();
  send(res, 200, fs.readFileSync(abs), { "Content-Type": MIME[ext] || "application/octet-stream" });
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && url.pathname === "/api/contract") {
    sendJson(res, 200, {
      schemaVersion: CONTRACT_SCHEMA_VERSION,
      defaults: DEFAULTS,
      regions: WORKSPACE_REGIONS,
      performanceTiers: PERFORMANCE_TIERS,
      resourceLimits: RESOURCE_LIMITS,
      surfaceBlurMax: SURFACE_BLUR_MAX,
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/examples") {
    sendJson(res, 200, { examples: listExamples() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/session") {
    sendJson(res, 200, { id: newSession() });
    return;
  }

  if (parts[0] === "api" && parts[1] === "session" && parts[2]) {
    const session = getSession(parts[2]);
    if (!session) {
      sendJson(res, 404, { error: "session expired" });
      return;
    }

    if (req.method === "PUT" && parts[3] === "file") {
      const rel = safeRel(url.searchParams.get("path") || "");
      if (!rel) {
        sendJson(res, 400, { error: "missing path" });
        return;
      }
      const data = await readBody(req, BLOB_LIMIT);
      session.files.set(rel, {
        data,
        mime: req.headers["content-type"] || MIME[path.extname(rel).toLowerCase()] || "application/octet-stream",
      });
      sendJson(res, 200, { ok: true, path: rel, size: data.length });
      return;
    }

    if (req.method === "DELETE" && parts[3] === "file") {
      const rel = safeRel(url.searchParams.get("path") || "");
      if (rel) session.files.delete(rel);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && parts[3] === "file") {
      const rel = safeRel(url.searchParams.get("path") || "");
      const rec = session.files.get(rel);
      if (!rec) {
        send(res, 404, "not found");
        return;
      }
      send(res, 200, rec.data, { "Content-Type": rec.mime });
      return;
    }

    if (req.method === "GET" && parts[3] === "files") {
      sendJson(
        res,
        200,
        {
          files: [...session.files.keys()].map((rel) => ({
            path: rel,
            size: session.files.get(rel).data.length,
          })),
        }
      );
      return;
    }

    if (req.method === "POST" && parts[3] === "load-example") {
      const body = await readJson(req);
      const theme = loadExampleInto(session, body.id);
      sendJson(res, 200, {
        ok: true,
        theme,
        files: [...session.files.keys()],
      });
      return;
    }

    if (req.method === "POST" && parts[3] === "import") {
      const zip = await readBody(req, BLOB_LIMIT);
      const entries = unpackZip(zip);
      session.files.clear();
      let theme = null;
      for (const e of entries) {
        const rel = stripZipRoot(e.name);
        if (!rel) continue;
        if (rel === "theme.json") {
          theme = JSON.parse(e.data.toString("utf8"));
          continue;
        }
        if (rel === "README.md") continue;
        session.files.set(rel, {
          data: e.data,
          mime: MIME[path.extname(rel).toLowerCase()] || "application/octet-stream",
        });
      }
      if (!theme) {
        sendJson(res, 400, { error: "zip has no theme.json" });
        return;
      }
      sendJson(res, 200, { ok: true, theme, files: [...session.files.keys()] });
      return;
    }

    if (req.method === "POST" && parts[3] === "validate") {
      const body = await readJson(req);
      const theme = body.theme;
      const result = validateThemeDocument(theme, {
        dirName: theme?.identity?.id,
        virtualFiles: virtualFilesFromSession(session),
      });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && parts[3] === "export") {
      const body = await readJson(req);
      const theme = body.theme;
      const result = validateThemeDocument(theme, {
        dirName: theme?.identity?.id,
        virtualFiles: virtualFilesFromSession(session),
      });
      if (!result.ok) {
        sendJson(res, 400, { error: "invalid theme", result });
        return;
      }
      const zip = packZip(collectExportEntries(theme, session));
      const id = theme.identity.id;
      send(res, 200, zip, {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${id}.zip"`,
      });
      return;
    }
  }

  sendJson(res, 404, { error: "not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${HOST}:${PORT}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }
    if (req.method !== "GET") {
      send(res, 405, "method not allowed");
      return;
    }
    serveCreator(req, res, url);
  } catch (e) {
    const status = e.code === "too-large" ? 413 : 500;
    if (!res.headersSent) sendJson(res, status, { error: e.message || String(e) });
  }
});

server.listen(PORT, HOST, () => {
  const href = `http://${HOST}:${PORT}/`;
  console.log(`Theme Creator  ${href}`);
  if (process.argv.includes("--open") || process.env.CREATOR_OPEN === "1") {
    const cmd =
      process.platform === "win32"
        ? `cmd /c start "" "${href}"`
        : process.platform === "darwin"
          ? `open "${href}"`
          : `xdg-open "${href}"`;
    exec(cmd);
  }
});
