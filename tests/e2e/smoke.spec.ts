import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";

interface ManifestImage {
  src: string;
  filename: string;
}
interface ManifestGallery {
  slug: string;
  title: string;
  cover: string;
  images: ManifestImage[];
}
interface ManifestShape {
  galleries: ManifestGallery[];
}

async function loadManifest(baseURL: string): Promise<ManifestShape> {
  const r = await fetch(`${baseURL}/manifest.json`);
  return (await r.json()) as ManifestShape;
}

test.describe("Glimr smoke", () => {
  test("home page renders heading and at least one gallery card", async ({
    page,
    baseURL,
  }) => {
    const manifest = await loadManifest(baseURL!);
    expect(manifest.galleries.length).toBeGreaterThan(0);

    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Glimr" })).toBeVisible();

    const firstSlug = manifest.galleries[0].slug;
    await expect(
      page.locator(`a[href="/g/${firstSlug}"]`).first()
    ).toBeVisible({ timeout: 30_000 });

    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("first gallery loads with filter bar and slideshow button", async ({
    page,
    baseURL,
  }) => {
    const manifest = await loadManifest(baseURL!);
    const slug = manifest.galleries[0].slug;

    await page.goto(`/g/${slug}`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: /slideshow/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Portrait" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Landscape" })).toBeVisible();
  });

  test("opening a thumbnail shows the image dialog", async ({
    page,
    baseURL,
  }) => {
    const manifest = await loadManifest(baseURL!);
    const slug = manifest.galleries[0].slug;

    await page.goto(`/g/${slug}`);
    // Wait for grid to render before clicking
    await expect(page.getByRole("button", { name: /slideshow/i })).toBeVisible();
    const firstThumb = page.locator("button:has(img[alt])").first();
    await firstThumb.waitFor({ state: "visible", timeout: 30_000 });
    await firstThumb.click();

    await expect(page.getByRole("button", { name: /close/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /next image/i })).toBeVisible();
  });

  test("gallery covers are unique across galleries (by content hash)", async ({
    baseURL,
    request,
  }) => {
    const manifest = await loadManifest(baseURL!);
    expect(manifest.galleries.length).toBeGreaterThan(1);

    // 1. No two galleries share the same cover path
    const pathCounts = new Map<string, number>();
    for (const g of manifest.galleries) {
      pathCounts.set(g.cover, (pathCounts.get(g.cover) || 0) + 1);
    }
    const dupPaths = [...pathCounts.entries()].filter(([, n]) => n > 1);
    expect(dupPaths, `duplicate cover paths: ${JSON.stringify(dupPaths)}`).toEqual([]);

    // 2. No two galleries' covers share the same bytes (content-level dedup)
    const hashes = await Promise.all(
      manifest.galleries.map(async (g) => {
        const r = await request.get(`${baseURL}${g.cover}`);
        expect(r.ok(), `failed to fetch ${g.cover}`).toBeTruthy();
        const buf = await r.body();
        const hash = createHash("sha1").update(buf).digest("hex");
        return { slug: g.slug, hash };
      })
    );
    const hashMap = new Map<string, string[]>();
    for (const { slug, hash } of hashes) {
      const arr = hashMap.get(hash) ?? [];
      arr.push(slug);
      hashMap.set(hash, arr);
    }
    const dupHashes = [...hashMap.values()].filter((slugs) => slugs.length > 1);
    expect(
      dupHashes,
      `galleries sharing identical cover bytes: ${JSON.stringify(dupHashes)}`
    ).toEqual([]);
  });

  test("global search filters galleries", async ({ page, baseURL }) => {
    const manifest = await loadManifest(baseURL!);
    expect(manifest.galleries.length).toBeGreaterThan(1);
    const target = manifest.galleries[0];
    // Use the first 4 chars of the slug as a query — likely unique enough.
    const query = target.slug.slice(0, 4);

    await page.goto("/");
    await page.getByRole("textbox").first().fill(query);
    await expect(
      page.locator(`a[href="/g/${target.slug}"]`).first()
    ).toBeVisible({ timeout: 10_000 });
  });
});
