// Consolidates duplicate galleries. Run with `npm run galleries:duplicates`
// to preview, and `npm run galleries:duplicates -- --apply` to merge.
//
// Groups galleries that share at least --threshold (default 10%) of their
// unique images (shared / unique images of the larger gallery), plus every
// set of 2+ galleries marked as duplicates in the UI (data/duplicate-marks.json).
// For each group the largest folder is kept; images it lacks are moved into
// it (a random suffix resolves name clashes) and the other folders, holding
// only repeated images and non-image files, are moved to
// data/merged-originals/<timestamp>/. Old gallery slugs and image paths are
// recorded in data/folder-aliases.json so `npm run galleries:prepare` keeps old
// URLs and favourites working.
//
// Writes data/merge-plan.json on every run. Afterwards run
// `npm run galleries:prepare`.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { IMAGE_EXT, naturalCompare, resolveGallerySlugs, slugify } from "./lib/galleries.mjs";
import {
  createProbeStats,
  loadCache,
  mapLimit,
  probeImage,
  readJson,
  saveCache,
  writeJson,
} from "./lib/image-cache.mjs";
import { readMarks, writeMarks } from "./lib/duplicate-marks.mjs";
import {
  ALIASES_VERSION,
  DEFAULT_THRESHOLD,
  connectedGroups,
  emptyAliases,
  overlappingPairs,
  pickRoot,
  planGroupMerge,
  recordMerge,
  remainingMarks,
  resolveMarkedGroups,
} from "./lib/merge.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONCURRENCY = 16;

function parseArgs(argv) {
  const opts = {
    apply: false,
    threshold: DEFAULT_THRESHOLD,
    galleries: path.join(ROOT, "public", "galleries"),
    data: path.join(ROOT, "data"),
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--apply") opts.apply = true;
    else if (arg === "--threshold") opts.threshold = Number(argv[++i]);
    else if (arg === "--galleries") opts.galleries = path.resolve(argv[++i]);
    else if (arg === "--data") opts.data = path.resolve(argv[++i]);
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (!(opts.threshold > 0 && opts.threshold <= 1)) {
    throw new Error("--threshold must be a number above 0 and at most 1 (e.g. 0.1 for 10%).");
  }
  return opts;
}

async function loadAliases(file) {
  const raw = await readJson(file, null);
  if (!raw) return emptyAliases();
  if (raw.version !== ALIASES_VERSION || typeof raw.galleries !== "object" || typeof raw.images !== "object") {
    throw new Error(`${file} is not a version ${ALIASES_VERSION} folder aliases file.`);
  }
  return raw;
}

async function scanFolders(galleriesDir, cache, stats) {
  const dirs = (await fs.readdir(galleriesDir, { withFileTypes: true }))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(naturalCompare);
  const folders = [];
  for (let i = 0; i < dirs.length; i++) {
    const dir = dirs[i];
    const entries = await fs.readdir(path.join(galleriesDir, dir));
    const names = entries.filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase())).sort(naturalCompare);
    const probes = await mapLimit(names, CONCURRENCY, (f) => probeImage(galleriesDir, dir, f, cache, stats));
    const meta = await readJson(path.join(galleriesDir, dir, "meta.json"), {}).catch(() => ({}));
    folders.push({
      dir,
      slug: meta.slug || slugify(dir),
      explicitSlug: Boolean(meta.slug),
      entries,
      hasUrls: entries.some((e) => e.toLowerCase() === "urls.txt"),
      files: names.map((name, j) => ({ name, hash: probes[j].hash })),
    });
    if ((i + 1) % 200 === 0 || i === dirs.length - 1) {
      console.log(`[duplicates] ${i + 1}/${dirs.length} folders (${stats.hashed} hashed, ${stats.cached} cached)`);
    }
  }
  return folders;
}

