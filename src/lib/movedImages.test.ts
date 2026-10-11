import { describe, expect, it } from "vitest";
import { remapFavoriteImage, remapImageSrc } from "./movedImages";

describe("moved image remapping", () => {
  it("maps old sources and leaves unknown sources unchanged", () => {
    const moved = { "/galleries/old/a.jpg": "/galleries/new/a.jpg" };
    expect(remapImageSrc("/galleries/old/a.jpg", moved)).toBe("/galleries/new/a.jpg");
    expect(remapImageSrc("/galleries/other/b.jpg", moved)).toBe("/galleries/other/b.jpg");
  });

  it("remaps favorite snapshots without mutating them or following stale remote URLs", () => {
    const favorite = { src: "/old/image.jpg", filename: "image.jpg", sourceUrl: "https://example.com/image.jpg" };
    const remapped = remapFavoriteImage(favorite, { "/old/image.jpg": "/new/image.jpg" });
    expect(remapped).toMatchObject({ src: "/new/image.jpg", sourceUrl: null });
    expect(favorite.src).toBe("/old/image.jpg");
  });
});
