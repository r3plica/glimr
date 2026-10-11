// Duplicate marks: galleries the user flagged as duplicates from the UI.
// Stored in data/duplicate-marks.json, read by the Vite middleware and by
// `npm run galleries:duplicates`, which merges every set of 2+ galleries.

import { promises as fs } from "node:fs";
import path from "node:path";

export const MARKS_VERSION = 1;

export function emptyMarks() {
  return { version: MARKS_VERSION, sets: [] };
}

/**
 * Validates and normalises marks: trims slugs, drops empty ones, keeps each
 * slug in at most one set (first occurrence wins) and drops empty sets.
 * Throws when the value is not shaped like a marks document.
 */
export function normalizeMarks(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.sets)) {
    throw new Error("Duplicate marks must be an object with a sets array.");
  }
  const seen = new Set();
  const ids = new Set();
  const sets = [];
  for (const set of value.sets) {
    if (!set || typeof set !== "object" || typeof set.id !== "string" || !set.id.trim()) {
      throw new Error("Every duplicate set needs a string id.");
    }
    if (!Array.isArray(set.slugs) || set.slugs.some((s) => typeof s !== "string")) {
      throw new Error(`Duplicate set ${set.id} needs a string slugs array.`);
    }
    const id = set.id.trim();
    if (ids.has(id)) throw new Error(`Duplicate set id ${id} is used twice.`);
    ids.add(id);
    const slugs = [];
    for (const raw of set.slugs) {
      const slug = raw.trim();
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      slugs.push(slug);
    }
    if (slugs.length === 0) continue;
    const createdAt = typeof set.createdAt === "string" ? set.createdAt : new Date(0).toISOString();
    sets.push({ id, slugs, createdAt });
  }
  return { version: MARKS_VERSION, sets };
}

export async function readMarks(file) {
  let raw;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return emptyMarks();
    throw err;
  }
  return normalizeMarks(JSON.parse(raw));
}

export async function writeMarks(file, marks) {
  const normalized = normalizeMarks(marks);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(normalized, null, 2) + "\n", "utf8");
  // Windows refuses to replace a file another request is reading; retry briefly.
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, file);
      break;
    } catch (err) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(err.code) || attempt >= 10) throw err;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  return normalized;
}
