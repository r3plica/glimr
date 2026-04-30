import { test, expect } from "@playwright/test";

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

test.describe("Gallery navigation", () => {
  test("Next button advances to the next gallery in manifest order", async ({
    page,
    baseURL,
  }) => {
    const galleries = await loadGalleries(baseURL!);
    const [first, second] = galleries;

    await page.goto(`/g/${first.slug}`);
    await expect(
      page.getByRole("heading", { name: first.title })
    ).toBeVisible();

    await page.getByTestId("next-gallery").click();
    await expect(page).toHaveURL(new RegExp(`/g/${second.slug}$`));
    await expect(
      page.getByRole("heading", { name: second.title })
    ).toBeVisible();
  });

  test("Prev button on the first gallery wraps to the last", async ({
    page,
    baseURL,
  }) => {
    const galleries = await loadGalleries(baseURL!);
    const first = galleries[0];
    const last = galleries[galleries.length - 1];

    await page.goto(`/g/${first.slug}`);
    await expect(
      page.getByRole("heading", { name: first.title })
    ).toBeVisible();

    await page.getByTestId("prev-gallery").click();
    await expect(page).toHaveURL(new RegExp(`/g/${last.slug}$`));
    await expect(
      page.getByRole("heading", { name: last.title })
    ).toBeVisible();
  });

  test("Right arrow key advances when not focused in an input", async ({
    page,
    baseURL,
  }) => {
    const galleries = await loadGalleries(baseURL!);
    const [first, second] = galleries;

    await page.goto(`/g/${first.slug}`);
    await expect(
      page.getByRole("heading", { name: first.title })
    ).toBeVisible();

    await page.locator("body").click();
    await page.keyboard.press("ArrowRight");

    await expect(page).toHaveURL(new RegExp(`/g/${second.slug}$`));
  });

  test("Arrow keys are ignored while typing in the search input", async ({
    page,
    baseURL,
  }) => {
    const galleries = await loadGalleries(baseURL!);
    const first = galleries[0];

    await page.goto(`/g/${first.slug}`);
    await expect(
      page.getByRole("heading", { name: first.title })
    ).toBeVisible();

    const search = page.getByPlaceholder("Search this gallery...");
    await search.click();
    await search.press("ArrowRight");
    await search.press("ArrowLeft");

    await expect(page).toHaveURL(new RegExp(`/g/${first.slug}$`));
    await expect(
      page.getByRole("heading", { name: first.title })
    ).toBeVisible();
  });

  test("Advancing scrolls the grid back to the top", async ({
    page,
    baseURL,
  }) => {
    const galleries = await loadGalleries(baseURL!);
    const [first, second] = galleries;

    await page.goto(`/g/${first.slug}`);
    await expect(
      page.getByRole("heading", { name: first.title })
    ).toBeVisible();

    const scroller = page.locator('[data-testid="virtuoso-scroller"]').first();
    const fallback = scroller.or(
      page.locator("div").filter({ has: page.locator("img") }).first()
    );

    await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll<HTMLElement>("*"));
      const target = all.find(
        (el) => el.scrollHeight > el.clientHeight + 50 && el.clientHeight > 100
      );
      if (target) target.scrollTop = 1500;
    });

    await page.getByTestId("next-gallery").click();
    await expect(page).toHaveURL(new RegExp(`/g/${second.slug}$`));
    await expect(
      page.getByRole("heading", { name: second.title })
    ).toBeVisible();

    const topScroll = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll<HTMLElement>("*"));
      const scrollers = all.filter(
        (el) => el.scrollHeight > el.clientHeight + 50 && el.clientHeight > 100
      );
      return scrollers.map((el) => el.scrollTop);
    });
    for (const s of topScroll) {
      expect(s).toBeLessThan(50);
    }
    await fallback.first().waitFor({ state: "attached" });
  });
});
