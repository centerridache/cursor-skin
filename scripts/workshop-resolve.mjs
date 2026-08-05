/**
 * Resolve Wallpaper Engine workshop folders / project.json / media files.
 */
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const VIDEO_EXTS = new Set([".mp4", ".webm"]);
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function listFiles(dir) {
  try {
    return fs.readdirSync(dir).map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

function firstExisting(paths) {
  for (const p of paths) {
    if (p && fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

function findByExt(dir, exts) {
  const files = listFiles(dir).filter((f) => {
    try {
      return fs.statSync(f).isFile() && exts.has(path.extname(f).toLowerCase());
    } catch {
      return false;
    }
  });
  files.sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
  return files[0] || null;
}

async function extractScenePkg(repkgExe, scenePkg, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  await execFileAsync(
    repkgExe,
    ["extract", "-t", "-s", "--overwrite", "-o", outDir, scenePkg],
    { windowsHide: true, maxBuffer: 16 * 1024 * 1024 }
  );
  // Prefer large converted images; skip tiny masks / particles when possible
  const all = [];
  function walk(d) {
    for (const name of fs.readdirSync(d)) {
      const full = path.join(d, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) walk(full);
      else if (IMAGE_EXTS.has(path.extname(name).toLowerCase())) {
        all.push({ full, size: st.size, name });
      }
    }
  }
  walk(outDir);
  all.sort((a, b) => b.size - a.size);
  // Prefer names that look like main art
  const preferred = all.find((x) =>
    /texture|landscape|background|bg|main|scene/i.test(x.name)
  );
  const pick = preferred && preferred.size >= 200 * 1024 ? preferred : all[0];
  if (!pick) throw new Error("RePKG produced no images");
  return pick.full;
}

/**
 * @returns {{ mediaPath: string, label: string, note?: string, weType?: string }}
 */
export async function resolveWallpaperInput(inputPath, { root, stateDir, repkgExe }) {
  const resolved = path.resolve(String(inputPath || "").trim().replace(/^["']|["']$/g, ""));
  if (!fs.existsSync(resolved)) {
    throw new Error(`path not found: ${resolved}`);
  }

  let dir = resolved;
  let directFile = null;
  const st = fs.statSync(resolved);
  if (st.isFile()) {
    const base = path.basename(resolved).toLowerCase();
    if (base === "project.json") {
      dir = path.dirname(resolved);
    } else if (base === "scene.pkg") {
      dir = path.dirname(resolved);
    } else {
      directFile = resolved;
    }
  }

  if (directFile) {
    return {
      mediaPath: directFile,
      label: path.basename(directFile),
      weType: VIDEO_EXTS.has(path.extname(directFile).toLowerCase())
        ? "video-file"
        : "image-file",
    };
  }

  const projectPath = path.join(dir, "project.json");
  let project = null;
  if (fs.existsSync(projectPath)) {
    try {
      project = JSON.parse(fs.readFileSync(projectPath, "utf8"));
    } catch {
      project = null;
    }
  }

  const weType = String(project?.type || "").toLowerCase();
  const title = project?.title || path.basename(dir);

  if (weType === "video" || (!weType && findByExt(dir, VIDEO_EXTS))) {
    const fromJson = project?.file ? path.join(dir, project.file) : null;
    const media =
      firstExisting([fromJson]) ||
      findByExt(dir, VIDEO_EXTS) ||
      findByExt(dir, IMAGE_EXTS);
    if (!media) throw new Error("WE video project has no mp4/webm/image");
    return {
      mediaPath: media,
      label: path.basename(media),
      note: title,
      weType: "video",
    };
  }

  if (weType === "scene" || fs.existsSync(path.join(dir, "scene.pkg"))) {
    const scenePkg = path.join(dir, "scene.pkg");
    const id = path.basename(dir);
    if (repkgExe && fs.existsSync(repkgExe) && fs.existsSync(scenePkg)) {
      const outDir = path.join(stateDir || path.join(root, ".we-cache"), "we-extract", id);
      const extracted = await extractScenePkg(repkgExe, scenePkg, outDir);
      return {
        mediaPath: extracted,
        label: `${path.basename(extracted)} (from WE scene)`,
        note: title,
        weType: "scene",
      };
    }
    const preview = firstExisting([
      path.join(dir, "preview.jpg"),
      path.join(dir, "preview.jpeg"),
      path.join(dir, "preview.png"),
      path.join(dir, "preview.gif"),
      project?.preview ? path.join(dir, project.preview) : null,
    ]);
    if (preview) {
      return {
        mediaPath: preview,
        label: `${path.basename(preview)} (preview only)`,
        note: "Scene package needs tools/RePKG.exe for full art",
        weType: "scene-preview",
      };
    }
    throw new Error("WE scene has no scene.pkg/preview and RePKG missing");
  }

  const any =
    findByExt(dir, VIDEO_EXTS) ||
    findByExt(dir, IMAGE_EXTS);
  if (!any) throw new Error("no wallpaper media in folder");
  return { mediaPath: any, label: path.basename(any), weType: "folder" };
}

export function findRepkgExe(root) {
  const candidates = [
    path.join(root, "tools", "RePKG.exe"),
    path.join(root, "tools", "repkg.exe"),
  ];
  return candidates.find((p) => fs.existsSync(p)) || "";
}
