import { describe, expect, it } from "vitest";
import { searchGlobal, searchImages } from "./search";
import type { GallerySummary, SearchIndex } from "../types";

const gallery: GallerySummary = {
  slug: "canonical",
  title: "Alpine landscapes",
  description: "Winter mountains",
  tags: ["snow"],
  cover: "/galleries/original/cover.jpg",
  imageCount: 1,
  aliases: ["duplicate"],
};
const galleries = [gallery];
const index: SearchIndex = {
  formatVersion: 2,
  galleries: [{
    slug: "canonical",
    dir: "original folder",
    images: [{ filename: "needle.jpg", tags: ["wildlife"] }],
  }],
};

describe("searchGlobal", () => {
  it("returns catalogue order without requiring the image index for an empty query", () => {
    expect(searchGlobal(galleries, null, " ")).toEqual([{ type: "gallery", gallery }]);
    expect(searchGlobal(galleries, null, "needle")).toEqual([]);
  });

  it("searches summary metadata and image metadata with usable local thumbnails", () => {
    expect(searchGlobal(galleries, index, "snow").some((hit) => hit.type === "gallery")).toBe(true);
    const hit = searchGlobal(galleries, index, "wildlife").find((hit) => hit.type === "image");
    expect(hit?.gallery).toBe(gallery);
    expect(hit?.image).toEqual({
      src: "/galleries/original folder/needle.jpg",
      filename: "needle.jpg",
      tags: ["wildlife"],
    });
    expect(searchImages(hit?.image ? [hit.image] : [], "needle")).toHaveLength(1);
  });

  it("reuses image rows across queries but isolates different catalogue/index pairs", () => {
    const first = searchGlobal(galleries, index, "needle").find((hit) => hit.image)?.image;
    const second = searchGlobal(galleries, index, "wildlife").find((hit) => hit.image)?.image;
    expect(first).toBeDefined();
    expect(second).toBe(first);
    const replacement = [{ ...gallery, title: "Updated catalogue" }];
    expect(searchGlobal(replacement, index, "needle")[0].gallery).toBe(replacement[0]);
    const newIndex: SearchIndex = {
      formatVersion: 2,
      galleries: [{ slug: gallery.slug, dir: "new", images: [{ filename: "different.jpg" }] }],
    };
    expect(searchGlobal(galleries, newIndex, "different")[0].image?.src).toBe("/galleries/new/different.jpg");
  });

  it("reports a shared filename as a match in every gallery that contains it", () => {
    const other: GallerySummary = { ...gallery, slug: "other", title: "Other", tags: [], aliases: [] };
    const shared: SearchIndex = {
      formatVersion: 2,
      galleries: [
        { slug: "canonical", dir: "a", images: [{ filename: "r (1).jpg" }] },
        { slug: "other", dir: "b", images: [{ filename: "r (1).jpg" }] },
      ],
    };
    const hits = searchGlobal([gallery, other], shared, "r (1).jpg").filter((h) => h.type === "image");
    expect(hits.map((h) => [h.gallery.slug, h.image?.src])).toEqual([
      ["canonical", "/galleries/a/r (1).jpg"],
      ["other", "/galleries/b/r (1).jpg"],
    ]);
  });
});
