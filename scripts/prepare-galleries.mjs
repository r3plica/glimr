// Offline gallery preparation. Run with `npm run galleries:prepare`.
//
// Scans public/galleries/*, probes image dimensions and SHA-256 hashes every
// image (cached in data/image-cache.json so unchanged files are not re-read)
// and writes:
//   public/manifest.json                 lightweight catalogue (no image lists)
//   public/data/galleries/<slug>.json    full image details per gallery
//   public/data/search-index.json        filenames + tags for global search
//   public/data/moved-images.json        old image src -> new src after merges
//   data/prepare-report.json             aliases, problems
//
// Galleries merged by `npm run galleries:duplicates -- --apply` are listed in
// data/folder-aliases.json; their old slugs become aliases of the folder they
// were merged into so old URLs keep working. Source files are never modified.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  IMAGE_EXT,
  naturalCompare,
  orientationOf,
  selectCovers,
  sizeBucketFromDims,
  sizeSegOf,
  slugify,
  titleCase,
} from "./lib/galleries.mjs";
import {
  createProbeStats,
  loadCache,
  mapLimit,
  probeImage,
  readJson,
  saveCache,
  writeJson,
} from "./lib/image-cache.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GALLERIES_DIR = path.join(ROOT, "public", "galleries");
const MANIFEST_FILE = path.join(ROOT, "public", "manifest.json");
const PUBLIC_DATA_DIR = path.join(ROOT, "public", "data");
const DETAIL_DIR = path.join(PUBLIC_DATA_DIR, "galleries");
const SEARCH_FILE = path.join(PUBLIC_DATA_DIR, "search-index.json");
const MOVED_IMAGES_FILE = path.join(PUBLIC_DATA_DIR, "moved-images.json");
const DATA_DIR = path.join(ROOT, "data");
const ALIASES_FILE = path.join(DATA_DIR, "folder-aliases.json");
const CACHE_FILE = path.join(DATA_DIR, "image-cache.json");
const REPORT_FILE = path.join(DATA_DIR, "prepare-report.json");

const FORMAT_VERSION = 2;
const CONCURRENCY = 16;

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

async function loadFolderAliases() {
  const raw = await readJson(ALIASES_FILE, null);
  if (!raw) return { galleries: {}, images: {} };
  if (raw.version !== 1 || typeof raw.galleries !== "object" || typeof raw.images !== "object") {
    throw new Error(
      `${path.relative(ROOT, ALIASES_FILE)} is not a version 1 folder aliases file. ` +
        "It is written by `npm run galleries:duplicates -- --apply`."
    );
  }
  return raw;
}

const stats = createProbeStats();

async function scanGallery(dirName, cache) {
  const dir = path.join(GALLERIES_DIR, dirName);
  const files = (await fs.readdir(dir))
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort(naturalCompare);
  if (files.length === 0) return null;

  const meta = await readJson(path.join(dir, "meta.json"), {}).catch(() => ({}));
  const urlMap = await readUrlMap(dir);
  const probes = await mapLimit(files, CONCURRENCY, (f) => probeImage(GALLERIES_DIR, dirName, f, cache, stats));
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
  const folderAliases = await loadFolderAliases();
  const cache = await loadCache(CACHE_FILE);

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
    if (stats.hashed > 0 && (i + 1) % 200 === 0) await saveCache(CACHE_FILE, cache);
  }
  await saveCache(CACHE_FILE, cache);

  const byDir = new Map(scanned.map((g) => [g.dir, g]));
  const liveSlugs = new Set(scanned.map((g) => g.slug));
  const canonical = scanned;
  const aliasesByDir = new Map();
  const staleAliases = [];
  for (const [slug, dir] of Object.entries(folderAliases.galleries)) {
    // A live gallery always owns its slug; an alias to a missing folder is stale.
    if (liveSlugs.has(slug)) continue;
    if (!byDir.has(dir)) {
      staleAliases.push({ slug, dir });
      continue;
    }
    const list = aliasesByDir.get(dir) ?? [];
    list.push(slug);
    aliasesByDir.set(dir, list);
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
  await writeJson(MOVED_IMAGES_FILE, { formatVersion: FORMAT_VERSION, images: folderAliases.images });
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
      aliases: Object.fromEntries(aliasesByDir),
      staleAliases,
      unreadableImages: stats.unreadable,
    },
    true
  );

  const aliasCount = [...aliasesByDir.values()].reduce((n, list) => n + list.length, 0);
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `[prepare] ${canonical.length} galleries (${aliasCount} merged gallery aliases, ` +
      `${staleAliases.length} stale) in ${seconds}s`
  );
  if (stats.unreadable.length > 0) {
    console.warn(`[prepare] ${stats.unreadable.length} unreadable images; see ${path.relative(ROOT, REPORT_FILE)}`);
  }
}

main().catch((err) => {
  console.error(`[prepare] ${err.message}`);
  process.exit(1);
});
