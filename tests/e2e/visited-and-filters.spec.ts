import { test, expect, type Page } from "@playwright/test";

interface ManifestGallery {
  slug: string;
  title: string;
  images: { filename: string; orientation?: string; sizeBucket?: string }[];
}
interface ManifestShape {
  galleries: ManifestGallery[];
}

async function manifest(baseURL: string): Promise<ManifestShape> {
  const r = await fetch(`${baseURL}/manifest.json`);
  return (await r.json()) as ManifestShape;
}

async function clearGlimrState(page: Page, baseURL: string) {
  await page.goto(`${baseURL}/`);
  await page.evaluate(() => {
    try {
      window.localStorage.removeItem("glimr.visited.v1");
      window.localStorage.removeItem("glimr.favorites.v1");
      window.localStorage.removeItem("glimr.visitedFilter.v1");
    } catch {
      /* ignore */
    }
  });
}

test.describe("Visited galleries", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await clearGlimrState(page, baseURL!);
  });

  test("opening a gallery marks it as viewed and shows the badge on Home", async ({
    page,
    baseURL,
  }) => {
    const m = await manifest(baseURL!);
    const slug = m.galleries[0].slug;

    await page.goto(`/`);
    const card = page
      .locator(`[data-testid="gallery-card"][href="/g/${slug}"]`)
      .first();
    await expect(card).toHaveAttribute("data-visited", "false");

    await page.goto(`/g/${slug}`);
    await expect(
      page.getByRole("heading", { name: m.galleries[0].title })
    ).toBeVisible();

    await page.goto(`/`);
    const cardAfter = page
      .locator(`[data-testid="gallery-card"][href="/g/${slug}"]`)
      .first();
    await expect(cardAfter).toHaveAttribute("data-visited", "true");
    await expect(cardAfter.locator('[data-testid="visited-badge"]')).toBeVisible();
  });

  test("visited filter cycles All -> Unviewed -> Viewed -> All", async ({
    page,
    baseURL,
  }) => {
    const m = await manifest(baseURL!);
    const slug = m.galleries[0].slug;

    await page.goto(`/g/${slug}`);
    await expect(
      page.getByRole("heading", { name: m.galleries[0].title })
    ).toBeVisible();

    await page.goto(`/`);
    const filter = page.getByTestId("visited-filter");
    await expect(filter).toHaveAttribute("data-state", "all");

    await filter.click();
    await expect(filter).toHaveAttribute("data-state", "unviewed");
    await expect(
      page.locator(`[data-testid="gallery-card"][href="/g/${slug}"]`)
    ).toHaveCount(0);

    await filter.click();
    await expect(filter).toHaveAttribute("data-state", "viewed");
    await expect(
      page.locator(`[data-testid="gallery-card"][href="/g/${slug}"]`)
    ).toBeVisible();

    await filter.click();
    await expect(filter).toHaveAttribute("data-state", "all");
  });

  test("visited filter is remembered across reloads", async ({ page }) => {
    await page.goto(`/`);
    const filter = page.getByTestId("visited-filter");
    await expect(filter).toHaveAttribute("data-state", "all");

    await filter.click();
    await expect(filter).toHaveAttribute("data-state", "unviewed");

    await page.reload();
    await expect(page.getByTestId("visited-filter")).toHaveAttribute(
      "data-state",
      "unviewed"
    );

    await page.getByTestId("visited-filter").click();
    await expect(page.getByTestId("visited-filter")).toHaveAttribute(
      "data-state",
      "viewed"
    );

    await page.goto(`/`);
    await expect(page.getByTestId("visited-filter")).toHaveAttribute(
      "data-state",
      "viewed"
    );
  });
});

