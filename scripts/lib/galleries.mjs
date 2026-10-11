// Pure helpers shared by the gallery preparation script and its unit tests.

import { createHash } from "node:crypto";

export const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif", ".svg"]);

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

// Order-independent fingerprint of a gallery's contents that also respects
// how many times each image appears. Null when any image could not be hashed,
// because an unreadable file means the contents cannot be proven identical.
export function contentSignature(hashes) {
  if (hashes.length === 0 || hashes.some((h) => !h)) return null;
  return createHash("sha256").update(hashes.slice().sort().join("\n")).digest("hex");
}

/**
 * Verifies candidate duplicate groups (from find-duplicates.ps1) against full
 * content signatures. Only folders whose entire contents match are merged.
 *
 * @param {{ root: string, duplicates: string[] }[]} groups
 * @param {Map<string, string | null>} signatureByDir signature per existing gallery folder
 */
export function verifyDuplicateGroups(groups, signatureByDir) {
  const aliasOf = new Map();
  const merges = [];
  const rejected = [];
  const missing = [];

  for (const group of groups) {
    const members = [];
    for (const dir of [group.root, ...group.duplicates]) {
      if (members.includes(dir) || aliasOf.has(dir)) continue;
      if (!signatureByDir.has(dir)) {
        missing.push({ dir, candidateRoot: group.root });
        continue;
      }
      members.push(dir);
    }

    const bySignature = new Map();
    for (const dir of members) {
      const sig = signatureByDir.get(dir);
      if (!sig) {
        rejected.push({ dir, candidateRoot: group.root, reason: "unreadable images" });
        continue;
      }
      const list = bySignature.get(sig) ?? [];
      list.push(dir);
      bySignature.set(sig, list);
    }

    for (const dirs of bySignature.values()) {
      if (dirs.length < 2) {
        rejected.push({ dir: dirs[0], candidateRoot: group.root, reason: "contents differ" });
        continue;
      }
      const [canonical, ...aliases] = dirs;
      for (const a of aliases) aliasOf.set(a, canonical);
      merges.push({ canonical, aliases });
    }
  }

  return { aliasOf, merges, rejected, missing };
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
