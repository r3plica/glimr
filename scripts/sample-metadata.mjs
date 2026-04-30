import { promises as fs } from "node:fs";
import path from "node:path";
import exifr from "exifr";

const DIR = path.resolve("public/galleries/blogger");
const files = (await fs.readdir(DIR))
  .filter((f) => /\.jpg$/i.test(f))
  .sort();

// Sample 20 spread across the set
const step = Math.max(1, Math.floor(files.length / 20));
const sample = [];
for (let i = 0; i < files.length && sample.length < 20; i += step) sample.push(files[i]);

const summary = { fileCount: files.length, results: [] };
for (const f of sample) {
  const full = path.join(DIR, f);
  const stat = await fs.stat(full);
  let exif = null;
  try {
    exif = await exifr.parse(full, {
      tiff: true,
      ifd0: true,
      exif: true,
      gps: true,
      iptc: true,
      xmp: true,
      icc: false,
      jfif: true,
      ihdr: true,
    });
  } catch (e) {
    exif = { _error: String(e) };
  }
  summary.results.push({
    file: f,
    sizeKB: Math.round(stat.size / 1024),
    mtime: stat.mtime.toISOString(),
    exif: exif
      ? Object.fromEntries(
          Object.entries(exif).filter(([, v]) => v !== undefined && v !== null)
        )
      : null,
  });
}
console.log(JSON.stringify(summary, null, 2));
