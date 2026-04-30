import { test, expect, type Page } from "@playwright/test";

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

async function clearFavorites(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/`);
  await page.evaluate(() => {
    try {
      window.localStorage.removeItem("glimr.favorites.v1");
    } catch {
      /* ignore */
    }
  });
}

async function readFavorites(page: Page): Promise<unknown[]> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("glimr.favorites.v1");
    return raw ? (JSON.parse(raw) as unknown[]) : [];
  });
}

test.describe("Favorites", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await clearFavorites(page, baseURL!);
  });

  test("hearts an image from a thumbnail and it appears on /favorites", async ({
    page,
    baseURL,
  }) => {
    const manifest = await loadManifest(baseURL!);
    const slug = manifest.galleries[0].slug;

    await page.goto(`/g/${slug}`);
    await expect(page.getByRole("button", { name: /slideshow/i })).toBeVisible();

    const heart = page.getByTestId("heart-button").first();
    await heart.waitFor({ state: "attached", timeout: 30_000 });
    await heart.click({ force: true });

    await expect(heart).toHaveAttribute("data-active", "true");

    const persisted = await readFavorites(page);
    expect(persisted).toHaveLength(1);

    await page.goto("/favorites");
    await expect(page.getByRole("heading", { name: "Favorites" })).toBeVisible();
    await expect(
      page.getByText(/^1 hearted image$/i)
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="heart-button"]').first()
    ).toHaveAttribute("data-active", "true");
  });

  test("hearts an image from the dialog toolbar", async ({ page, baseURL }) => {
    const manifest = await loadManifest(baseURL!);
    const slug = manifest.galleries[0].slug;

    await page.goto(`/g/${slug}`);
    await expect(page.getByRole("button", { name: /slideshow/i })).toBeVisible();

    const firstThumb = page.locator("button:has(img[alt])").first();
    await firstThumb.waitFor({ state: "visible", timeout: 30_000 });
    await firstThumb.click();
    await expect(page.getByRole("button", { name: /close/i })).toBeVisible();

    const dialogHeart = page
      .getByRole("button", { name: /add to favorites/i })
      .first();
    await dialogHeart.click();
    await expect(
      page.getByRole("button", { name: /remove from favorites/i }).first()
    ).toBeVisible();

    const persisted = await readFavorites(page);
    expect(persisted).toHaveLength(1);
  });

  test("toggles a favorite off (un-heart removes it)", async ({
    page,
    baseURL,
  }) => {
    const manifest = await loadManifest(baseURL!);
    const slug = manifest.galleries[0].slug;

    await page.goto(`/g/${slug}`);
    await expect(page.getByRole("button", { name: /slideshow/i })).toBeVisible();

    const heart = page.getByTestId("heart-button").first();
    await heart.waitFor({ state: "attached", timeout: 30_000 });
    await heart.click({ force: true });
    await expect(heart).toHaveAttribute("data-active", "true");
    expect(await readFavorites(page)).toHaveLength(1);

    await heart.click({ force: true });
    await expect(heart).toHaveAttribute("data-active", "false");
    expect(await readFavorites(page)).toHaveLength(0);
  });

  test("favorites persist across reload", async ({ page, baseURL }) => {
    const manifest = await loadManifest(baseURL!);
    const slug = manifest.galleries[0].slug;

    await page.goto(`/g/${slug}`);
    await expect(page.getByRole("button", { name: /slideshow/i })).toBeVisible();

    await page.getByTestId("heart-button").first().click({ force: true });
    expect(await readFavorites(page)).toHaveLength(1);

    await page.reload();
    expect(await readFavorites(page)).toHaveLength(1);

    await page.goto("/favorites");
    await expect(
      page.getByText(/^1 hearted image$/i)
    ).toBeVisible();
  });

  test("Favorites tile appears on Home only when favorites exist", async ({
    page,
    baseURL,
  }) => {
    await page.goto("/");
    await expect(page.getByTestId("favorites-card")).toHaveCount(0);

    const manifest = await loadManifest(baseURL!);
    const slug = manifest.galleries[0].slug;
    await page.goto(`/g/${slug}`);
    await expect(page.getByRole("button", { name: /slideshow/i })).toBeVisible();
    await page.getByTestId("heart-button").first().click({ force: true });

    await page.goto("/");
    await expect(page.getByTestId("favorites-card")).toBeVisible();
  });

  test("slideshow opens from /favorites", async ({ page, baseURL }) => {
    const manifest = await loadManifest(baseURL!);
    const slug = manifest.galleries[0].slug;
    await page.goto(`/g/${slug}`);
    await expect(page.getByRole("button", { name: /slideshow/i })).toBeVisible();
    await page.getByTestId("heart-button").first().click({ force: true });

    await page.goto("/favorites");
    await page.getByRole("button", { name: /slideshow/i }).click();
    await expect(page.getByRole("button", { name: /close/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /next image/i })
    ).toBeVisible();
  });
});
