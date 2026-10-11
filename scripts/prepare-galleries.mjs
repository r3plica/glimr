// Offline gallery preparation. Run with `npm run galleries:prepare`.
//
// Scans public/galleries/*, probes image dimensions and SHA-256 hashes every
// image (cached in data/image-cache.json so unchanged files are not re-read),
// verifies the candidate duplicate groups produced by
// `npm run galleries:duplicates` (data/duplicates.json) and writes:
//   public/manifest.json                 lightweight catalogue (no image lists)
//   public/data/galleries/<slug>.json    full image details per gallery
//   public/data/search-index.json        filenames + tags for global search
//   data/prepare-report.json             merges, rejected candidates, problems
//
// A candidate folder is merged into its group's canonical gallery only when its
// full contents (every image hash, including repeats) match. Source folders and
// files are never modified.

import { promises as fs, createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  IMAGE_EXT,
  contentSignature,
  naturalCompare,
  orientationOf,
  selectCovers,
  sizeBucketFromDims,
  sizeSegOf,
  slugify,
  titleCase,
  verifyDuplicateGroups,
} from "./lib/galleries.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GALLERIES_DIR = path.join(ROOT, "public", "galleries");
const MANIFEST_FILE = path.join(ROOT, "public", "manifest.json");
const PUBLIC_DATA_DIR = path.join(ROOT, "public", "data");
const DETAIL_DIR = path.join(PUBLIC_DATA_DIR, "galleries");
const SEARCH_FILE = path.join(PUBLIC_DATA_DIR, "search-index.json");
const DATA_DIR = path.join(ROOT, "data");
const DUPLICATES_FILE = path.join(DATA_DIR, "duplicates.json");
const CACHE_FILE = path.join(DATA_DIR, "image-cache.json");
const REPORT_FILE = path.join(DATA_DIR, "prepare-report.json");

const FORMAT_VERSION = 2;
const CACHE_VERSION = 1;
const CONCURRENCY = 16;

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw new Error(`Could not read ${path.relative(ROOT, file)}: ${err.message}`);
  }
}

async function writeJson(file, value, pretty = false) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, pretty ? 2 : 0) + "\n", "utf8");
}

async function readUrlMap(dir) {
  // Map<index1Based, url>, paired to filenames "<paddedIndex>-<safe>.<ext>".
  try {
    const raw = await fs.readFile(path.join(dir, "urls.txt"), "utf8");
    const map = new Map();
    raw.split(/\r?\n/).forEach((line, i) => {
      const t = line.trim();
      if (t && /^https?:\/\//i.test(t)) map.set(i + 1, t);
    });
    return map;
  } catch {
    return new Map();
  }
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file)
      .on("error", reject)
      .on("data", (chunk) => h.update(chunk))
      .on("end", () => resolve(h.digest("hex")));
  });
}

