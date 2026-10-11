import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeMarks } from "./duplicate-marks.mjs";
import {
  connectedGroups,
  emptyAliases,
  overlappingPairs,
  pickRoot,
  planGroupMerge,
  recordMerge,
  remainingMarks,
  resolveMarkedGroups,
} from "./merge.mjs";

const files = (...pairs) => pairs.map(([name, hash]) => ({ name, hash }));

describe("overlappingPairs", () => {
  it("scores shared images against the larger gallery and ignores a single shared cover", () => {
    const big = Array.from({ length: 20 }, (_, i) => `h${i}`);
    const pairs = overlappingPairs([
      { dir: "big", hashes: big },
      { dir: "half", hashes: ["h0", "h1", "h2", "h3", "x1"] },
      { dir: "first-only", hashes: ["h0", ...Array.from({ length: 19 }, (_, i) => `y${i}`)] },
    ]);
    expect(pairs).toEqual([{ a: "big", b: "half", shared: 4, overlap: 0.2 }]);
  });

  it("counts repeated images once", () => {
    const pairs = overlappingPairs([
      { dir: "a", hashes: ["x", "x", "x", null] },
      { dir: "b", hashes: ["x"] },
    ]);
    expect(pairs).toEqual([{ a: "a", b: "b", shared: 1, overlap: 1 }]);
  });
});

describe("connectedGroups", () => {
  it("joins transitive matches into one group", () => {
    expect(connectedGroups([["c", "b"], ["b", "a"], ["x", "y"]])).toEqual([
      ["a", "b", "c"],
      ["x", "y"],
    ]);
  });
});

describe("pickRoot", () => {
  it("keeps the largest gallery and breaks ties by folder name", () => {
    const one = { dir: "b", files: files(["1", "x"]) };
    const two = { dir: "c", files: files(["1", "x"], ["2", "y"]) };
    const tie = { dir: "a", files: files(["1", "z"], ["2", "w"]) };
    expect(pickRoot([one, two]).dir).toBe("c");
    expect(pickRoot([two, tie, one]).dir).toBe("a");
  });
});

describe("planGroupMerge", () => {
  const token = () => "rnd";

  it("moves only new images, renames clashes and records repeats", () => {
    const root = { dir: "root", files: files(["1.jpg", "a"]), entries: ["1.jpg", "Notes.txt"], hasUrls: false };
    const plan = planGroupMerge(
      root,
      [
        { dir: "m2", files: files(["1.jpg", "b"], ["2.jpg", "c"]) },
        { dir: "m1", files: files(["1.jpg", "a"], ["notes.txt.jpg", "d"], ["3.JPG", "c"]) },
      ],
      token
    );
    expect(plan.moves).toEqual([
      { dir: "m1", name: "3.JPG", target: "3.JPG", hash: "c" },
      { dir: "m1", name: "notes.txt.jpg", target: "notes.txt.jpg", hash: "d" },
      { dir: "m2", name: "1.jpg", target: "1-rnd.jpg", hash: "b" },
    ]);
    expect(plan.repeats).toEqual([
      { dir: "m1", name: "1.jpg", sameAs: "1.jpg" },
      { dir: "m2", name: "2.jpg", sameAs: "3.JPG" },
    ]);
    expect(plan.members).toEqual(["m2", "m1"]);
  });

  it("keeps moved files from pairing with the root's urls.txt lines", () => {
    const root = { dir: "root", files: [], entries: ["urls.txt"], hasUrls: true };
    const plan = planGroupMerge(root, [{ dir: "m", files: files(["001-a.jpg", "x"]) }], token);
    expect(plan.moves[0].target).toBe("rnd-001-a.jpg");
  });
});

describe("recordMerge", () => {
  it("aliases merged slugs and keeps chains of merges resolving in one step", () => {
    const first = recordMerge(
      emptyAliases(),
      { root: "b", members: ["a"], moves: [{ dir: "a", name: "1.jpg", target: "1.jpg" }], repeats: [] },
      (d) => d
    );
    const second = recordMerge(
      first,
      {
        root: "c",
        members: ["b"],
        moves: [{ dir: "b", name: "1.jpg", target: "1-x.jpg" }],
        repeats: [{ dir: "b", name: "2.jpg", sameAs: "9.jpg" }],
      },
      (d) => d
    );
    expect(second.galleries).toEqual({ a: "c", b: "c" });
    expect(second.images).toEqual({
      "/galleries/a/1.jpg": "/galleries/c/1-x.jpg",
      "/galleries/b/1.jpg": "/galleries/c/1-x.jpg",
      "/galleries/b/2.jpg": "/galleries/c/9.jpg",
    });
  });
});

describe("marked duplicate sets", () => {
  const dirOfSlug = new Map([
    ["a", "a"],
    ["b", "b"],
    ["c", "c"],
    ["d", "d"],
    ["old-d", "d"],
  ]);
  const marks = normalizeMarks({
    version: 1,
    sets: [
      { id: "pair", slugs: ["a", "b"], createdAt: "t" },
      { id: "waiting", slugs: ["c"], createdAt: "t" },
      { id: "same-folder", slugs: ["d", "old-d"], createdAt: "t" },
      { id: "gone", slugs: ["missing"], createdAt: "t" },
    ],
  });

  it("only turns sets spanning two or more folders into merge groups", () => {
    const result = resolveMarkedGroups(marks, dirOfSlug);
    expect(result.groups).toEqual([{ setId: "pair", dirs: ["a", "b"] }]);
    expect(result.unresolved).toEqual([{ setId: "gone", slug: "missing" }]);
  });

  it("drops merged sets and keeps waiting sets under the gallery's new slug", () => {
    const next = remainingMarks(marks, new Map([["b", "a"], ["c", "a"]]), dirOfSlug, (d) => `slug-${d}`);
    expect(next.sets.map((s) => [s.id, s.slugs])).toEqual([
      ["waiting", ["slug-a"]],
      ["gone", ["missing"]],
    ]);
  });
});

