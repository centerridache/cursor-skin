#!/usr/bin/env node
/**
 * Probe Cursor workbench DOM over CDP and print selector hits.
 * Usage: node scripts/probe-dom.mjs --port 9342
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "./ws-lite.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  let port = 9342;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--port" && argv[i + 1]) {
      port = Number(argv[++i]);
    }
  }
  return { port };
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

class CdpSession {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws.on("open", resolve);
      this.ws.on("error", reject);
      this.ws.on("message", (data) => {
        const msg = JSON.parse(String(data));
        if (msg.id != null && this.pending.has(msg.id)) {
          const { resolve: res, reject: rej } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) rej(new Error(JSON.stringify(msg.error)));
          else res(msg.result);
        }
      });
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`timeout ${method}`));
        }
      }, 10000);
    });
  }
  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "evaluate failed");
    }
    return result?.result?.value;
  }
  close() {
    this.ws.close();
  }
}

const SELECTORS = [
  ".monaco-workbench",
  "body.monaco-workbench",
  ".part.sidebar",
  ".part.auxiliarybar",
  ".part.activitybar",
  ".part.editor",
  ".part.editorgroupcontainer",
  ".part.titlebar",
  ".part.statusbar",
  ".part.panel",
  ".composer-bar",
  '[class*="composer"]',
  ".aichat-pane",
  ".monaco-inputbox",
  ".workspaces-container",
  ".workspace-container",
  '[class*="glass-"]',
  'html[data-cursor-dream-skin="1"]',
  "#cursor-dream-skin-root",
  "#cursor-dream-skin-css",
];

async function main() {
  const { port } = parseArgs(process.argv);
  const list = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  const pages = (list || []).filter(
    (t) => t.type === "page" && String(t.url || "").toLowerCase().includes("workbench")
  );
  console.log(`Port ${port}: ${pages.length} workbench page(s)`);
  const injectPath = path.join(__dirname, "..", "assets", "renderer-inject.js");
  const injectSource = fs.readFileSync(injectPath, "utf8");

  for (const t of pages) {
    console.log("\n---");
    console.log(`id: ${t.id}`);
    console.log(`title: ${t.title}`);
    console.log(`url: ${t.url}`);
    const session = new CdpSession(t.webSocketDebuggerUrl);
    await session.connect();
    try {
      const hits = await session.evaluate(`(() => {
        const sels = ${JSON.stringify(SELECTORS)};
        const out = {};
        for (const s of sels) {
          try { out[s] = !!document.querySelector(s); } catch { out[s] = false; }
        }
        return {
          title: document.title,
          bodyClasses: document.body ? document.body.className : "",
          hits: out
        };
      })()`);
      console.log("bodyClasses:", hits.bodyClasses);
      for (const [sel, ok] of Object.entries(hits.hits)) {
        console.log(`  ${ok ? "HIT " : "miss"}  ${sel}`);
      }
      // Also run tool probe
      const probe = await session.evaluate(`(() => {
        const src = ${JSON.stringify(injectSource)};
        (0, eval)(src);
        return window.__cursorDreamSkin.probe();
      })()`);
      console.log("probe:", JSON.stringify(probe, null, 2));
    } finally {
      session.close();
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
