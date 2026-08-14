/**
 * CDP Runtime.evaluate builders for drain / probe.
 * Short path must not embed renderer-inject.js. Fallback keeps payload eval.
 */

export const NEED_PAYLOAD = Object.freeze({ __cdsNeedPayload: true });

export function payloadVersionFromSource(payload) {
  const m = /const VERSION\s*=\s*(\d+)/.exec(String(payload || ""));
  return m ? Number(m[1]) : 0;
}

export function isNeedPayloadResult(value) {
  return !!(value && typeof value === "object" && value.__cdsNeedPayload === true);
}

export function drainNeedsFallback(value) {
  return !Array.isArray(value) || isNeedPayloadResult(value);
}

export function probeNeedsFallback(value) {
  if (value == null) return true;
  if (isNeedPayloadResult(value)) return true;
  if (typeof value !== "object") return true;
  return false;
}

/** Normal drain: call existing drainRequests(). No injectSource in the expression. */
export function buildShortDrainExpression(wantVersion) {
  const want = Number(wantVersion) || 0;
  return `(() => {
    try {
      const api = window.__cursorDreamSkin;
      const have = api && typeof api.version === "number" ? api.version : 0;
      if (!api || typeof api.drainRequests !== "function" || have !== ${want}) {
        return { __cdsNeedPayload: true };
      }
      return api.drainRequests();
    } catch (e) {
      return { __cdsNeedPayload: true };
    }
  })()`;
}

/** Normal probe: call existing probe(). No injectSource in the expression. */
export function buildShortProbeExpression(wantVersion) {
  const want = Number(wantVersion) || 0;
  return `(() => {
    try {
      const api = window.__cursorDreamSkin;
      const have = api && typeof api.version === "number" ? api.version : 0;
      if (!api || typeof api.probe !== "function" || have !== ${want}) {
        return { __cdsNeedPayload: true };
      }
      return api.probe();
    } catch (e) {
      return { __cdsNeedPayload: true };
    }
  })()`;
}

/** Version/API miss: eval payload then drainRequests(). Same semantics as the old combined drain expression. */
export function buildFallbackDrainExpression(payload) {
  return `(() => {
    try {
      const src = ${JSON.stringify(payload)};
      const verMatch = /const VERSION\\s*=\\s*(\\d+)/.exec(src);
      const want = verMatch ? Number(verMatch[1]) : 0;
      const have =
        window.__cursorDreamSkin && typeof window.__cursorDreamSkin.version === "number"
          ? window.__cursorDreamSkin.version
          : 0;
      if (!window.__cursorDreamSkin || typeof window.__cursorDreamSkin.drainRequests !== "function" || have !== want) {
        (0, eval)(src);
      }
      if (!window.__cursorDreamSkin || !window.__cursorDreamSkin.drainRequests) return [];
      return window.__cursorDreamSkin.drainRequests();
    } catch (e) {
      return [];
    }
  })()`;
}

/** API/version miss: eval payload then probe(). */
export function buildFallbackProbeExpression(payload) {
  return `(() => {
    try {
      const src = ${JSON.stringify(payload)};
      const verMatch = /const VERSION\\s*=\\s*(\\d+)/.exec(src);
      const want = verMatch ? Number(verMatch[1]) : 0;
      const have =
        window.__cursorDreamSkin && typeof window.__cursorDreamSkin.version === "number"
          ? window.__cursorDreamSkin.version
          : 0;
      if (!window.__cursorDreamSkin || typeof window.__cursorDreamSkin.probe !== "function" || have !== want) {
        (0, eval)(src);
      }
      return window.__cursorDreamSkin.probe();
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  })()`;
}

export async function runDrainEvaluate(evaluate, payload) {
  const want = payloadVersionFromSource(payload);
  let result;
  try {
    result = await evaluate(buildShortDrainExpression(want));
  } catch {
    result = NEED_PAYLOAD;
  }
  if (drainNeedsFallback(result)) {
    return evaluate(buildFallbackDrainExpression(payload));
  }
  return result;
}

export async function runProbeEvaluate(evaluate, payload) {
  const want = payloadVersionFromSource(payload);
  let result;
  try {
    result = await evaluate(buildShortProbeExpression(want));
  } catch {
    result = NEED_PAYLOAD;
  }
  if (probeNeedsFallback(result)) {
    return evaluate(buildFallbackProbeExpression(payload));
  }
  return result;
}
