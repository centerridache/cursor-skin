#!/usr/bin/env node
/**
 * CLI: validate Theme Contract packs.
 *
 *   node scripts/theme-validate.mjs themes/cyber-night
 *   node scripts/theme-validate.mjs themes
 *   npm run theme:validate -- themes/cyber-night
 *   npm run theme:validate -- themes --allow-legacy
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverThemeDirs,
  formatValidationReport,
  validateThemeDir,
} from "../theme/validator/validate.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = { targets: [], allowLegacy: false, quiet: false };
  for (const a of argv) {
    if (a === "--allow-legacy") args.allowLegacy = true;
    else if (a === "--quiet" || a === "-q") args.quiet = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else if (a.startsWith("-")) {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    } else args.targets.push(a);
  }
  return args;
}

function usage() {
  console.log(`Cursor Skin Theme Validator

Usage:
  node scripts/theme-validate.mjs <theme-dir|themes-parent> [...]
  npm run theme:validate -- <path>

Options:
  --allow-legacy   Soft-check legacy flat packs (warn instead of fail format)
  --quiet, -q      Only print failures / summary
  -h, --help       Show help

Examples:
  npm run theme:validate -- themes/cyber-night
  npm run theme:validate -- themes
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const targets = args.targets.length ? args.targets : [path.join(ROOT, "themes")];
  const dirs = [];
  for (const t of targets) {
    const abs = path.isAbsolute(t) ? t : path.resolve(process.cwd(), t);
    const found = discoverThemeDirs(abs);
    if (!found.length) {
      console.error(`No theme.json under: ${abs}`);
      process.exit(2);
    }
    dirs.push(...found);
  }

  const unique = [...new Set(dirs.map((d) => path.resolve(d)))];
  let failed = 0;
  let warned = 0;

  for (const dir of unique) {
    const result = validateThemeDir(dir, { allowLegacy: args.allowLegacy });
    if (!result.ok) failed += 1;
    if (result.warnings?.length) warned += 1;

    if (args.quiet) {
      if (!result.ok) {
        console.log(formatValidationReport(result));
        console.log("");
      }
    } else {
      console.log(formatValidationReport(result));
      if (unique.length > 1) console.log("\n---\n");
    }
  }

  if (unique.length > 1 || args.quiet) {
    const okCount = unique.length - failed;
    console.log(
      `Summary: ${okCount}/${unique.length} valid` +
        (warned ? `, ${warned} with warnings` : "") +
        (failed ? `, ${failed} invalid` : "")
    );
  }

  process.exit(failed ? 1 : 0);
}

main();