test.describe("Image dialog UX", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await clearGlimrState(page, baseURL!);
  });

  test("clicking the backdrop closes the dialog", async ({ page, baseURL }) => {
    const m = await manifest(baseURL!);
    const slug = m.galleries[0].slug;

    await page.goto(`/g/${slug}`);
    await page.locator("button:has(img[alt])").first().click();
    await expect(page.getByRole("button", { name: /close/i })).toBeVisible();

    const backdrop = page.getByTestId("dialog-backdrop");
    const box = await backdrop.boundingBox();
    if (!box) throw new Error("no backdrop bounding box");
    await page.mouse.click(box.x + 5, box.y + 5);

    await expect(page.getByRole("button", { name: /close/i })).toHaveCount(0);
  });

  test("panning while zoomed does not close the dialog", async ({
    page,
    baseURL,
  }) => {
    const m = await manifest(baseURL!);
    const slug = m.galleries[0].slug;

    await page.goto(`/g/${slug}`);
    await page.locator("button:has(img[alt])").first().click();
    await expect(page.getByRole("button", { name: /close/i })).toBeVisible();

    // Zoom in twice via toolbar so panning is meaningful.
    await page.getByRole("button", { name: /zoom in/i }).click();
    await page.getByRole("button", { name: /zoom in/i }).click();

    const backdrop = page.getByTestId("dialog-backdrop");
    const box = await backdrop.boundingBox();
    if (!box) throw new Error("no backdrop bounding box");

    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    // Drag from center toward an edge; release should land on a
    // backdrop area but must not close the dialog because we panned.
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 200, cy + 150, { steps: 15 });
    await page.mouse.up();

    await expect(page.getByRole("button", { name: /close/i })).toBeVisible();
  });

  test("a single mouse wheel tick does not jump zoom to the maximum", async ({
    page,
    baseURL,
  }) => {
    const m = await manifest(baseURL!);
    const slug = m.galleries[0].slug;

    await page.goto(`/g/${slug}`);
    await page.locator("button:has(img[alt])").first().click();
    await expect(page.getByRole("button", { name: /close/i })).toBeVisible();

    // Dispatch a single wheel event on the transform wrapper. Using
    // dispatchEvent avoids platform-specific quirks of page.mouse.wheel.
    await page.evaluate(() => {
      const wrapper = document.querySelector(
        ".react-transform-wrapper"
      ) as HTMLElement | null;
      if (!wrapper) throw new Error("no transform wrapper");
      const rect = wrapper.getBoundingClientRect();
      const ev = new WheelEvent("wheel", {
        deltaY: -100,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        bubbles: true,
        cancelable: true,
      });
      wrapper.dispatchEvent(ev);
    });

    // Allow rzpp's animation frame to apply the transform.
    await page.waitForTimeout(300);

    const scale = await page.evaluate(() => {
      const el = document.querySelector(
        ".react-transform-component"
      ) as HTMLElement | null;
      if (!el) return 1;
      const t = window.getComputedStyle(el).transform;
      if (!t || t === "none") return 1;
      const match = t.match(/matrix\(([^,]+),/);
      return match ? parseFloat(match[1]) : 1;
    });

    expect(scale).toBeGreaterThan(1);
    expect(scale).toBeLessThan(1.5);
  });
});

test.describe("Gallery image filters", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await clearGlimrState(page, baseURL!);
  });

  test("Size filter actually narrows results when buckets exist", async ({
    page,
    baseURL,
  }) => {
    const m = await manifest(baseURL!);

    const target = m.galleries.find((g) => {
      const buckets = new Set(g.images.map((i) => i.sizeBucket));
      return buckets.size > 1;
    });
    test.skip(!target, "No gallery has mixed size buckets to test");
    if (!target) return;

    await page.goto(`/g/${target.slug}`);
    await expect(
      page.getByRole("heading", { name: target.title })
    ).toBeVisible();

    const counts: Record<string, number> = {};
    for (const i of target.images) {
      const k = i.sizeBucket || "unknown";
      counts[k] = (counts[k] || 0) + 1;
    }
    const knownBuckets = ["small", "medium", "large"].filter(
      (b) => (counts[b] || 0) > 0
    );
    const minorityBucket = knownBuckets.sort(
      (a, b) => counts[a] - counts[b]
    )[0];

    const totalLabel = page.getByText(
      new RegExp(`Showing ${target.images.length.toLocaleString()} of`)
    );
    await expect(totalLabel).toBeVisible();

    await page
      .getByRole("combobox", { name: /filter by size/i })
      .selectOption(minorityBucket);

    const expected = counts[minorityBucket].toLocaleString();
    const filteredLabel = page.getByText(
      new RegExp(`Showing ${expected} of ${target.images.length.toLocaleString()}`)
    );
    await expect(filteredLabel).toBeVisible();
    expect(counts[minorityBucket]).toBeLessThan(target.images.length);
  });

  test("Orientation filter narrows results", async ({ page, baseURL }) => {
    const m = await manifest(baseURL!);
    const target = m.galleries.find((g) => {
      const o = new Set(g.images.map((i) => i.orientation));
      return o.size > 1;
    });
    test.skip(!target, "No gallery has mixed orientations");
    if (!target) return;

    await page.goto(`/g/${target.slug}`);
    await expect(
      page.getByRole("heading", { name: target.title })
    ).toBeVisible();

    const portraits = target.images.filter(
      (i) => i.orientation === "portrait"
    ).length;
    test.skip(portraits === 0, "No portrait images in target gallery");
    if (portraits === 0) return;

    await page.getByRole("button", { name: "Portrait", exact: true }).click();

    const expected = portraits.toLocaleString();
    await expect(
      page.getByText(
        new RegExp(`Showing ${expected} of ${target.images.length.toLocaleString()}`)
      )
    ).toBeVisible();
  });
});
