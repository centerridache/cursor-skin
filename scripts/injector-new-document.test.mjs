/**
 * ⑤-3-2: at most one Page.addScriptToEvaluateOnNewDocument per CDP target.
 * Run: npm run test:injector
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  createNewDocumentRegistry,
  parseNewDocumentIdentifier,
  replaceNewDocumentOnSession,
  shouldRegisterNewDocument,
} from "./injector-new-document.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const injectorSrc = fs.readFileSync(path.join(__dirname, "injector.mjs"), "utf8");

function mockSession(log, opts = {}) {
  let n = 0;
  return {
    async send(method, params = {}) {
      log.push({ method, params });
      if (method === "Page.removeScriptToEvaluateOnNewDocument") {
        if (opts.removeFail) throw new Error("remove failed");
        return {};
      }
      if (method === "Page.addScriptToEvaluateOnNewDocument") {
        if (opts.addFail) throw new Error("add failed");
        if (opts.addEmpty) return {};
        n += 1;
        return { identifier: String(n) };
      }
      throw new Error("unexpected " + method);
    },
  };
}

test("parseNewDocumentIdentifier reads CDP result.identifier", () => {
  assert.equal(parseNewDocumentIdentifier({ identifier: "abc" }), "abc");
  assert.equal(parseNewDocumentIdentifier("xyz"), "xyz");
  assert.equal(parseNewDocumentIdentifier({}), "");
  assert.equal(parseNewDocumentIdentifier(null), "");
});

test("shouldRegisterNewDocument only for apply", () => {
  assert.equal(shouldRegisterNewDocument("apply"), true);
  assert.equal(shouldRegisterNewDocument(undefined), true);
  assert.equal(shouldRegisterNewDocument("drain"), false);
  assert.equal(shouldRegisterNewDocument("verify"), false);
  assert.equal(shouldRegisterNewDocument("remove"), false);
});

test("1. first apply adds once and saves identifier", async () => {
  const reg = createNewDocumentRegistry();
  const log = [];
  const id = await replaceNewDocumentOnSession(reg, mockSession(log), "T1", "script-a");
  assert.equal(id, "1");
  assert.equal(reg.identifierOf("T1"), "1");
  assert.equal(log.length, 1);
  assert.equal(log[0].method, "Page.addScriptToEvaluateOnNewDocument");
  assert.equal(log[0].params.source, "script-a");
});

test("2. second apply removes first identifier then adds second", async () => {
  const reg = createNewDocumentRegistry();
  const log = [];
  const session = mockSession(log);
  await replaceNewDocumentOnSession(reg, session, "T1", "script-a");
  await replaceNewDocumentOnSession(reg, session, "T1", "script-b");
  assert.equal(reg.identifierOf("T1"), "2");
  assert.deepEqual(
    log.map((x) => x.method),
    [
      "Page.addScriptToEvaluateOnNewDocument",
      "Page.removeScriptToEvaluateOnNewDocument",
      "Page.addScriptToEvaluateOnNewDocument",
    ]
  );
  assert.equal(log[1].params.identifier, "1");
  assert.equal(log[2].params.source, "script-b");
});

test("3. remove failure does not crash and still adds", async () => {
  const reg = createNewDocumentRegistry();
  await replaceNewDocumentOnSession(reg, mockSession([]), "T1", "a");
  const log = [];
  const id = await replaceNewDocumentOnSession(reg, mockSession(log, { removeFail: true }), "T1", "b");
  assert.equal(id, "1");
  assert.equal(reg.identifierOf("T1"), "1");
  assert.equal(log[0].method, "Page.removeScriptToEvaluateOnNewDocument");
  assert.equal(log[1].method, "Page.addScriptToEvaluateOnNewDocument");
});

test("4. add failure does not save an identifier", async () => {
  const reg = createNewDocumentRegistry();
  await replaceNewDocumentOnSession(reg, mockSession([]), "T1", "a");
  assert.equal(reg.identifierOf("T1"), "1");
  await assert.rejects(
    () => replaceNewDocumentOnSession(reg, mockSession([], { addFail: true }), "T1", "b"),
    /add failed/
  );
  assert.equal(reg.identifierOf("T1"), "");
  const emptyLog = [];
  const id = await replaceNewDocumentOnSession(reg, mockSession(emptyLog, { addEmpty: true }), "T2", "c");
  assert.equal(id, "");
  assert.equal(reg.identifierOf("T2"), "");
});

test("5. target cleanup deletes that target only", async () => {
  const reg = createNewDocumentRegistry();
  const s = mockSession([]);
  await replaceNewDocumentOnSession(reg, s, "T1", "a");
  await replaceNewDocumentOnSession(reg, s, "T2", "b");
  assert.equal(reg.size(), 2);
  reg.forget("T1");
  assert.equal(reg.identifierOf("T1"), "");
  assert.equal(reg.identifierOf("T2"), "2");
  reg.forgetMissing(["T2"]);
  assert.equal(reg.identifierOf("T2"), "2");
  assert.equal(reg.size(), 1);
});

test("6. ten applies leave one active identifier", async () => {
  const reg = createNewDocumentRegistry();
  const log = [];
  const session = mockSession(log);
  for (let i = 0; i < 10; i++) {
    await replaceNewDocumentOnSession(reg, session, "T1", "script-" + i);
  }
  assert.equal(reg.identifierOf("T1"), "10");
  assert.equal(reg.size(), 1);
  const adds = log.filter((x) => x.method === "Page.addScriptToEvaluateOnNewDocument");
  const removes = log.filter((x) => x.method === "Page.removeScriptToEvaluateOnNewDocument");
  assert.equal(adds.length, 10);
  assert.equal(removes.length, 9);
  assert.equal(removes[0].params.identifier, "1");
  assert.equal(removes[8].params.identifier, "9");
});

test("identifiers never leak across targets", async () => {
  const reg = createNewDocumentRegistry();
  const s = mockSession([]);
  await replaceNewDocumentOnSession(reg, s, "A", "a");
  await replaceNewDocumentOnSession(reg, s, "B", "b");
  await replaceNewDocumentOnSession(reg, s, "A", "a2");
  assert.equal(reg.identifierOf("A"), "3");
  assert.equal(reg.identifierOf("B"), "2");
});

test("7. appearanceAll does not register NewDocument", () => {
  const start = injectorSrc.indexOf("async function appearanceAll");
  const end = injectorSrc.indexOf("\nasync function main", start);
  assert.ok(start >= 0 && end > start);
  const body = injectorSrc.slice(start, end);
  assert.equal(body.includes('send("Page.addScriptToEvaluateOnNewDocument"'), false);
  assert.equal(body.includes("replaceNewDocumentOnSession"), false);
});

test("8. drain / verify return before NewDocument registration", () => {
  const start = injectorSrc.indexOf("async function injectTarget");
  const end = injectorSrc.indexOf("\nfunction writeState", start);
  const body = injectorSrc.slice(start, end);
  const verifyIdx = body.indexOf('mode === "verify"');
  const drainIdx = body.indexOf('mode === "drain"');
  const regIdx = body.indexOf("replaceNewDocumentOnSession");
  assert.ok(verifyIdx >= 0 && drainIdx >= 0 && regIdx > drainIdx && regIdx > verifyIdx);
  assert.equal(shouldRegisterNewDocument("drain"), false);
  assert.equal(shouldRegisterNewDocument("verify"), false);
});
