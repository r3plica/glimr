// Pure planning helpers for `npm run galleries:duplicates` (merge-duplicates.mjs).
// Galleries that share enough images, or that the user marked as duplicates,
// are consolidated into one folder: the largest gallery is kept as the root,
// images it does not already contain are moved into it, and the remaining
// member folders (now holding only repeats) are quarantined.

import path from "node:path";
import { naturalCompare } from "./galleries.mjs";

export const DEFAULT_THRESHOLD = 0.1;
export const ALIASES_VERSION = 1;

export function emptyAliases() {
  return { version: ALIASES_VERSION, galleries: {}, images: {} };
}

/**
 * Pairwise overlap between galleries: shared unique images divided by the
 * unique image count of the larger gallery, so a pair only scores high when
 * the shared images are a large part of both galleries.
 *
 * @param {{ dir: string, hashes: (string | null)[] }[]} galleries
 * @returns {{ a: string, b: string, shared: number, overlap: number }[]} pairs at or above threshold
 */
export function overlappingPairs(galleries, threshold = DEFAULT_THRESHOLD) {
  const unique = galleries.map((g) => new Set(g.hashes.filter(Boolean)));
  const byHash = new Map();
  unique.forEach((set, i) => {
    for (const h of set) {
      const list = byHash.get(h);
      if (list) list.push(i);
      else byHash.set(h, [i]);
    }
  });
  const n = galleries.length;
  const shared = new Map();
  for (const list of byHash.values()) {
    for (let x = 0; x < list.length; x++) {
      for (let y = x + 1; y < list.length; y++) {
        const key = list[x] * n + list[y];
        shared.set(key, (shared.get(key) || 0) + 1);
      }
    }
  }
  const pairs = [];
  for (const [key, count] of shared) {
    const i = Math.floor(key / n);
    const j = key % n;
    const overlap = count / Math.max(unique[i].size, unique[j].size);
    if (overlap >= threshold) {
      pairs.push({ a: galleries[i].dir, b: galleries[j].dir, shared: count, overlap });
    }
  }
  return pairs.sort((p, q) => q.overlap - p.overlap || naturalCompare(p.a, q.a));
}

/** Connected components (size >= 2) of the given edges, each sorted naturally. */
export function connectedGroups(edges) {
  const parent = new Map();
  const find = (x) => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(x) !== r) {
      const next = parent.get(x);
      parent.set(x, r);
      x = next;
    }
    return r;
  };
  for (const [a, b] of edges) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const groups = new Map();
  for (const x of parent.keys()) {
    const r = find(x);
    const list = groups.get(r) ?? [];
    list.push(x);
    groups.set(r, list);
  }
  return [...groups.values()]
    .filter((g) => g.length >= 2)
    .map((g) => g.sort(naturalCompare))
    .sort((a, b) => naturalCompare(a[0], b[0]));
}

/** The member with the most images is kept; ties go to the first folder name. */
export function pickRoot(members) {
  return members.reduce((best, m) =>
    m.files.length > best.files.length ||
    (m.files.length === best.files.length && naturalCompare(m.dir, best.dir) < 0)
      ? m
      : best
  );
}

export function randomToken(length = 6) {
  const letters = "abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < length; i++) out += letters[Math.floor(Math.random() * letters.length)];
  return out;
}

/**
 * Plans moving one group's images into its root folder.
 *
 * @param {{ dir: string, files: { name: string, hash: string }[], entries: string[], hasUrls: boolean }} root
 *   `entries` lists every name already in the root folder (images and other files).
 * @param {{ dir: string, files: { name: string, hash: string }[] }[]} members non-root folders
 * @param {() => string} token random letters used to resolve name clashes
 */
