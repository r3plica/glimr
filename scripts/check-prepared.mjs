// Runs before `npm run dev`. Cheap check that gallery data has been prepared:
// no image is read here. Fails with instructions when data is missing or in
// an old format, and warns when gallery folders changed since the last run.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_FILE = path.join(ROOT, "public", "manifest.json");
const GALLERIES_DIR = path.join(ROOT, "public", "galleries");
const ALIASES_FILE = path.join(ROOT, "data", "folder-aliases.json");
const HOWTO =
  "Run `npm run galleries:prepare` to prepare gallery data (optionally `npm run galleries:duplicates -- --apply` first to merge duplicates).";

async function main() {
  let manifestStat;
  let manifest;
  try {
    manifestStat = await fs.stat(MANIFEST_FILE);
    manifest = JSON.parse(await fs.readFile(MANIFEST_FILE, "utf8"));
  } catch {
    console.error(`[check] public/manifest.json is missing or unreadable. ${HOWTO}`);
    process.exit(1);
  }
  if (manifest?.formatVersion !== 2) {
    console.error(`[check] public/manifest.json is in an old format. ${HOWTO}`);
    process.exit(1);
  }

  const preparedAt = manifestStat.mtimeMs;
  let changed = 0;
  try {
    const entries = await fs.readdir(GALLERIES_DIR, { withFileTypes: true });
    const stats = await Promise.all(
      entries.filter((e) => e.isDirectory()).map((e) => fs.stat(path.join(GALLERIES_DIR, e.name)))
    );
    changed = stats.filter((s) => s.mtimeMs > preparedAt).length;
  } catch {
    // No galleries folder: the home page renders its empty state.
  }
  if (changed > 0) {
    console.warn(
      `[check] ${changed} gallery folder(s) changed since gallery data was prepared. ${HOWTO}`
    );
  }
  try {
    if ((await fs.stat(ALIASES_FILE)).mtimeMs > preparedAt) {
      console.warn("[check] Galleries were merged since gallery data was prepared. Run `npm run galleries:prepare`.");
    }
  } catch {
    // No galleries have been merged.
  }
}

main();
