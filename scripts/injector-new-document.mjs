/**
 * One NewDocument script registration per CDP target.
 * Identifier map is process-local; Chromium still holds the script until remove or target death.
 */

export function parseNewDocumentIdentifier(result) {
  if (!result) return "";
  if (typeof result === "string" && result) return result;
  if (typeof result.identifier === "string" && result.identifier) return result.identifier;
  return "";
}

export function shouldRegisterNewDocument(mode) {
  return mode === "apply" || mode == null || mode === "";
}

export function createNewDocumentRegistry() {
  const ids = new Map();

  function identifierOf(targetId) {
    if (!targetId) return "";
    return ids.get(targetId) || "";
  }

  function forget(targetId) {
    if (!targetId) return;
    ids.delete(targetId);
  }

  function forgetMissing(liveIds) {
    const live = new Set(liveIds || []);
    for (const id of [...ids.keys()]) {
      if (!live.has(id)) ids.delete(id);
    }
  }

  function size() {
    return ids.size;
  }

  /**
   * Replace the target's NewDocument script. Never leaves a stale identifier
   * after a failed add. remove() errors are swallowed; add() errors propagate
   * after clearing the map entry.
   */
  async function replace(targetId, source, hooks) {
    if (!targetId) {
      throw new Error("new-document: missing targetId");
    }
    const add = hooks && hooks.add;
    const remove = hooks && hooks.remove;
    if (typeof add !== "function") {
      throw new Error("new-document: add hook required");
    }
    const prev = ids.get(targetId) || "";
    if (prev && typeof remove === "function") {
      try {
        await remove(prev);
      } catch {
        /* keep going — still try to add a current script */
      }
    }
    ids.delete(targetId);
    const result = await add(source);
    const identifier = parseNewDocumentIdentifier(result);
    if (!identifier) return "";
    ids.set(targetId, identifier);
    return identifier;
  }

  return {
    identifierOf,
    forget,
    forgetMissing,
    replace,
    size,
  };
}

export async function replaceNewDocumentOnSession(registry, session, targetId, source) {
  return registry.replace(targetId, source, {
    add: (src) => session.send("Page.addScriptToEvaluateOnNewDocument", { source: src }),
    remove: (identifier) =>
      session.send("Page.removeScriptToEvaluateOnNewDocument", { identifier }),
  });
}
