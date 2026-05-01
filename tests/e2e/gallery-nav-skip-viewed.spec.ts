import { test, expect, type Page } from "@playwright/test";

interface ManifestGallery {
  slug: string;
  title: string;
}
interface ManifestShape {
  galleries: ManifestGallery[];
}

async function loadGalleries(baseURL: string): Promise<ManifestGallery[]> {
  const r = await fetch(`${baseURL}/manifest.json`);
  const m = (await r.json()) as ManifestShape;
  return m.galleries;
}

async function setVisited(page: Page, baseURL: string, slugs: string[]) {
  await page.goto(`${baseURL}/`);
  await page.evaluate((s) => {
    window.localStorage.setItem("glimr.visited.v1", JSON.stringify(s));
  }, slugs);
}

async function clearVisited(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/`);
  await page.evaluate(() => {
    window.localStorage.removeItem("glimr.visited.v1");
    window.localStorage.removeItem("glimr.visitedFilter.v1");
  });
}

test.describe("Next gallery skips viewed", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await clearVisited(page, baseURL!);
  });

  test("Next skips already-viewed galleries to the next unviewed one", async ({
    page,
    baseURL,
  }) => {
    const galleries = await loadGalleries(baseURL!);
    test.skip(galleries.length < 4, "Need at least 4 galleries for this test");
    const [g0, g1, g2, g3] = galleries;

    // Pre-mark g1 and g2 as viewed; g0 will be marked when we land on it.
    await setVisited(page, baseURL!, [g1.slug, g2.slug]);

    await page.goto(`/g/${g0.slug}`);
    await expect(page.getByRole("heading", { name: g0.title })).toBeVisible();

    await page.getByTestId("next-gallery").click();
    await expect(page).toHaveURL(new RegExp(`/g/${g3.slug}$`));
    await expect(page.getByRole("heading", { name: g3.title })).toBeVisible();
  });

  test("Prev also skips already-viewed galleries", async ({
    page,
    baseURL,
  }) => {
    const galleries = await loadGalleries(baseURL!);
    test.skip(galleries.length < 4, "Need at least 4 galleries for this test");
    const last = galleries[galleries.length - 1];
    const secondLast = galleries[galleries.length - 2];
    const thirdLast = galleries[galleries.length - 3];
    const fourthLast = galleries[galleries.length - 4];

    // Pre-mark second-to-last and third-to-last as viewed.
    await setVisited(page, baseURL!, [secondLast.slug, thirdLast.slug]);

    await page.goto(`/g/${last.slug}`);
    await expect(page.getByRole("heading", { name: last.title })).toBeVisible();

    await page.getByTestId("prev-gallery").click();
    await expect(page).toHaveURL(new RegExp(`/g/${fourthLast.slug}$`));
    await expect(
      page.getByRole("heading", { name: fourthLast.title })
    ).toBeVisible();
  });

  test("When all other galleries are viewed, Next falls back to simple wrap", async ({
    page,
    baseURL,
  }) => {
    const galleries = await loadGalleries(baseURL!);
    test.skip(galleries.length < 2, "Need at least 2 galleries");
    const [g0, g1] = galleries;

    // Mark every gallery as viewed.
    await setVisited(
      page,
      baseURL!,
      galleries.map((g) => g.slug)
    );

    await page.goto(`/g/${g0.slug}`);
    await expect(page.getByRole("heading", { name: g0.title })).toBeVisible();

    await page.getByTestId("next-gallery").click();
    await expect(page).toHaveURL(new RegExp(`/g/${g1.slug}$`));
  });
});