async function mapLimit(items, limit, fn) {
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

async function loadCache() {
  const raw = await readJson(CACHE_FILE, null);
  if (!raw || raw.version !== CACHE_VERSION || typeof raw.entries !== "object") {
    return new Map();
  }
  return new Map(Object.entries(raw.entries));
}

async function saveCache(cache) {
  await writeJson(CACHE_FILE, { version: CACHE_VERSION, entries: Object.fromEntries(cache) });
}

async function loadDuplicateGroups() {
  const raw = await readJson(DUPLICATES_FILE, null);
  if (!raw) {
    console.warn(
      `[prepare] ${path.relative(ROOT, DUPLICATES_FILE)} not found; no galleries will be merged. ` +
        "Run `npm run galleries:duplicates` first to detect duplicates."
    );
    return [];
  }
  const valid =
    raw.version === 1 &&
    Array.isArray(raw.groups) &&
    raw.groups.every(
      (g) =>
        g &&
        typeof g.root === "string" &&
        Array.isArray(g.duplicates) &&
        g.duplicates.every((d) => typeof d === "string")
    );
  if (!valid) {
    throw new Error(
      `${path.relative(ROOT, DUPLICATES_FILE)} is not a version 1 duplicates file. ` +
        "Re-run `npm run galleries:duplicates`."
    );
  }
  return raw.groups;
}

const stats = { hashed: 0, cached: 0, unreadable: [] };

async function probeImage(dirName, filename, cache) {
  const rel = `${dirName}/${filename}`;
  const file = path.join(GALLERIES_DIR, dirName, filename);
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

async function scanGallery(dirName, cache) {
  const dir = path.join(GALLERIES_DIR, dirName);
  const files = (await fs.readdir(dir))
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort(naturalCompare);
  if (files.length === 0) return null;

  const meta = await readJson(path.join(dir, "meta.json"), {}).catch(() => ({}));
  const urlMap = await readUrlMap(dir);
  const probes = await mapLimit(files, CONCURRENCY, (f) => probeImage(dirName, f, cache));
  const imageTags = meta.imageTags || {};

  const images = files.map((filename, i) => {
    const idxMatch = filename.match(/^(\d+)-/);
    const sourceUrl = idxMatch ? urlMap.get(Number(idxMatch[1])) || null : null;
    const { width, height, hash } = probes[i];
    return {
      src: `/galleries/${dirName}/${filename}`,
      filename,
      tags: imageTags[filename] || [],
      sourceUrl,
      width,
      height,
      orientation: orientationOf(width, height),
      sizeSeg: sizeSegOf(sourceUrl),
      sizeBucket: sizeBucketFromDims(width, height),
      hash,
    };
  });

  return {
    dir: dirName,
    slug: meta.slug || slugify(dirName),
    title: meta.title || titleCase(dirName),
    description: meta.description || "",
    tags: meta.tags || [],
    metaCover: meta.cover ? `/galleries/${dirName}/${meta.cover}` : null,
    images,
  };
}

function withoutHash(img) {
  const out = { ...img };
  delete out.hash;
  return out;
}

function assertSafeSlug(slug, dir) {
  if (!slug || /[\\/]/.test(slug) || slug === "." || slug === "..") {
    throw new Error(`Gallery folder "${dir}" has an unusable slug "${slug}". Fix its meta.json slug.`);
  }
}

async function main() {
  const started = Date.now();
  await fs.mkdir(GALLERIES_DIR, { recursive: true });
  const groups = await loadDuplicateGroups();
  const cache = await loadCache();

  const dirs = (await fs.readdir(GALLERIES_DIR, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(naturalCompare);

  const scanned = [];
  for (let i = 0; i < dirs.length; i++) {
    const g = await scanGallery(dirs[i], cache);
    if (g) scanned.push(g);
    if ((i + 1) % 100 === 0 || i === dirs.length - 1) {
      console.log(
        `[prepare] ${i + 1}/${dirs.length} folders (${stats.hashed} images probed, ${stats.cached} from cache)`
      );
    }
    // Persist progress periodically so an interrupted first run is not wasted.
    if (stats.hashed > 0 && (i + 1) % 200 === 0) await saveCache(cache);
  }
  await saveCache(cache);

  const byDir = new Map(scanned.map((g) => [g.dir, g]));
  const signatureByDir = new Map(
    scanned.map((g) => [g.dir, contentSignature(g.images.map((img) => img.hash))])
  );
  const { aliasOf, merges, rejected, missing } = verifyDuplicateGroups(groups, signatureByDir);

  const canonical = scanned.filter((g) => !aliasOf.has(g.dir));
  const aliasesByDir = new Map();
  for (const [aliasDir, rootDir] of aliasOf) {
    const list = aliasesByDir.get(rootDir) ?? [];
    list.push(byDir.get(aliasDir).slug);
    aliasesByDir.set(rootDir, list);
  }

  canonical.sort((a, b) => a.title.localeCompare(b.title));
  const covers = selectCovers(canonical);

  const slugOwners = new Map();
  const slugCollisions = [];
  for (const g of canonical) {
    assertSafeSlug(g.slug, g.dir);
    for (const s of [g.slug, ...(aliasesByDir.get(g.dir) ?? [])]) {
      if (slugOwners.has(s)) slugCollisions.push({ slug: s, dirs: [slugOwners.get(s), g.dir] });
      else slugOwners.set(s, g.dir);
    }
  }
  if (slugCollisions.length > 0) {
    throw new Error(
      `Slug collisions between gallery folders: ${JSON.stringify(slugCollisions)}. ` +
        "Give one of each pair a distinct meta.json slug."
    );
  }

  await fs.rm(DETAIL_DIR, { recursive: true, force: true });
  await fs.mkdir(DETAIL_DIR, { recursive: true });

  const summaries = [];
  const searchGalleries = [];
  await mapLimit(canonical, CONCURRENCY, async (g) => {
    const detail = {
      slug: g.slug,
      title: g.title,
      description: g.description,
      tags: g.tags,
      cover: covers.get(g),
      aliases: aliasesByDir.get(g.dir) ?? [],
      images: g.images.map(withoutHash),
    };
    await writeJson(path.join(DETAIL_DIR, `${g.slug}.json`), detail);
  });
  for (const g of canonical) {
    summaries.push({
      slug: g.slug,
      title: g.title,
      description: g.description,
      tags: g.tags,
      cover: covers.get(g),
      imageCount: g.images.length,
      aliases: aliasesByDir.get(g.dir) ?? [],
    });
    searchGalleries.push({
      slug: g.slug,
      dir: g.dir,
      images: g.images.map((img) =>
        img.tags.length > 0 ? { filename: img.filename, tags: img.tags } : { filename: img.filename }
      ),
    });
  }

  const generatedAt = new Date().toISOString();
  await writeJson(SEARCH_FILE, { formatVersion: FORMAT_VERSION, galleries: searchGalleries });
  await writeJson(MANIFEST_FILE, { formatVersion: FORMAT_VERSION, generatedAt, galleries: summaries });
  await writeJson(
    REPORT_FILE,
    {
      generatedAt,
      galleryFolders: scanned.length,
      galleries: canonical.length,
      images: canonical.reduce((n, g) => n + g.images.length, 0),
      imagesProbed: stats.hashed,
      imagesFromCache: stats.cached,
      merges: merges.map((m) => ({ canonical: m.canonical, aliases: m.aliases })),
      rejectedCandidates: rejected,
      missingCandidateFolders: missing,
      unreadableImages: stats.unreadable,
    },
    true
  );

  const merged = merges.reduce((n, m) => n + m.aliases.length, 0);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `[prepare] ${canonical.length} galleries (${merged} duplicate folders merged, ` +
      `${rejected.length} candidates rejected, ${missing.length} missing) in ${seconds}s`
  );
  if (stats.unreadable.length > 0) {
    console.warn(`[prepare] ${stats.unreadable.length} unreadable images; see ${path.relative(ROOT, REPORT_FILE)}`);
  }
}

main().catch((err) => {
  console.error(`[prepare] ${err.message}`);
  process.exit(1);
});
