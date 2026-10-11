import { afterEach, describe, expect, it, vi } from "vitest";
import type { GallerySummary } from "../types";
import { loadGallery, loadSearchIndex, resolveGallery } from "./manifest";

afterEach(() => vi.unstubAllGlobals());

const canonical: GallerySummary = {
  slug: "canonical",
  title: "Gallery",
  description: "",
  tags: [],
  cover: "cover.jpg",
  imageCount: 0,
  aliases: ["duplicate", "direct"],
};

describe("resolveGallery", () => {
  it("resolves aliases but prioritizes a direct canonical slug match", () => {
    const direct = { ...canonical, slug: "direct", aliases: [] };
    const galleries = [canonical, direct];
    expect(resolveGallery(galleries, "duplicate")).toBe(canonical);
    expect(resolveGallery(galleries, "direct")).toBe(direct);
    expect(resolveGallery(galleries, "unknown")).toBeUndefined();
    expect(resolveGallery(galleries, undefined)).toBeUndefined();
  });
});

describe("lazy data loaders", () => {
  it("shares detail requests and encodes the canonical slug in the URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ slug: "space / slug" })));
    vi.stubGlobal("fetch", fetchMock);
    const first = loadGallery("space / slug");
    expect(loadGallery("space / slug")).toBe(first);
    await expect(first).resolves.toEqual({ slug: "space / slug" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      `${import.meta.env.BASE_URL}data/galleries/space%20%2F%20slug.json`,
      { cache: "no-cache" }
    );
  });

  it("evicts failed detail requests so a subsequent request can recover", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ slug: "retry" })));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadGallery("retry")).rejects.toThrow("Gallery HTTP 503");
    await expect(loadGallery("retry")).resolves.toEqual({ slug: "retry" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("evicts failed search index requests and caches the successful retry", async () => {
    const data = { formatVersion: 2, galleries: [] };
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response(JSON.stringify(data)));
    vi.stubGlobal("fetch", fetchMock);
    await expect(loadSearchIndex()).rejects.toThrow("offline");
    const retry = loadSearchIndex();
    expect(loadSearchIndex()).toBe(retry);
    await expect(retry).resolves.toEqual(data);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
