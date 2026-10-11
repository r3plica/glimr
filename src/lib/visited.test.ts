import { describe, expect, it } from "vitest";
import { hasVisitedGallery } from "./visited";

describe("hasVisitedGallery", () => {
  const gallery = { slug: "canonical", aliases: ["duplicate", "other-copy"] };

  it("recognizes canonical and legacy duplicate visits", () => {
    expect(hasVisitedGallery(new Set(["canonical"]), gallery)).toBe(true);
    expect(hasVisitedGallery(new Set(["other-copy"]), gallery)).toBe(true);
    expect(hasVisitedGallery(new Set(["unrelated"]), gallery)).toBe(false);
    expect(hasVisitedGallery(new Set(), gallery)).toBe(false);
  });

  it("supports galleries without aliases and does not rewrite history", () => {
    const visited = new Set(["duplicate"]);
    expect(hasVisitedGallery(visited, { slug: "duplicate" })).toBe(true);
    expect(hasVisitedGallery(visited, gallery)).toBe(true);
    expect([...visited]).toEqual(["duplicate"]);
  });
});
