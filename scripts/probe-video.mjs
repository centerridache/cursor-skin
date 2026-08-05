import http from "node:http";
import { WebSocket } from "./ws-lite.mjs";

const list = await new Promise((resolve, reject) => {
  http.get("http://127.0.0.1:9342/json/list", (res) => {
    let b = "";
    res.on("data", (c) => (b += c));
    res.on("end", () => {
      try {
        resolve(JSON.parse(b));
      } catch (e) {
        reject(e);
      }
    });
  }).on("error", reject);
});

const page = list.find((t) => /workbench/i.test(t.url || "") && t.type === "page");
if (!page) {
  console.log("no page");
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => {
  ws.on("open", r);
  ws.on("error", j);
});

let id = 0;
const pending = new Map();
ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.id && pending.has(m.id)) pending.get(m.id)(m);
});

function send(method, params = {}) {
  const i = ++id;
  return new Promise((resolve) => {
    pending.set(i, resolve);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
}

await send("Runtime.enable");
const expr = `(() => {
  const v = document.querySelector("#cursor-dream-skin-root .cds-video");
  const html = document.documentElement;
  const key = document.getElementById("cursor-dream-skin-root")?.getAttribute("data-cds-media-key") || "";
  return {
    skin: html.getAttribute("data-cursor-dream-skin"),
    still: html.getAttribute("data-cds-still"),
    videoAttr: html.getAttribute("data-cds-video"),
    mediaKey: key.slice(0, 100),
    src: v ? String(v.currentSrc || v.src || "").slice(0, 160) : null,
    paused: v && v.paused,
    ended: v && v.ended,
    readyState: v && v.readyState,
    networkState: v && v.networkState,
    err: v && v.error ? { code: v.error.code, message: v.error.message } : null,
    videoWidth: v && v.videoWidth,
    label: window.__cursorDreamSkin && window.__cursorDreamSkin._wallpaperLabel,
  };
})()`;

const r = await send("Runtime.evaluate", {
  expression: expr,
  returnByValue: true,
});
console.log(JSON.stringify(r.result?.result?.value || r.result || r, null, 2));
ws.close();
process.exit(0);
