import { describe, expect, it } from "vitest";
import { applyFilters, shuffle, sortImages } from "./filters";
import type { GalleryImage } from "../types";

function img(
  filename: string,
  overrides: Partial<GalleryImage> = {}
): GalleryImage {
  return {
    src: `/galleries/x/${filename}`,
    filename,
    width: overrides.width ?? 1000,
    height: overrides.height ?? 1000,
    orientation: overrides.orientation ?? "square",
    sizeBucket: overrides.sizeBucket ?? "medium",
    ...overrides,
  };
}

describe("applyFilters - orientation", () => {
  const images = [
    img("a.jpg", { orientation: "portrait" }),
    img("b.jpg", { orientation: "landscape" }),
    img("c.jpg", { orientation: "square" }),
    img("d.jpg", { orientation: "unknown" }),
  ];

  it("returns all when orientation is 'any'", () => {
    const out = applyFilters(
      images,
      { orientation: "any", size: "any", sort: "name-asc" },
      1
    );
    expect(out).toHaveLength(4);
  });

  it("filters to portrait", () => {
    const out = applyFilters(
      images,
      { orientation: "portrait", size: "any", sort: "name-asc" },
      1
    );
    expect(out.map((i) => i.filename)).toEqual(["a.jpg"]);
  });

  it("filters to landscape", () => {
    const out = applyFilters(
      images,
      { orientation: "landscape", size: "any", sort: "name-asc" },
      1
    );
    expect(out.map((i) => i.filename)).toEqual(["b.jpg"]);
  });

  it("filters to square", () => {
    const out = applyFilters(
      images,
      { orientation: "square", size: "any", sort: "name-asc" },
      1
    );
    expect(out.map((i) => i.filename)).toEqual(["c.jpg"]);
  });
});

describe("applyFilters - size", () => {
  const images = [
    img("a.jpg", { sizeBucket: "small" }),
    img("b.jpg", { sizeBucket: "medium" }),
    img("c.jpg", { sizeBucket: "large" }),
    img("d.jpg", { sizeBucket: "unknown" }),
  ];

  it("returns all when size is 'any'", () => {
    const out = applyFilters(
      images,
      { orientation: "any", size: "any", sort: "name-asc" },
      1
    );
    expect(out).toHaveLength(4);
  });

  it("filters to small", () => {
    const out = applyFilters(
      images,
      { orientation: "any", size: "small", sort: "name-asc" },
      1
    );
    expect(out.map((i) => i.filename)).toEqual(["a.jpg"]);
  });

  it("filters to medium", () => {
    const out = applyFilters(
      images,
      { orientation: "any", size: "medium", sort: "name-asc" },
      1
    );
    expect(out.map((i) => i.filename)).toEqual(["b.jpg"]);
  });

  it("filters to large", () => {
    const out = applyFilters(
      images,
      { orientation: "any", size: "large", sort: "name-asc" },
      1
    );
    expect(out.map((i) => i.filename)).toEqual(["c.jpg"]);
  });

  it("treats undefined sizeBucket as 'unknown'", () => {
    const fallback = [img("e.jpg", { sizeBucket: undefined })];
    const out = applyFilters(
      fallback,
      { orientation: "any", size: "small", sort: "name-asc" },
      1
    );
    expect(out).toHaveLength(0);
  });
});

describe("applyFilters - combined", () => {
  it("ANDs orientation and size", () => {
    const images = [
      img("portrait-large.jpg", { orientation: "portrait", sizeBucket: "large" }),
      img("portrait-small.jpg", { orientation: "portrait", sizeBucket: "small" }),
      img("landscape-large.jpg", { orientation: "landscape", sizeBucket: "large" }),
    ];
    const out = applyFilters(
      images,
      { orientation: "portrait", size: "large", sort: "name-asc" },
      1
    );
    expect(out.map((i) => i.filename)).toEqual(["portrait-large.jpg"]);
  });
});

describe("sortImages", () => {
  const images = [
    img("c.jpg", { width: 500, height: 500 }),
    img("a.jpg", { width: 2000, height: 2000 }),
    img("b.jpg", { width: 1000, height: 1000 }),
  ];

  it("name-asc sorts naturally", () => {
    expect(sortImages(images, "name-asc", 1).map((i) => i.filename)).toEqual([
      "a.jpg",
      "b.jpg",
      "c.jpg",
    ]);
  });

  it("name-desc reverses", () => {
    expect(sortImages(images, "name-desc", 1).map((i) => i.filename)).toEqual([
      "c.jpg",
      "b.jpg",
      "a.jpg",
    ]);
  });

  it("size-desc sorts highest resolution first", () => {
    expect(sortImages(images, "size-desc", 1).map((i) => i.filename)).toEqual([
      "a.jpg",
      "b.jpg",
      "c.jpg",
    ]);
  });

  it("size-asc sorts lowest resolution first", () => {
    expect(sortImages(images, "size-asc", 1).map((i) => i.filename)).toEqual([
      "c.jpg",
      "b.jpg",
      "a.jpg",
    ]);
  });

  it("name-asc handles numeric ordering", () => {
    const numeric = [img("img10.jpg"), img("img2.jpg"), img("img1.jpg")];
    expect(sortImages(numeric, "name-asc", 1).map((i) => i.filename)).toEqual([
      "img1.jpg",
      "img2.jpg",
      "img10.jpg",
    ]);
  });
});

describe("shuffle", () => {
  it("returns the same elements", () => {
    const xs = [1, 2, 3, 4, 5];
    expect(shuffle(xs, 7).slice().sort((a, b) => a - b)).toEqual(xs);
  });

  it("is deterministic for the same seed", () => {
    const xs = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(xs, 42)).toEqual(shuffle(xs, 42));
  });

  it("does not mutate input", () => {
    const xs = [1, 2, 3, 4];
    const snap = xs.slice();
    shuffle(xs, 1);
    expect(xs).toEqual(snap);
  });
});
