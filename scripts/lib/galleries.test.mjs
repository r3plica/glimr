import { describe, expect, it } from "vitest";
import { contentSignature, selectCovers, verifyDuplicateGroups } from "./galleries.mjs";

const sig = (...hashes) => contentSignature(hashes);

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
