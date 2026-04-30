// Scans public/galleries/* and writes src/data/manifest.json.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GALLERIES_DIR = path.join(ROOT, "public", "galleries");
const OUT_FILE = path.join(ROOT, "src", "data", "manifest.json");

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

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(GALLERIES_DIR))) {
    await fs.mkdir(GALLERIES_DIR, { recursive: true });
  }
  const entries = await fs.readdir(GALLERIES_DIR, { withFileTypes: true });
  const galleries = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(GALLERIES_DIR, entry.name);
    const meta = await readMeta(dir);
    const files = (await fs.readdir(dir))
      .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (files.length === 0) continue;

    const slug = meta.slug || slugify(entry.name);
    const imageTags = meta.imageTags || {};
    const images = files.map((filename) => ({
      src: `/galleries/${entry.name}/${filename}`,
      filename,
      tags: imageTags[filename] || [],
    }));

    galleries.push({
      slug,
      title: meta.title || titleCase(entry.name),
      description: meta.description || "",
      tags: meta.tags || [],
      cover: meta.cover
        ? `/galleries/${entry.name}/${meta.cover}`
        : images[0].src,
      images,
    });
  }

  galleries.sort((a, b) => a.title.localeCompare(b.title));

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
