import { execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = [];

async function fixture() {
  const cache = path.join(root, "node_modules", ".cache");
  await fs.mkdir(cache, { recursive: true });
  const dir = await fs.mkdtemp(path.join(cache, "prepare-"));
  fixtures.push(dir);
  await fs.mkdir(path.join(dir, "scripts", "lib"), { recursive: true });
  for (const file of ["prepare-galleries.mjs", "lib/galleries.mjs", "lib/image-cache.mjs"]) {
    await fs.copyFile(path.join(root, "scripts", file), path.join(dir, "scripts", file));
  }
  return dir;
}

async function addGallery(dir, name, meta) {
  const folder = path.join(dir, "public", "galleries", name);
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, "image.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>');
  if (meta) await fs.writeFile(path.join(folder, "meta.json"), JSON.stringify(meta));
}

function prepare(dir) {
  return execFileSync(process.execPath, [path.join(dir, "scripts", "prepare-galleries.mjs")], {
    encoding: "utf8",
    stdio: "pipe",
  });
}

async function catalogue(dir) {
  return JSON.parse(await fs.readFile(path.join(dir, "public", "manifest.json"), "utf8"));
}

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

it("publishes colliding folder names without changing existing gallery URLs on later runs", async () => {
  const dir = await fixture();
  await addGallery(dir, "yuno");
  prepare(dir);
  const original = await catalogue(dir);
  expect(original.galleries[0].slug).toBe("yuno");

  await addGallery(dir, "yuno_");
  prepare(dir);
  const updated = await catalogue(dir);
  expect(updated.galleries).toHaveLength(2);
  expect(new Set(updated.galleries.map((g) => g.slug)).size).toBe(2);
  const previous = JSON.parse(await fs.readFile(path.join(dir, "public", "data", "search-index.json"), "utf8"));
  expect(previous.galleries.find((g) => g.dir === "yuno").slug).toBe("yuno");

  await addGallery(dir, "_yuno");
  prepare(dir);
  const next = JSON.parse(await fs.readFile(path.join(dir, "public", "data", "search-index.json"), "utf8"));
  for (const gallery of previous.galleries) {
    expect(next.galleries.find((g) => g.dir === gallery.dir).slug).toBe(gallery.slug);
  }
  const manifest = await catalogue(dir);
  expect(manifest.galleries).toHaveLength(3);
  for (const gallery of manifest.galleries) {
    const detail = JSON.parse(await fs.readFile(
      path.join(dir, "public", "data", "galleries", `${gallery.slug}.json`), "utf8"));
    expect(detail.slug).toBe(gallery.slug);
    expect(detail.images).toHaveLength(1);
  }
});

it("rejects conflicting explicit slugs without replacing the previous catalogue", async () => {
  const dir = await fixture();
  await addGallery(dir, "first", { slug: "chosen" });
  prepare(dir);
  const original = await catalogue(dir);
  await addGallery(dir, "second", { slug: "chosen" });
  expect(() => prepare(dir)).toThrow();
  expect(await catalogue(dir)).toEqual(original);
});

it.each([false, true])("keeps duplicate marks and merged aliases consistent (previously prepared: %s)", async (prepared) => {
  const dir = await fixture();
  await addGallery(dir, "yuno");
  await addGallery(dir, "yuno_");
  await fs.copyFile(
    path.join(dir, "public", "galleries", "yuno_", "image.svg"),
    path.join(dir, "public", "galleries", "yuno_", "second.svg")
  );
  if (prepared) prepare(dir);
  await fs.mkdir(path.join(dir, "data"), { recursive: true });
  const duplicateSlug = "yuno-2";
  await fs.writeFile(path.join(dir, "data", "duplicate-marks.json"), JSON.stringify({
    version: 1,
    sets: [{ id: "marked", slugs: [duplicateSlug], createdAt: new Date().toISOString() }],
  }));
  execFileSync(process.execPath, [
    path.join(root, "scripts", "merge-duplicates.mjs"),
    "--galleries", path.join(dir, "public", "galleries"),
    "--data", path.join(dir, "data"),
    "--apply",
  ], { encoding: "utf8", stdio: "pipe" });
  const plan = JSON.parse(await fs.readFile(path.join(dir, "data", "merge-plan.json"), "utf8"));
  expect(plan.unresolvedMarks).toEqual([]);
  expect(plan.foldersMerged).toBe(1);
  prepare(dir);
  const manifest = await catalogue(dir);
  expect(manifest.galleries).toHaveLength(1);
  expect(manifest.galleries[0].slug).toBe(duplicateSlug);
  expect(manifest.galleries[0].aliases).toContain("yuno");
});
