import { describe, expect, it } from "vitest";
import { selectCovers } from "./galleries.mjs";

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
