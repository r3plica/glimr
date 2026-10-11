// Image probing shared by prepare-galleries.mjs and merge-duplicates.mjs.
// data/image-cache.json maps "<dir>/<filename>" to
// [size, mtimeMs, width, height, sha256] so unchanged files are not re-read.

import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";

const CACHE_VERSION = 1;

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw new Error(`Could not read ${file}: ${err.message}`);
  }
}

export async function writeJson(file, value, pretty = false) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, pretty ? 2 : 0) + "\n", "utf8");
}

export function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file)
      .on("error", reject)
      .on("data", (chunk) => h.update(chunk))
      .on("end", () => resolve(h.digest("hex")));
  });
}

export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const i = cursor++;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

export async function loadCache(file) {
  const raw = await readJson(file, null);
  if (!raw || raw.version !== CACHE_VERSION || typeof raw.entries !== "object") {
    return new Map();
  }
  return new Map(Object.entries(raw.entries));
}

export async function saveCache(file, cache) {
  await writeJson(file, { version: CACHE_VERSION, entries: Object.fromEntries(cache) });
}

export function createProbeStats() {
  return { hashed: 0, cached: 0, unreadable: [] };
}

/** Returns { width, height, hash }; hash is null when the file cannot be read. */
export async function probeImage(galleriesDir, dirName, filename, cache, stats) {
  const rel = `${dirName}/${filename}`;
  const file = path.join(galleriesDir, dirName, filename);
  let st;
  try {
    st = await fs.stat(file);
  } catch (err) {
    stats.unreadable.push({ file: rel, error: err.message });
    return { width: 0, height: 0, hash: null };
  }
  const hit = cache.get(rel);
  if (hit && hit[0] === st.size && hit[1] === st.mtimeMs) {
    stats.cached++;
    return { width: hit[2], height: hit[3], hash: hit[4] };
  }
  let width = 0;
  let height = 0;
  let hash = null;
  try {
    hash = await hashFile(file);
  } catch (err) {
    stats.unreadable.push({ file: rel, error: err.message });
  }
  try {
    const m = await sharp(file).metadata();
    width = m.width || 0;
    height = m.height || 0;
  } catch {
    // Unprobeable images keep 0x0 and fall into the "unknown" buckets.
  }
  stats.hashed++;
  if (hash) cache.set(rel, [st.size, st.mtimeMs, width, height, hash]);
  return { width, height, hash };
}
