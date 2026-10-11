import { test, expect, type Page } from "@playwright/test";

interface ManifestGallery {
  slug: string;
  title: string;
  aliases: string[];
}
interface ManifestShape {
  galleries: ManifestGallery[];
}

const PAGE_SIZE = 24;

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

const cards = (page: Page) => page.getByTestId("gallery-card");

test.describe("Home pagination", () => {
  test.beforeEach(async ({ page }) => {
    await resetState(page);
  });

  test("shows one page of galleries and pages forward via the URL", async ({
    page,
    baseURL,
  }) => {
    const galleries = await loadGalleries(baseURL!);
    test.skip(galleries.length <= PAGE_SIZE, "Need more than one page of galleries");

    await page.goto("/");
    await expect(cards(page)).toHaveCount(PAGE_SIZE);
    await expect(cards(page).first()).toHaveAttribute("href", `/g/${galleries[0].slug}`);
    const totalPages = Math.ceil(galleries.length / PAGE_SIZE);
    const nav = page.getByRole("navigation", { name: "Pagination" });
    await expect(nav.getByText(`Page 1 of ${totalPages}`)).toBeVisible();
    await expect(nav.getByRole("button", { name: "Previous page" })).toBeDisabled();

    await nav.getByRole("button", { name: "Next page" }).click();
    await expect(page).toHaveURL(/[?&]page=2\b/);
    await expect(cards(page).first()).toHaveAttribute(
      "href",
      `/g/${galleries[PAGE_SIZE].slug}`
    );
    await expect(nav.getByText(`Page 2 of ${totalPages}`)).toBeVisible();
  });

  test("returning from a gallery restores the page", async ({ page, baseURL }) => {
    const galleries = await loadGalleries(baseURL!);
    test.skip(galleries.length <= PAGE_SIZE, "Need more than one page of galleries");
    const target = galleries[PAGE_SIZE];

    await page.goto("/?page=2");
    await cards(page).first().click();
    await expect(page.getByRole("heading", { name: target.title })).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(/[?&]page=2\b/);
    await expect(cards(page).first()).toHaveAttribute("href", `/g/${target.slug}`);
  });

  test("changing the viewed filter returns to page 1", async ({ page, baseURL }) => {
    const galleries = await loadGalleries(baseURL!);
    test.skip(galleries.length <= PAGE_SIZE, "Need more than one page of galleries");

    await page.goto("/?page=2");
    await expect(cards(page).first()).toHaveAttribute(
      "href",
      `/g/${galleries[PAGE_SIZE].slug}`
    );

    await page.getByTestId("visited-filter").click();
    await expect(page.getByTestId("visited-filter")).toHaveAttribute("data-state", "unviewed");
    await expect(page).not.toHaveURL(/[?&]page=/);
    await expect(cards(page).first()).toHaveAttribute("href", `/g/${galleries[0].slug}`);
  });

  test("pages count only galleries matching the viewed filter", async ({
    page,
    baseURL,
  }) => {
    const galleries = await loadGalleries(baseURL!);
    test.skip(galleries.length < 2, "Need at least 2 galleries");
    const viewed = galleries.slice(0, Math.min(3, galleries.length - 1));
    await page.evaluate(
      (slugs) => window.localStorage.setItem("glimr.visited.v1", JSON.stringify(slugs)),
      viewed.map((g) => g.slug)
    );
    await page.evaluate(() => window.localStorage.setItem("glimr.visitedFilter.v1", "viewed"));

    await page.goto("/");
    await expect(cards(page)).toHaveCount(viewed.length);
    await expect(page.getByRole("navigation", { name: "Pagination" })).toHaveCount(0);
  });
});

test.describe("Merged duplicate galleries", () => {
  test.beforeEach(async ({ page }) => {
    await resetState(page);
  });

  test("a duplicate folder's URL redirects to its canonical gallery", async ({
    page,
    baseURL,
  }) => {
    const galleries = await loadGalleries(baseURL!);
    const merged = galleries.find((g) => g.aliases.length > 0);
    test.skip(!merged, "No duplicate galleries were merged in this collection");
    if (!merged) return;

    await page.goto(`/g/${merged.aliases[0]}`);
    await expect(page).toHaveURL(new RegExp(`/g/${merged.slug}$`));
    await expect(page.getByRole("heading", { name: merged.title })).toBeVisible();
  });

  test("viewing history from a duplicate folder counts for its canonical gallery", async ({
    page,
    baseURL,
  }) => {
    const galleries = await loadGalleries(baseURL!);
    const merged = galleries.find((g) => g.aliases.length > 0);
    test.skip(!merged, "No duplicate galleries were merged in this collection");
    if (!merged) return;

    await page.evaluate(
      (slug) => window.localStorage.setItem("glimr.visited.v1", JSON.stringify([slug])),
      merged.aliases[0]
    );
    await page.evaluate(() => window.localStorage.setItem("glimr.visitedFilter.v1", "viewed"));

    await page.goto("/");
    const card = page.locator(`[data-testid="gallery-card"][href="/g/${merged.slug}"]`);
    await expect(card).toHaveAttribute("data-visited", "true");
  });
});
