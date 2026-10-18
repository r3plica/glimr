import { test, expect, type Page } from "@playwright/test";

interface ManifestGallery {
  slug: string;
  title: string;
  imageCount: number;
}
interface ManifestShape {
  galleries: ManifestGallery[];
}

async function loadGalleries(baseURL: string): Promise<ManifestGallery[]> {
  const r = await fetch(`${baseURL}/manifest.json`);
  return ((await r.json()) as ManifestShape).galleries;
}

async function resetState(page: Page) {
  await page.goto("/");
  await page.evaluate(() => {
    window.localStorage.removeItem("glimr.visited.v1");
    window.localStorage.removeItem("glimr.favorites.v1");
    window.localStorage.removeItem("glimr.visitedFilter.v1");
  });
}

test.describe("Regressions", () => {
  test.beforeEach(async ({ page }) => {
    await resetState(page);
  });

  test("an unviewed catalogue entry remains reachable when the other galleries are viewed", async ({
    page,
    baseURL,
  }) => {
    const galleries = await loadGalleries(baseURL!);
    const [first] = galleries;
    expect(new Set(galleries.map((g) => g.slug)).size).toBe(galleries.length);
    await page.evaluate((viewed) => {
      window.localStorage.setItem("glimr.visited.v1", JSON.stringify(viewed));
      window.localStorage.setItem("glimr.visitedFilter.v1", "unviewed");
    }, galleries.slice(1).map((g) => g.slug));
    await page.reload();
    const cards = page.getByTestId("gallery-card");
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAttribute("href", `/g/${first.slug}`);
    await cards.first().click();
    await expect(page.getByRole("heading", { name: first.title })).toBeVisible();
    await page.goto("/");
    await expect(page.getByText("Every gallery has been viewed.")).toBeVisible();
  });

  test("Favorites card is shown on the Unviewed and Viewed filters", async ({
    page,
    baseURL,
  }) => {
    const [first] = await loadGalleries(baseURL!);
    await page.goto(`/g/${first.slug}`);
    await expect(page.getByRole("heading", { name: first.title })).toBeVisible();
    await page.getByTestId("heart-button").first().click({ force: true });

    await page.goto("/");
    const filter = page.getByTestId("visited-filter");
    await expect(filter).toHaveAttribute("data-state", "all");
    await expect(page.getByTestId("favorites-card")).toBeVisible();

    await filter.click();
    await expect(filter).toHaveAttribute("data-state", "unviewed");
    await expect(page.getByTestId("favorites-card")).toBeVisible();

    await filter.click();
    await expect(filter).toHaveAttribute("data-state", "viewed");
    await expect(page.getByTestId("favorites-card")).toBeVisible();
  });

  test("Page Down scrolls a gallery without clicking the grid first", async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize({ width: 800, height: 500 });
    const gallery = (await loadGalleries(baseURL!)).find((g) => g.imageCount >= 20);
    if (!gallery) throw new Error("Page Down regression requires a gallery with at least 20 images.");
    await page.goto(`/g/${gallery.slug}`);
    await expect(page.getByRole("heading", { name: gallery.title })).toBeVisible();
    await page.locator("button:has(img[alt])").first().waitFor();

    await page.keyboard.press("PageDown");

    await expect
      .poll(() =>
        page.evaluate(() => {
          const scrollers = Array.from(
            document.querySelectorAll<HTMLElement>("*")
          ).map((el) => el.scrollTop);
          return Math.max(window.scrollY, ...scrollers);
        })
      )
      .toBeGreaterThan(0);
  });
});
