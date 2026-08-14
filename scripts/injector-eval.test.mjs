/**
 * ⑤-3-1: drain/probe short CDP expressions must not embed renderer-inject.js.
 * Run: npm run test:injector
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { test } from "node:test";
import {
  payloadVersionFromSource,
  buildShortDrainExpression,
  buildShortProbeExpression,
  buildFallbackDrainExpression,
  buildFallbackProbeExpression,
  drainNeedsFallback,
  probeNeedsFallback,
  runDrainEvaluate,
  runProbeEvaluate,
} from "./injector-eval.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const injectSource = fs.readFileSync(
  path.join(__dirname, "..", "assets", "renderer-inject.js"),
  "utf8"
);

const VER = payloadVersionFromSource(injectSource);

const PAYLOAD_MARKERS = [
  "function cursorDreamSkinPayload",
  "ensureToolPaneWatch",
  "hasUntaggedTarget",
  "tagAdapterRegions",
  "HTMLMediaElement.prototype.pause",
];

function assertNoPayload(expression, label) {
  assert.ok(expression.length < 2500, `${label} should be a short expression, got ${expression.length} bytes`);
  for (const mark of PAYLOAD_MARKERS) {
    assert.equal(expression.includes(mark), false, `${label} must not contain ${mark}`);
  }
  assert.equal(expression.includes(injectSource.slice(0, 80)), false, `${label} must not contain injectSource prefix`);
}

function runInWindow(expression, api) {
  const sandbox = { window: { __cursorDreamSkin: api } };
  return vm.runInNewContext(expression, sandbox, { timeout: 1000 });
}

test("payloadVersionFromSource reads renderer VERSION", () => {
  assert.ok(Number.isInteger(VER) && VER > 0);
  assert.equal(VER, Number(/const VERSION\s*=\s*(\d+)/.exec(injectSource)[1]));
});

test("A. short drain expression does not embed renderer-inject.js", () => {
  const expr = buildShortDrainExpression(VER);
  assertNoPayload(expr, "short drain");
  assert.match(expr, /drainRequests/);
  assert.match(expr, /__cursorDreamSkin/);
});

test("B. short probe expression does not embed renderer-inject.js", () => {
  const expr = buildShortProbeExpression(VER);
  assertNoPayload(expr, "short probe");
  assert.match(expr, /\.probe\s*\(/);
  assert.match(expr, /__cursorDreamSkin/);
});

test("C. fallback drain/probe expressions still contain payload", () => {
  const drain = buildFallbackDrainExpression(injectSource);
  const probe = buildFallbackProbeExpression(injectSource);
  assert.ok(drain.length > 80000, `fallback drain too small: ${drain.length}`);
  assert.ok(probe.length > 80000, `fallback probe too small: ${probe.length}`);
  for (const mark of PAYLOAD_MARKERS) {
    assert.equal(drain.includes(mark), true, `fallback drain missing ${mark}`);
    assert.equal(probe.includes(mark), true, `fallback probe missing ${mark}`);
  }
  assert.equal(drain.includes(JSON.stringify(injectSource)), true);
  assert.equal(probe.includes(JSON.stringify(injectSource)), true);
});

test("D. drain short path calls drainRequests when version matches", () => {
  let calls = 0;
  const api = {
    version: VER,
    drainRequests() {
      calls += 1;
      return [{ type: "palette", paletteId: "slate-glow" }];
    },
  };
  const out = runInWindow(buildShortDrainExpression(VER), api);
  assert.equal(calls, 1);
  assert.deepEqual(out, [{ type: "palette", paletteId: "slate-glow" }]);
  assert.equal(drainNeedsFallback(out), false);
});

test("D. drain short path asks for payload when API missing or version mismatches", () => {
  const missing = runInWindow(buildShortDrainExpression(VER), undefined);
  assert.equal(missing.__cdsNeedPayload, true);
  assert.equal(drainNeedsFallback(missing), true);

  const stale = runInWindow(buildShortDrainExpression(VER), {
    version: VER - 1,
    drainRequests() {
      throw new Error("must not run");
    },
  });
  assert.equal(stale.__cdsNeedPayload, true);

  const noFn = runInWindow(buildShortDrainExpression(VER), { version: VER });
  assert.equal(noFn.__cdsNeedPayload, true);
});

test("D. probe short path calls probe when version matches", () => {
  const api = {
    version: VER,
    probe() {
      return { skinActive: true, rootPresent: true, hudPresent: true, browser: false };
    },
  };
  const out = runInWindow(buildShortProbeExpression(VER), api);
  assert.equal(out.skinActive, true);
  assert.equal(out.rootPresent, true);
  assert.equal(probeNeedsFallback(out), false);
});

test("D. probe short path asks for payload when API missing or version mismatches", () => {
  const missing = runInWindow(buildShortProbeExpression(VER), undefined);
  assert.equal(probeNeedsFallback(missing), true);
  const stale = runInWindow(buildShortProbeExpression(VER), {
    version: VER - 1,
    probe() {
      throw new Error("must not run");
    },
  });
  assert.equal(stale.__cdsNeedPayload, true);
});

test("D. runDrainEvaluate uses short path only when API is current", async () => {
  const exprs = [];
  const api = {
    version: VER,
    drainRequests() {
      return [];
    },
  };
  const result = await runDrainEvaluate((expression) => {
    exprs.push(expression);
    return runInWindow(expression, api);
  }, injectSource);
  assert.equal(exprs.length, 1);
  assertNoPayload(exprs[0], "runDrainEvaluate short");
  assert.deepEqual(result, []);
});

test("D. runDrainEvaluate falls back to payload eval when version mismatches", async () => {
  const exprs = [];
  const fakePayload = `window.__cursorDreamSkin = {
    version: 62,
    drainRequests: function () { return [{ type: "theme", themeId: "Cursor Dark" }]; }
  };`;
  const result = await runDrainEvaluate((expression) => {
    exprs.push(expression);
    if (exprs.length === 1) {
      return { __cdsNeedPayload: true };
    }
    const sandbox = { window: {} };
    return vm.runInNewContext(expression, sandbox, { timeout: 1000 });
  }, fakePayload);
  assert.equal(exprs.length, 2);
  assert.equal(exprs[1].includes(JSON.stringify(fakePayload)), true);
  assert.equal(JSON.stringify(result), JSON.stringify([{ type: "theme", themeId: "Cursor Dark" }]));
});

test("D. runProbeEvaluate falls back when short evaluate throws", async () => {
  const fakePayload = `window.__cursorDreamSkin = {
    version: 62,
    probe: function () { return { skinActive: true, rootPresent: true, hudPresent: false }; }
  };`;
  const exprs = [];
  const result = await runProbeEvaluate((expression) => {
    exprs.push(expression);
    if (exprs.length === 1) throw new Error("cdp timeout");
    const sandbox = { window: {} };
    return vm.runInNewContext(expression, sandbox, { timeout: 1000 });
  }, fakePayload);
  assert.equal(exprs.length, 2);
  assert.equal(result.skinActive, true);
  assert.equal(result.hudPresent, false);
});

test("D. fallback drain still returns [] when drainRequests is missing after eval", async () => {
  const fakePayload = `window.__cursorDreamSkin = { version: 62 };`;
  const result = await runDrainEvaluate(async (expression) => {
    if (!expression.includes("const src")) {
      return { __cdsNeedPayload: true };
    }
    const sandbox = { window: {} };
    return vm.runInNewContext(expression, sandbox, { timeout: 1000 });
  }, fakePayload);
  assert.equal(JSON.stringify(result), "[]");
});
