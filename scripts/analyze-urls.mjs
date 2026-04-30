// Analyze the URL list for groupable patterns (filename prefix, URL size segment).
import { promises as fs } from "node:fs";

const file = process.argv[2];
const raw = await fs.readFile(file, "utf8");
const urls = raw.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^https?:/.test(s));

const prefixCounts = new Map();
const sizeSegCounts = new Map();
const fullBaseCounts = new Map();
const seqByPrefix = new Map();

for (const u of urls) {
  try {
    const url = new URL(u);
    const decoded = decodeURIComponent(url.pathname);
    // size segment, e.g. /s600/, /s1600/, /s16000/
    const sizeMatch = decoded.match(/\/s(\d+)\//);
    const sizeSeg = sizeMatch ? `s${sizeMatch[1]}` : "(none)";
    sizeSegCounts.set(sizeSeg, (sizeSegCounts.get(sizeSeg) || 0) + 1);

    const baseRaw = decoded.split("/").pop() || "";
    const base = baseRaw.replace(/\.[a-z0-9]+$/i, "");
    fullBaseCounts.set(base, (fullBaseCounts.get(base) || 0) + 1);

    // Pattern: <prefix> (<seq>) e.g. "r (14)", "t (40)"
    const m = base.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*\((\d+)\)$/);
    if (m) {
      const [, p, n] = m;
      prefixCounts.set(p, (prefixCounts.get(p) || 0) + 1);
      if (!seqByPrefix.has(p)) seqByPrefix.set(p, []);
      seqByPrefix.get(p).push(Number(n));
    } else {
      prefixCounts.set("(no-pattern)", (prefixCounts.get("(no-pattern)") || 0) + 1);
    }
  } catch {
    /* skip */
  }
}

const top = (m, n = 50) =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

console.log("=== URL size segments ===");
for (const [k, v] of top(sizeSegCounts)) console.log(`  ${k}: ${v}`);

console.log("\n=== Filename prefixes (top 50) ===");
for (const [k, v] of top(prefixCounts, 50)) console.log(`  ${k}: ${v}`);

console.log(`\nDistinct prefixes: ${prefixCounts.size}`);
console.log(`Distinct base names: ${fullBaseCounts.size}`);
console.log(`Total URLs: ${urls.length}`);

// Examine sequence ranges per top prefix
console.log("\n=== Sequence ranges per top 20 prefixes ===");
for (const [p, count] of top(prefixCounts, 20)) {
  if (p === "(no-pattern)") continue;
  const seqs = seqByPrefix.get(p) || [];
  const min = Math.min(...seqs);
  const max = Math.max(...seqs);
  const uniq = new Set(seqs).size;
  console.log(`  ${p}: ${count} urls, seq ${min}-${max}, unique=${uniq}`);
}

// Look for non-pattern basenames sample
console.log("\n=== Sample non-pattern basenames ===");
const nonPattern = [...fullBaseCounts.keys()].filter((b) => !/^[A-Za-z][A-Za-z0-9_-]*\s*\(\d+\)$/.test(b));
console.log(`  Count: ${nonPattern.length}`);
for (const b of nonPattern.slice(0, 20)) console.log(`  - ${b}`);
