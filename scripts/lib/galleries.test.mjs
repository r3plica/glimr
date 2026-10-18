import { describe, expect, it } from "vitest";
import { resolveGallerySlugs, selectCovers, slugify } from "./galleries.mjs";

describe("resolveGallerySlugs", () => {
  const gallery = (dir, slug) => ({ dir, slug: slug ?? slugify(dir), explicitSlug: Boolean(slug) });

  it("allocates deterministic suffixes without taking another folder's base name", () => {
    const folders = ["yuno_", "yuno-2", "yuno"].map((dir) => gallery(dir));
    const resolved = resolveGallerySlugs(folders);
    expect(resolved.get("yuno")).toBe("yuno");
    expect(resolved.get("yuno-2")).toBe("yuno-2");
    expect(resolved.get("yuno_")).toBe("yuno-3");
    expect(Object.fromEntries(resolveGallerySlugs([...folders].reverse()))).toEqual(Object.fromEntries(resolved));
  });

  it("preserves previous URLs even when a new folder sorts earlier or exactly matches the base", () => {
    const previous = [{ dir: "yuno_", slug: "yuno" }, { dir: "_yuno", slug: "yuno-2" }];
    const resolved = resolveGallerySlugs(["yuno", "_yuno", "yuno_"].map((dir) => gallery(dir)), previous);
    expect(resolved.get("yuno_")).toBe("yuno");
    expect(resolved.get("_yuno")).toBe("yuno-2");
    expect(resolved.get("yuno")).toBe("yuno-3");
  });

  it("reserves merged aliases and removed galleries' URLs", () => {
    const resolved = resolveGallerySlugs(
      [gallery("yuno_"), gallery("former_")],
      [{ dir: "removed", slug: "former" }],
      { yuno: "root" }
    );
    expect(resolved.get("yuno_")).toBe("yuno-2");
    expect(resolved.get("former_")).toBe("former-2");
  });

  it("honours explicit metadata and rejects duplicate or unsafe explicit slugs", () => {
    const resolved = resolveGallerySlugs([gallery("first", "yuno"), gallery("yuno")]);
    expect(resolved.get("first")).toBe("yuno");
    expect(resolved.get("yuno")).toBe("yuno-2");
    expect(() => resolveGallerySlugs([gallery("a", "chosen"), gallery("b", "chosen")])).toThrow(/collision/);
    expect(() => resolveGallerySlugs([gallery("a", "../escape")])).toThrow(/unusable slug/);
  });

  it("gives punctuation-only folder names usable unique slugs", () => {
    const resolved = resolveGallerySlugs([gallery("_"), gallery("__")]);
    expect([...resolved.values()]).toEqual(["gallery", "gallery-2"]);
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
