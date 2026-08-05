/**
 * Loopback-only media server for Dream Skin video wallpapers.
 * Serves a single validated file at /media?token=… with Range support.
 */
import http from "node:http";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

export function createMediaServer() {
  let server = null;
  let token = "";
  let filePath = "";
  let mime = "video/mp4";
  let port = 0;

  function close() {
    if (server) {
      try {
        server.close();
      } catch {
        /* ignore */
      }
      server = null;
    }
    token = "";
    filePath = "";
    port = 0;
  }

  function url() {
    if (!server || !port || !token) return "";
    return `http://127.0.0.1:${port}/media?token=${encodeURIComponent(token)}`;
  }

  function servingPath() {
    return filePath || "";
  }

  function start(absPath, contentType) {
    const resolved = path.resolve(absPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`media file missing: ${resolved}`);
    }
    const nextMime = contentType || "video/mp4";
    // Reuse the same loopback URL/token when the file is unchanged — avoids killing in-flight video.
    if (server && port && token && filePath === resolved && mime === nextMime) {
      return Promise.resolve({ url: url(), port, token, reused: true });
    }
    close();
    filePath = resolved;
    mime = nextMime;
    token = crypto.randomBytes(16).toString("hex");

    server = http.createServer((req, res) => {
      try {
        const host = String(req.headers.host || "");
        if (!/^127\.0\.0\.1(?::\d+)?$/.test(host) && host !== "localhost" && !host.startsWith("localhost:")) {
          res.writeHead(403);
          res.end("forbidden host");
          return;
        }
        const u = new URL(req.url || "/", `http://127.0.0.1`);
        if (u.pathname !== "/media") {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        if (u.searchParams.get("token") !== token) {
          res.writeHead(403);
          res.end("forbidden");
          return;
        }
        if (!fs.existsSync(filePath)) {
          res.writeHead(404);
          res.end("gone");
          return;
        }
        const st = fs.statSync(filePath);
        const size = st.size;
        const range = req.headers.range;

        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Type", mime);
        // Allow the renderer to keep a long-lived Range stream without revalidating every chunk.
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Expose-Headers", "Content-Range, Accept-Ranges, Content-Length");

        if (req.method === "OPTIONS") {
          res.writeHead(204);
          res.end();
          return;
        }
        if (req.method === "HEAD") {
          res.writeHead(200, { "Content-Length": size });
          res.end();
          return;
        }
        if (req.method !== "GET") {
          res.writeHead(405);
          res.end();
          return;
        }

        if (range) {
          const m = /^bytes=(\d*)-(\d*)$/.exec(range);
          if (!m) {
            res.writeHead(416, { "Content-Range": `bytes */${size}` });
            res.end();
            return;
          }
          let start = m[1] === "" ? 0 : Number(m[1]);
          let end = m[2] === "" ? size - 1 : Number(m[2]);
          if (
            !Number.isFinite(start) ||
            !Number.isFinite(end) ||
            start < 0 ||
            end >= size ||
            start > end
          ) {
            res.writeHead(416, { "Content-Range": `bytes */${size}` });
            res.end();
            return;
          }
          res.writeHead(206, {
            "Content-Range": `bytes ${start}-${end}/${size}`,
            "Content-Length": end - start + 1,
          });
          fs.createReadStream(filePath, { start, end }).pipe(res);
          return;
        }

        res.writeHead(200, { "Content-Length": size });
        fs.createReadStream(filePath).pipe(res);
      } catch (e) {
        try {
          res.writeHead(500);
          res.end(String(e.message || e));
        } catch {
          /* ignore */
        }
      }
    });

    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        port = server.address().port;
        resolve({ url: url(), port, token });
      });
    });
  }

  return { start, close, url, servingPath, get port() { return port; } };
}
