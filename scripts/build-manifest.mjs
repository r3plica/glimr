// Scans public/galleries/* and writes src/data/manifest.json.
// For each gallery directory we additionally read:
// - urls.txt (optional): one URL per line, in the same index order the
//   downloader used (filenames are "<paddedIndex>-<safe>.<ext>"). We pair
//   each file to its source URL so the UI can fetch CDN variants.
// - meta.json (optional): title, description, tags, cover, imageTags.
// We also probe each image's dimensions with sharp (fast: header only).

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GALLERIES_DIR = path.join(ROOT, "public", "galleries");
const OUT_FILE = path.join(ROOT, "public", "manifest.json");

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg"]);

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(name) {
  return name
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function readMeta(dir) {
  try {
    const raw = await fs.readFile(path.join(dir, "meta.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function readUrlMap(dir) {
  // Returns Map<index1Based, url>
  try {
    const raw = await fs.readFile(path.join(dir, "urls.txt"), "utf8");
    const map = new Map();
    let i = 1;
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (t && /^https?:\/\//i.test(t)) map.set(i, t);
      i += 1;
    }
    return map;
  } catch {
    return new Map();
  }
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function orientationOf(w, h) {
  if (!w || !h) return "unknown";
  const r = w / h;
  if (r > 1.15) return "landscape";
  if (r < 0.87) return "portrait";
  return "square";
}

function sizeSegOf(url) {
  if (!url) return null;
  const m = url.match(/\/s(\d+)(?:-[^/]*)?\//);
  return m ? Number(m[1]) : null;
}

function sizeBucket(seg) {
  if (seg == null) return "unknown";
  if (seg >= 6000) return "large";
  if (seg >= 1500) return "medium";
  return "small";
}

async function probeDims(file) {
  try {
    const m = await sharp(file).metadata();
    return { width: m.width || 0, height: m.height || 0 };
  } catch {
    return { width: 0, height: 0 };
  }
}

async function hashFile(file) {
  try {
    const buf = await fs.readFile(file);
    return createHash("sha1").update(buf).digest("hex");
  } catch {
    return null;
  }
}

// Limit concurrency for sharp probes
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        out[i] = await fn(items[i], i);
      }
    })
  );
  return out;
}

async function processGallery(entryName) {
  const dir = path.join(GALLERIES_DIR, entryName);
  const meta = await readMeta(dir);
  const urlMap = await readUrlMap(dir);
  const all = await fs.readdir(dir);
  const files = all
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (files.length === 0) return null;

  console.log(`[manifest] ${entryName}: probing ${files.length} files...`);
  const dims = await mapLimit(files, 16, (f) => probeDims(path.join(dir, f)));
  const hashes = await mapLimit(files, 16, (f) => hashFile(path.join(dir, f)));

  const slug = meta.slug || slugify(entryName);
  const imageTags = meta.imageTags || {};
  const images = files.map((filename, i) => {
    const idxMatch = filename.match(/^(\d+)-/);
    const idx = idxMatch ? Number(idxMatch[1]) : null;
    const sourceUrl = idx != null ? urlMap.get(idx) || null : null;
    const seg = sizeSegOf(sourceUrl);
    const { width, height } = dims[i];
    return {
      src: `/galleries/${entryName}/${filename}`,
      filename,
      tags: imageTags[filename] || [],
      sourceUrl,
      width,
      height,
      orientation: orientationOf(width, height),
      sizeSeg: seg,
      sizeBucket: sizeBucket(seg),
      hash: hashes[i],
    };
  });

  return {
    slug,
    title: meta.title || titleCase(entryName),
    description: meta.description || "",
    tags: meta.tags || [],
    metaCover: meta.cover ? `/galleries/${entryName}/${meta.cover}` : null,
    images,
  };
}

async function main() {
  if (!(await exists(GALLERIES_DIR))) {
    await fs.mkdir(GALLERIES_DIR, { recursive: true });
  }
  const entries = await fs.readdir(GALLERIES_DIR, { withFileTypes: true });
  const galleries = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const g = await processGallery(entry.name);
    if (g) galleries.push(g);
  }
  galleries.sort((a, b) => a.title.localeCompare(b.title));

  // Auto-dedupe covers: prefer images whose hash is unique across all galleries.
  // Hashes that appear in 2+ galleries are "shared" (likely common headshots/
  // stock images) and skipped when picking a cover.
  const hashCounts = new Map();
  for (const g of galleries) {
    const seen = new Set();
    for (const img of g.images) {
      if (!img.hash || seen.has(img.hash)) continue;
      seen.add(img.hash);
      hashCounts.set(img.hash, (hashCounts.get(img.hash) || 0) + 1);
    }
  }
  const usedCoverHashes = new Set();
  for (const g of galleries) {
    if (g.metaCover) {
      g.cover = g.metaCover;
    } else {
      const unique = g.images.find(
        (img) => img.hash && hashCounts.get(img.hash) === 1 && !usedCoverHashes.has(img.hash)
      );
      const fallback = g.images.find(
        (img) => img.hash && !usedCoverHashes.has(img.hash)
      );
      const pick = unique || fallback || g.images[0];
      if (pick.hash) usedCoverHashes.add(pick.hash);
      g.cover = pick.src;
    }
    delete g.metaCover;
    for (const img of g.images) delete img.hash;
  }

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(
    OUT_FILE,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), galleries },
      null,
      2
    ) + "\n",
    "utf8"
  );
  const total = galleries.reduce((n, g) => n + g.images.length, 0);
  console.log(
    `[manifest] ${galleries.length} galleries, ${total} images -> ${path.relative(
      ROOT,
      OUT_FILE
    )}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