async function moveDir(from, to) {
  await fs.mkdir(path.dirname(to), { recursive: true });
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      if (err.code === "EXDEV") {
        await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false });
        await fs.rm(from, { recursive: true });
        return;
      }
      // Windows cannot move a folder while a file in it is open (for example
      // an image the dev server is still serving).
      if (!["EPERM", "EBUSY", "EACCES"].includes(err.code)) throw err;
      if (attempt >= 5) {
        throw new Error(
          `${err.message}. A file in this folder is open in another program; stop \`npm run dev\` ` +
            "(and close any viewers) then re-run the command. Completed merges are kept."
        );
      }
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cacheFile = path.join(opts.data, "image-cache.json");
  const aliasesFile = path.join(opts.data, "folder-aliases.json");
  const marksFile = path.join(opts.data, "duplicate-marks.json");
  const planFile = path.join(opts.data, "merge-plan.json");

  const cache = await loadCache(cacheFile);
  const stats = createProbeStats();
  const folders = await scanFolders(opts.galleries, cache, stats);
  await saveCache(cacheFile, cache);

  let aliases = await loadAliases(aliasesFile);
  const previous = await readJson(path.join(opts.galleries, "..", "data", "search-index.json"), { galleries: [] });
  const slugs = resolveGallerySlugs(folders.filter((f) => f.files.length > 0), previous.galleries, aliases.galleries);
  for (const folder of folders) {
    if (slugs.has(folder.dir)) folder.slug = slugs.get(folder.dir);
  }
  const byDir = new Map(folders.map((f) => [f.dir, f]));
  const slugOfDir = (dir) => byDir.get(dir)?.slug ?? slugify(dir);
  const dirOfSlug = new Map();
  for (const [slug, dir] of Object.entries(aliases.galleries)) if (byDir.has(dir)) dirOfSlug.set(slug, dir);
  for (const f of folders) dirOfSlug.set(f.slug, f.dir);

  const pairs = overlappingPairs(
    folders.map((f) => ({ dir: f.dir, hashes: f.files.map((x) => x.hash) })),
    opts.threshold
  );
  const marks = await readMarks(marksFile);
  const marked = resolveMarkedGroups(marks, dirOfSlug);
  const edges = pairs.map((p) => [p.a, p.b]);
  for (const g of marked.groups) for (let i = 1; i < g.dirs.length; i++) edges.push([g.dirs[0], g.dirs[i]]);
  const markedDirs = new Set(marked.groups.flatMap((g) => g.dirs));

  const plans = [];
  const skipped = [];
  for (const dirs of connectedGroups(edges)) {
    const members = dirs.map((d) => byDir.get(d));
    const unreadable = members.flatMap((m) => m.files.filter((f) => !f.hash).map((f) => `${m.dir}/${f.name}`));
    if (unreadable.length > 0) {
      skipped.push({ dirs, reason: "unreadable images", files: unreadable });
      continue;
    }
    const root = pickRoot(members);
    const plan = planGroupMerge(root, members.filter((m) => m !== root));
    plans.push({
      ...plan,
      galleries: members.map((m) => ({
        dir: m.dir,
        images: m.files.length,
        marked: markedDirs.has(m.dir),
        bestOverlap: Math.max(
          0,
          ...pairs.filter((p) => p.a === m.dir || p.b === m.dir).map((p) => Math.round(p.overlap * 1000) / 1000)
        ),
      })),
    });
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    applied: opts.apply,
    threshold: opts.threshold,
    groups: plans.length,
    foldersMerged: plans.reduce((n, p) => n + p.members.length, 0),
    imagesMoved: plans.reduce((n, p) => n + p.moves.length, 0),
    repeatedImages: plans.reduce((n, p) => n + p.repeats.length, 0),
    skippedGroups: skipped,
    unresolvedMarks: marked.unresolved,
    unreadableImages: stats.unreadable,
    plans,
  };
  await writeJson(planFile, summary, true);

  for (const p of plans) {
    const others = p.galleries.filter((g) => g.dir !== p.root);
    console.log(
      `[duplicates] keep ${p.root} (${byDir.get(p.root).files.length} images) <- ` +
        others.map((g) => `${g.dir}${g.marked ? " [marked]" : ""}`).join(", ") +
        ` | ${p.moves.length} moved, ${p.repeats.length} repeats`
    );
  }
  for (const s of skipped) console.warn(`[duplicates] skipped ${s.dirs.join(", ")}: ${s.reason}`);
  for (const u of marked.unresolved) console.warn(`[duplicates] marked gallery ${u.slug} not found`);
  console.log(
    `[duplicates] ${summary.groups} groups, ${summary.foldersMerged} folders to merge, ` +
      `${summary.imagesMoved} images to move, ${summary.repeatedImages} repeats. Plan: ${path.relative(ROOT, planFile)}`
  );

  if (!opts.apply) {
    if (plans.length > 0) console.log("[duplicates] Preview only. Re-run with -- --apply to merge.");
    return;
  }

  const quarantine = path.join(opts.data, "merged-originals", summary.generatedAt.replace(/[:.]/g, "-"));
  const rootOfDir = new Map();
  for (const p of plans) {
    for (const mv of p.moves) {
      let target = mv.target;
      const ext = path.extname(target);
      while (await exists(path.join(opts.galleries, p.root, target))) {
        target = `${target.slice(0, target.length - ext.length)}-${Math.random().toString(36).slice(2, 6)}${ext}`;
      }
      mv.target = target;
      await fs.rename(path.join(opts.galleries, mv.dir, mv.name), path.join(opts.galleries, p.root, target));
      const hit = cache.get(`${mv.dir}/${mv.name}`);
      cache.delete(`${mv.dir}/${mv.name}`);
      if (hit) cache.set(`${p.root}/${target}`, hit);
    }
    // Recorded before quarantining so moved images stay mapped even if a
    // folder cannot be moved; a re-run then merges the leftover folder again.
    aliases = recordMerge(aliases, p, slugOfDir);
    await writeJson(aliasesFile, aliases, true);
    await saveCache(cacheFile, cache);
    for (const dir of p.members) {
      for (const f of byDir.get(dir).files) cache.delete(`${dir}/${f.name}`);
      await moveDir(path.join(opts.galleries, dir), path.join(quarantine, dir));
      rootOfDir.set(dir, p.root);
    }
    console.log(`[duplicates] merged into ${p.root}: ${p.members.join(", ")}`);
  }
  await saveCache(cacheFile, cache);

  // Re-read marks so sets added in the UI while merging are kept.
  const latest = await readMarks(marksFile);
  await writeMarks(marksFile, remainingMarks(latest, rootOfDir, dirOfSlug, slugOfDir));
  await writeJson(planFile, summary, true);

  if (plans.length > 0) {
    console.log(
      `[duplicates] Done. Originals quarantined in ${path.relative(ROOT, quarantine)}. ` +
        "Run `npm run galleries:prepare` next."
    );
  }
}

main().catch((err) => {
  console.error(`[duplicates] ${err.message}`);
  process.exit(1);
});
