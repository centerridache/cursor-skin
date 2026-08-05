#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "./ws-lite.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] || 9342);
const out = process.argv[3] || path.join(__dirname, "..", "docs", "layer-check.png");

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve(JSON.parse(body)));
    }).on("error", reject);
  });
}

class Cdp {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 1;
    this.pending = new Map();
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws.on("open", resolve);
      this.ws.on("error", reject);
      this.ws.on("message", (data) => {
        const msg = JSON.parse(String(data));
        if (msg.id != null && this.pending.has(msg.id)) {
          this.pending.get(msg.id)(msg);
          this.pending.delete(msg.id);
        }
      });
    });
  }
  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  close() {
    this.ws.close();
  }
}

const list = await fetchJson(`http://127.0.0.1:${port}/json/list`);
const t = list.find((x) => x.type === "page");
if (!t) throw new Error("no page");
const cdp = new Cdp(t.webSocketDebuggerUrl);
await cdp.connect();

const place = await cdp.send("Runtime.evaluate", {
  expression: `(() => {
    const root = document.getElementById('cursor-dream-skin-root');
    return {
      parent: root && root.parentElement && root.parentElement.tagName,
      beforeBody: !!(root && document.body && root.nextElementSibling === document.body),
      rootZ: root && getComputedStyle(root).zIndex,
      bodyZ: getComputedStyle(document.body).zIndex,
    };
  })()`,
  returnByValue: true,
});
console.log("stacking", JSON.stringify(place.result?.result?.value || place, null, 2));

await cdp.send("Page.enable");
const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
const b64 = shot.result?.data;
if (!b64) throw new Error("no screenshot data: " + JSON.stringify(shot).slice(0, 500));
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(b64, "base64"));
console.log("wrote", out);
cdp.close();
