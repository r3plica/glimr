// Downloads URLs from a text file (one per line) into public/galleries/<gallery>/.
// - Concurrency-limited
// - Resumable (skips existing files)
// - Unique filenames: <padded-index>-<safe-basename>
//
// Usage:
//   node scripts/download-urls.mjs <urls.txt> <gallery-name> [concurrency]

import { promises as fs, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const [, , urlsFile, galleryName, concArg] = process.argv;
if (!urlsFile || !galleryName) {
  console.error(
    "Usage: node scripts/download-urls.mjs <urls.txt> <gallery-name> [concurrency]"
  );
  process.exit(1);
}
const concurrency = Math.max(1, Number(concArg) || 16);

const OUT_DIR = path.join(ROOT, "public", "galleries", galleryName);

function safeBasename(u) {
  try {
    const url = new URL(u);
    let base = decodeURIComponent(path.basename(url.pathname)) || "image";
    base = base.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-80);
    if (!path.extname(base)) base += ".jpg";
    return base;
  } catch {
    return "image.jpg";
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

async function downloadOne(url, outPath) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!res.body) throw new Error("no body");
  const tmp = outPath + ".part";
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  await fs.rename(tmp, outPath);
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const raw = await fs.readFile(urlsFile, "utf8");
  const urls = raw
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && /^https?:\/\//i.test(s));

  const total = urls.length;
  const padW = String(total).length;
  console.log(`[dl] ${total} URLs -> ${path.relative(ROOT, OUT_DIR)} (concurrency=${concurrency})`);

  const tasks = urls.map((url, i) => {
    const filename = `${String(i + 1).padStart(padW, "0")}-${safeBasename(url)}`;
    return { url, filename, out: path.join(OUT_DIR, filename) };
  });

  let done = 0;
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];
  const startedAt = Date.now();

  let cursor = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++;
      const t = tasks[idx];
      try {
        if (await exists(t.out)) {
          skipped += 1;
        } else {
          let attempt = 0;
          while (true) {
            try {
              await downloadOne(t.url, t.out);
              ok += 1;
              break;
            } catch (err) {
              attempt += 1;
              if (attempt >= 3) {
                failed += 1;
                failures.push({ url: t.url, error: String(err) });
                break;
              }
              await new Promise((r) => setTimeout(r, 500 * attempt));
            }
          }
        }
      } finally {
        done += 1;
        if (done % 100 === 0 || done === total) {
          const elapsed = (Date.now() - startedAt) / 1000;
          const rate = done / Math.max(elapsed, 0.001);
          const eta = (total - done) / Math.max(rate, 0.001);
          console.log(
            `[dl] ${done}/${total} (ok=${ok} skip=${skipped} fail=${failed}) ${rate.toFixed(1)}/s ETA ${Math.round(eta)}s`
          );
        }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));

  const summary = {
    finishedAt: new Date().toISOString(),
    total,
    ok,
    skipped,
    failed,
    failures: failures.slice(0, 200),
  };
  await fs.writeFile(
    path.join(OUT_DIR, "_download-report.json"),
    JSON.stringify(summary, null, 2)
  );
  console.log(`[dl] done. ok=${ok} skip=${skipped} fail=${failed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
