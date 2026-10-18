// Pure helpers shared by the gallery preparation script and its unit tests.

export const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg"]);

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function resolveGallerySlugs(galleries, previous = [], aliases = {}) {
  const previousSlugs = new Map(previous.map((g) => [g.dir, g.slug]));
  const owners = new Map(previous.map((g) => [g.slug, g.dir]));
  for (const [slug, dir] of Object.entries(aliases)) {
    if (!owners.has(slug)) owners.set(slug, dir);
  }
  const result = new Map();
  const claim = (gallery, slug) => {
    if (typeof slug !== "string" || !slug || /[\\/]/.test(slug) || slug === "." || slug === "..") {
      throw new Error(`Gallery folder "${gallery.dir}" has an unusable slug "${slug}". Fix its meta.json slug.`);
    }
    const owner = owners.get(slug);
    if (owner !== undefined && owner !== gallery.dir) {
      throw new Error(
        `Slug collision "${slug}" between gallery folders "${owner}" and "${gallery.dir}". ` +
        "Give one of each pair a distinct meta.json slug."
      );
    }
    owners.set(slug, gallery.dir);
    result.set(gallery.dir, slug);
  };

  for (const gallery of galleries) {
    if (gallery.explicitSlug) claim(gallery, gallery.slug);
  }
  for (const gallery of galleries) {
    if (!result.has(gallery.dir) && previousSlugs.has(gallery.dir)) {
      claim(gallery, previousSlugs.get(gallery.dir));
    }
  }

  const pending = galleries.filter((g) => !result.has(g.dir)).sort((a, b) => {
    const exactA = a.dir === slugify(a.dir);
    const exactB = b.dir === slugify(b.dir);
    return Number(exactB) - Number(exactA) || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0);
  });
  // Reserve unsuffixed names before allocating suffixes, including real folders such as "yuno-2".
  for (const gallery of pending) {
    const base = slugify(gallery.dir) || "gallery";
    if (!owners.has(base)) claim(gallery, base);
  }
  for (const gallery of pending) {
    if (result.has(gallery.dir)) continue;
    const base = slugify(gallery.dir) || "gallery";
    let suffix = 2;
    while (owners.has(`${base}-${suffix}`)) suffix++;
    claim(gallery, `${base}-${suffix}`);
  }
  return result;
}

export function titleCase(name) {
  return name
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true });
}

export function orientationOf(w, h) {
  if (!w || !h) return "unknown";
  const r = w / h;
  if (r > 1.15) return "landscape";
  if (r < 0.87) return "portrait";
  return "square";
}

export function sizeBucketFromDims(w, h) {
  if (!w || !h) return "unknown";
  const mp = (w * h) / 1_000_000;
  if (mp >= 8) return "large";
  if (mp >= 2) return "medium";
  return "small";
}

export function sizeSegOf(url) {
  if (!url) return null;
  const m = url.match(/\/s(\d+)(?:-[^/]*)?\//);
  return m ? Number(m[1]) : null;
}

/**
 * Picks a cover per gallery, preferring an image whose content appears in no
 * other gallery and has not already been used as a cover.
 * Galleries carry `metaCover` (src or null) and `images` with `src` + `hash`.
 */
export function selectCovers(galleries) {
  const hashCounts = new Map();
  for (const g of galleries) {
    const seen = new Set();
    for (const img of g.images) {
      if (!img.hash || seen.has(img.hash)) continue;
      seen.add(img.hash);
      hashCounts.set(img.hash, (hashCounts.get(img.hash) || 0) + 1);
    }
  }
  const used = new Set();
  const covers = new Map();
  for (const g of galleries) {
    if (g.metaCover) {
      covers.set(g, g.metaCover);
      continue;
    }
    const pick =
      g.images.find((i) => i.hash && hashCounts.get(i.hash) === 1 && !used.has(i.hash)) ||
      g.images.find((i) => i.hash && !used.has(i.hash)) ||
      g.images[0];
    if (pick.hash) used.add(pick.hash);
    covers.set(g, pick.src);
  }
  return covers;
}