export function planGroupMerge(root, members, token = randomToken) {
  const taken = new Set(root.entries.map((e) => e.toLowerCase()));
  const srcByHash = new Map();
  for (const f of root.files) if (!srcByHash.has(f.hash)) srcByHash.set(f.hash, f.name);

  const moves = [];
  const repeats = [];
  for (const m of [...members].sort((a, b) => naturalCompare(a.dir, b.dir))) {
    for (const f of [...m.files].sort((a, b) => naturalCompare(a.name, b.name))) {
      const existing = srcByHash.get(f.hash);
      if (existing) {
        repeats.push({ dir: m.dir, name: f.name, sameAs: existing });
        continue;
      }
      // A leading "<n>-" pairs a file with line n of the root's urls.txt.
      let target = root.hasUrls && /^\d+-/.test(f.name) ? `${token()}-${f.name}` : f.name;
      const ext = path.extname(f.name);
      const base = target.slice(0, target.length - ext.length);
      while (taken.has(target.toLowerCase())) target = `${base}-${token()}${ext}`;
      taken.add(target.toLowerCase());
      srcByHash.set(f.hash, target);
      moves.push({ dir: m.dir, name: f.name, target, hash: f.hash });
    }
  }
  return { root: root.dir, members: members.map((m) => m.dir), moves, repeats };
}

export function imageSrc(dir, name) {
  return `/galleries/${dir}/${name}`;
}

/**
 * Records an applied group merge: member slugs become aliases of the root
 * folder and every member image src maps to its new (or identical) root src.
 * Earlier entries that pointed at the merged folders are re-pointed so chains
 * of merges across runs always resolve in one step.
 */
export function recordMerge(aliases, plan, slugOfDir) {
  const galleries = { ...aliases.galleries };
  const images = { ...aliases.images };
  const memberSet = new Set(plan.members);

  for (const [slug, dir] of Object.entries(galleries)) {
    if (memberSet.has(dir)) galleries[slug] = plan.root;
  }
  for (const dir of plan.members) galleries[slugOfDir(dir)] = plan.root;
  delete galleries[slugOfDir(plan.root)];

  const moved = new Map();
  for (const mv of plan.moves) moved.set(imageSrc(mv.dir, mv.name), imageSrc(plan.root, mv.target));
  for (const r of plan.repeats) moved.set(imageSrc(r.dir, r.name), imageSrc(plan.root, r.sameAs));

  for (const [from, to] of Object.entries(images)) {
    if (moved.has(to)) images[from] = moved.get(to);
  }
  for (const [from, to] of moved) images[from] = to;
  for (const to of moved.values()) delete images[to];

  return { version: ALIASES_VERSION, galleries, images };
}

/**
 * Resolves marked duplicate sets to folders. Sets naming galleries in two or
 * more folders become merge groups; single-gallery sets wait for a match.
 *
 * @param {{ sets: { id: string, slugs: string[] }[] }} marks
 * @param {Map<string, string>} dirOfSlug live and alias slugs to folder
 */
export function resolveMarkedGroups(marks, dirOfSlug) {
  const groups = [];
  const unresolved = [];
  for (const set of marks.sets) {
    const dirs = [];
    for (const slug of set.slugs) {
      const dir = dirOfSlug.get(slug);
      if (!dir) unresolved.push({ setId: set.id, slug });
      else if (!dirs.includes(dir)) dirs.push(dir);
    }
    if (dirs.length >= 2) groups.push({ setId: set.id, dirs });
  }
  return { groups, unresolved };
}

/**
 * Marks after a merge run. A set is done, and removed, once at least two of
 * its galleries resolve and all of them now live in one folder. Slugs of
 * folders merged into a root are replaced with the root's slug, so a
 * single-gallery set keeps waiting under the gallery's new name.
 *
 * @param {Map<string, string>} rootOfDir merged folder to the root it moved into
 */
export function remainingMarks(marks, rootOfDir, dirOfSlug, slugOfDir) {
  const finalDir = (slug) => {
    const dir = dirOfSlug.get(slug);
    return dir ? rootOfDir.get(dir) ?? dir : undefined;
  };
  return {
    version: marks.version,
    sets: marks.sets
      .filter((s) => {
        const dirs = s.slugs.map(finalDir).filter(Boolean);
        return !(dirs.length >= 2 && new Set(dirs).size === 1);
      })
      .map((s) => ({
        ...s,
        slugs: s.slugs.map((slug) => {
          const root = rootOfDir.get(dirOfSlug.get(slug));
          return root ? slugOfDir(root) : slug;
        }),
      })),
  };
}
