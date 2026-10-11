import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { contentSignature, selectCovers, verifyDuplicateGroups } from "./galleries.mjs";

const sig = (...hashes) => contentSignature(hashes);

describe("find-duplicates.ps1 full-content detection", () => {
  let workspace;
  let result;
  let expectedSignature;

  beforeAll(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "glimr-duplicates-"));
    const galleriesDir = path.join(workspace, "galleries");
    await mkdir(galleriesDir);
    const images = await Promise.all(
      ["red", "green", "blue"].map((background) =>
        sharp({ create: { width: 2, height: 2, channels: 3, background } }).png().toBuffer()
      )
    );
    expectedSignature = contentSignature(
      images.map((image) => createHash("sha256").update(image).digest("hex"))
    );
    const fixtures = {
      "a-root": [0, 1, 2],
      "b-shared-first-only": [0, 2, 2],
      "c-renamed-reordered-copy": [2, 0, 1],
      "d-repeat-red": [0, 0, 1],
      "e-repeat-green": [0, 1, 1],
      "z-empty": [],
    };
    for (const [name, indices] of Object.entries(fixtures)) {
      const dir = path.join(galleriesDir, name);
      await mkdir(dir);
      await Promise.all(indices.map((index, i) =>
        writeFile(path.join(dir, `${name}-${i}.png`), images[index])
      ));
    }
    const outFile = path.join(workspace, "duplicates.json");
    const script = fileURLToPath(new URL("../find-duplicates.ps1", import.meta.url));
    execFileSync("powershell", [
      "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script,
      "-GalleriesDir", galleriesDir, "-OutFile", outFile,
    ], { timeout: 30_000 });
    result = JSON.parse(await readFile(outFile, "utf8"));
  }, 30_000);

  afterAll(async () => {
    if (workspace) await rm(workspace, { recursive: true, force: true });
  });

  it("does not call galleries duplicates when only their first image and count match", () => {
    const grouped = result.groups.flatMap((group) => [group.root, ...group.duplicates]);
    expect(grouped).not.toContain("b-shared-first-only");
  });

  it("detects every-image matches despite different filenames and image order", () => {
    expect(result.groups.map(({ root, duplicates, imageCount }) => ({
      root, duplicates, imageCount,
    }))).toEqual([{
      root: "a-root",
      duplicates: ["c-renamed-reordered-copy"],
      imageCount: 3,
    }]);
    expect(result.groups[0].contentSha256).toBe(expectedSignature);
  });

  it("preserves repeated-image counts and excludes empty galleries", () => {
    const grouped = result.groups.flatMap((group) => [group.root, ...group.duplicates]);
    expect(grouped).not.toContain("d-repeat-red");
    expect(grouped).not.toContain("e-repeat-green");
    expect(grouped).not.toContain("z-empty");
    expect(result.emptyFolders).toEqual(["z-empty"]);
  });
});

describe("contentSignature", () => {
  it("ignores order but respects repeated images", () => {
    expect(sig("a", "b", "c")).toBe(sig("c", "a", "b"));
    expect(sig("a", "a", "b")).not.toBe(sig("a", "b", "b"));
  });

  it("cannot vouch for a gallery with unreadable images", () => {
    expect(sig("a", null)).toBeNull();
  });
});

describe("verifyDuplicateGroups", () => {
  it("merges only folders whose full contents match the root", () => {
    const signatures = new Map([
      ["root", sig("x", "y", "z")],
      ["copy", sig("z", "y", "x")],
      // Same first image and same count as root, different remaining images.
      ["lookalike", sig("x", "y", "other")],
    ]);
    const result = verifyDuplicateGroups(
      [{ root: "root", duplicates: ["copy", "lookalike"] }],
      signatures
    );
    expect(result.merges).toEqual([{ canonical: "root", aliases: ["copy"] }]);
    expect([...result.aliasOf]).toEqual([["copy", "root"]]);
    expect(result.rejected).toEqual([
      { dir: "lookalike", candidateRoot: "root", reason: "contents differ" },
    ]);
  });

  it("merges matching non-root members even when the root differs", () => {
    const signatures = new Map([
      ["root", sig("x", "1")],
      ["b", sig("x", "2")],
      ["c", sig("2", "x")],
    ]);
    const result = verifyDuplicateGroups([{ root: "root", duplicates: ["b", "c"] }], signatures);
    expect(result.merges).toEqual([{ canonical: "b", aliases: ["c"] }]);
    expect(result.rejected.map((r) => r.dir)).toEqual(["root"]);
  });

  it("never merges unreadable or missing folders", () => {
    const signatures = new Map([
      ["root", sig("x")],
      ["broken", null],
    ]);
    const result = verifyDuplicateGroups(
      [{ root: "root", duplicates: ["broken", "gone"] }],
      signatures
    );
    expect(result.aliasOf.size).toBe(0);
    expect(result.missing).toEqual([{ dir: "gone", candidateRoot: "root" }]);
    expect(result.rejected.map((r) => [r.dir, r.reason])).toEqual([
      ["broken", "unreadable images"],
      ["root", "contents differ"],
    ]);
  });
});

describe("selectCovers", () => {
  it("prefers images unique to a gallery and never reuses a cover", () => {
    const shared = { src: "shared", hash: "s" };
    const a = { metaCover: null, images: [shared, { src: "a1", hash: "a" }] };
    const b = { metaCover: null, images: [shared] };
    const c = { metaCover: "/meta.jpg", images: [shared] };
    const covers = selectCovers([a, b, c]);
    expect(covers.get(a)).toBe("a1");
    expect(covers.get(b)).toBe("shared");
    expect(covers.get(c)).toBe("/meta.jpg");
  });
});