describe("normalizeMarks", () => {
  it("trims slugs, keeps each gallery in one set and drops empty sets", () => {
    expect(
      normalizeMarks({
        version: 1,
        sets: [
          { id: "1", slugs: [" a ", "a", ""], createdAt: "t" },
          { id: "2", slugs: ["a"], createdAt: "t" },
          { id: "3", slugs: ["b"], createdAt: "t" },
        ],
      })
    ).toEqual({ version: 1, sets: [{ id: "1", slugs: ["a"], createdAt: "t" }, { id: "3", slugs: ["b"], createdAt: "t" }] });
  });

  it("rejects malformed documents", () => {
    expect(() => normalizeMarks({ sets: [{ id: "1", slugs: [1] }] })).toThrow();
    expect(() => normalizeMarks([])).toThrow();
  });
});

describe("merge-duplicates.mjs", () => {
  let workspace;
  let galleries;
  let data;
  const script = fileURLToPath(new URL("../merge-duplicates.mjs", import.meta.url));
  const run = (...args) =>
    execFileSync("node", [script, "--galleries", galleries, "--data", data, ...args], {
      timeout: 60_000,
      encoding: "utf8",
    });
  const list = async (dir) => (await readdir(dir)).sort();

  beforeAll(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "glimr-merge-"));
    galleries = path.join(workspace, "galleries");
    data = path.join(workspace, "data");
    await mkdir(data, { recursive: true });
    const images = await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        sharp({ create: { width: 2, height: 2, channels: 3, background: { r: i * 4, g: 7, b: 9 } } })
          .png()
          .toBuffer()
      )
    );
    const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
    const fixtures = {
      big: range(0, 19),
      "small-dup": range(15, 24),
      // Shares only its first image with big: must not be merged.
      lookalike: [0, ...range(30, 49)],
      "marked-a": range(50, 52),
      "marked-b": range(53, 55),
      solo: [56],
    };
    for (const [name, indices] of Object.entries(fixtures)) {
      const dir = path.join(galleries, name);
      await mkdir(dir, { recursive: true });
      await Promise.all(indices.map((index, i) => writeFile(path.join(dir, `${i + 1}.png`), images[index])));
    }
    await writeFile(path.join(galleries, "big", "notes.txt"), "keep");
    await writeFile(
      path.join(data, "duplicate-marks.json"),
      JSON.stringify({
        version: 1,
        sets: [
          { id: "pair", slugs: ["marked-b", "marked-a"], createdAt: "t" },
          { id: "waiting-dup", slugs: ["small-dup"], createdAt: "t" },
          { id: "waiting-solo", slugs: ["solo"], createdAt: "t" },
        ],
      })
    );
  }, 60_000);

  afterAll(async () => {
    if (workspace) await rm(workspace, { recursive: true, force: true });
  });

  it("previews without touching any folder", async () => {
    run();
    const plan = JSON.parse(await readFile(path.join(data, "merge-plan.json"), "utf8"));
    expect(plan.applied).toBe(false);
    expect(plan.plans.map((p) => [p.root, p.members])).toEqual([
      ["big", ["small-dup"]],
      ["marked-a", ["marked-b"]],
    ]);
    expect(await list(galleries)).toEqual(["big", "lookalike", "marked-a", "marked-b", "small-dup", "solo"]);
  });

  it("merges into the largest folder, quarantines originals and records aliases", async () => {
    run("--apply");
    expect(await list(galleries)).toEqual(["big", "lookalike", "marked-a", "solo"]);

    const bigFiles = await list(path.join(galleries, "big"));
    expect(bigFiles).toHaveLength(26);
    expect(bigFiles).toContain("notes.txt");
    expect(await list(path.join(galleries, "marked-a"))).toHaveLength(6);

    const [stamp] = await readdir(path.join(data, "merged-originals"));
    const quarantined = path.join(data, "merged-originals", stamp);
    expect(await list(quarantined)).toEqual(["marked-b", "small-dup"]);
    expect(await list(path.join(quarantined, "small-dup"))).toEqual(["1.png", "2.png", "3.png", "4.png", "5.png"]);
    expect(await list(path.join(quarantined, "marked-b"))).toEqual([]);

    const aliases = JSON.parse(await readFile(path.join(data, "folder-aliases.json"), "utf8"));
    expect(aliases.galleries).toEqual({ "small-dup": "big", "marked-b": "marked-a" });
    expect(aliases.images["/galleries/small-dup/1.png"]).toBe("/galleries/big/16.png");
    const moved = aliases.images["/galleries/small-dup/6.png"];
    expect(moved).toMatch(/^\/galleries\/big\/6-[a-z]+\.png$/);
    expect(bigFiles).toContain(moved.split("/").pop());

    const marks = JSON.parse(await readFile(path.join(data, "duplicate-marks.json"), "utf8"));
    expect(marks.sets.map((s) => [s.id, s.slugs])).toEqual([
      ["waiting-dup", ["big"]],
      ["waiting-solo", ["solo"]],
    ]);
  });

  it("finds nothing left to merge on the next run", async () => {
    run("--apply");
    const plan = JSON.parse(await readFile(path.join(data, "merge-plan.json"), "utf8"));
    expect(plan.groups).toBe(0);
  });
});
