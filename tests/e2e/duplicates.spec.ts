import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

interface ManifestGallery {
  slug: string;
  title: string;
  cover: string;
}

interface DuplicateMarks {
  version: 1;
  sets: { id: string; slugs: string[]; createdAt: string }[];
}

const API = "/api/duplicate-marks";

async function loadGalleries(request: APIRequestContext): Promise<ManifestGallery[]> {
  const res = await request.get("/manifest.json");
  return ((await res.json()) as { galleries: ManifestGallery[] }).galleries;
}

async function readMarks(request: APIRequestContext): Promise<DuplicateMarks> {
  return (await (await request.get(API)).json()) as DuplicateMarks;
}

async function writeMarks(request: APIRequestContext, marks: DuplicateMarks) {
  const res = await request.put(API, { data: marks });
  expect(res.ok()).toBe(true);
}

async function chooseMenuItem(page: Page, name: string | RegExp) {
  await page.getByTestId("duplicate-menu-button").click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

// These tests share the user's data/duplicate-marks.json, so they run in order
// and restore whatever marks existed before the suite.
test.describe.configure({ mode: "serial" });

test.describe("Duplicate marks", () => {
  let saved: DuplicateMarks;
  let galleries: ManifestGallery[];

  test.beforeAll(async ({ request }) => {
    saved = await readMarks(request);
    galleries = await loadGalleries(request);
  });

  test.afterAll(async ({ request }) => {
    await writeMarks(request, saved);
  });

  test.beforeEach(async ({ request }) => {
    await writeMarks(request, { version: 1, sets: [] });
  });

  test("a gallery can be marked before its match is found", async ({ page, request }) => {
    test.skip(galleries.length < 1, "No galleries in this collection");
    const [first] = galleries;

    await page.goto(`/g/${first.slug}`);
    await chooseMenuItem(page, "Start a new duplicate set");
    await expect(page.getByRole("button", { name: "Marked as duplicate — no match yet" })).toBeVisible();
    await expect.poll(async () => (await readMarks(request)).sets.map((s) => s.slugs)).toEqual([[first.slug]]);

    await page.goto("/");
    await page.getByRole("link", { name: "Duplicates (1 set)" }).click();
    await expect(page).toHaveURL(/\/duplicates$/);
    const set = page.getByTestId("duplicate-set");
    await expect(set).toHaveCount(1);
    await expect(set.getByText("Waiting for a match")).toBeVisible();
    await expect(set.getByRole("link", { name: first.title })).toHaveAttribute("href", `/g/${first.slug}`);
  });

  test("galleries joined into a set are ready to merge and can be separated again", async ({
    page,
    request,
  }) => {
    test.skip(galleries.length < 3, "Needs at least three galleries");
    const [first, second, third] = galleries;
    await writeMarks(request, {
      version: 1,
      sets: [
        { id: "first", slugs: [first.slug], createdAt: new Date().toISOString() },
        { id: "unrelated", slugs: [third.slug], createdAt: new Date().toISOString() },
      ],
    });

    await page.goto(`/g/${second.slug}`);
    await chooseMenuItem(page, `Add to set with ${first.title}`);
    await expect(page.getByRole("button", { name: "In a duplicate set with 1 other galleries" })).toBeVisible();
    await expect
      .poll(async () => (await readMarks(request)).sets.map((s) => [s.id, s.slugs]))
      .toEqual([
        ["first", [first.slug, second.slug]],
        ["unrelated", [third.slug]],
      ]);

    await page.goto("/duplicates");
    const sets = page.getByTestId("duplicate-set");
    await expect(sets).toHaveCount(2);
    await expect(sets.nth(0).getByText("Ready to merge")).toBeVisible();
    await expect(sets.nth(1).getByText("Waiting for a match")).toBeVisible();

    await sets.nth(0).getByRole("button", { name: `Remove ${second.title} from set` }).click();
    await expect(sets.nth(0).getByText("Waiting for a match")).toBeVisible();

    await sets.nth(1).getByRole("button", { name: "Delete set" }).click();
    await expect(sets).toHaveCount(1);
    await expect
      .poll(async () => (await readMarks(request)).sets.map((s) => s.slugs))
      .toEqual([[first.slug]]);
  });

  test("the duplicates page explains how to start when nothing is marked", async ({ page }) => {
    await page.goto("/duplicates");
    await expect(page.getByRole("heading", { name: "Duplicate sets" })).toBeVisible();
    await expect(page.getByText("No duplicate sets yet")).toBeVisible();
  });
});

test.describe("Favourites of merged galleries", () => {
  test("a favourite saved before its image moved still shows the moved image", async ({
    page,
    request,
  }) => {
    const [first] = await loadGalleries(request);
    test.skip(!first, "No galleries in this collection");
    const oldSrc = "/galleries/__merged-away__/old-image.jpg";

    await page.route("**/data/moved-images.json", (route) =>
      route.fulfill({ json: { formatVersion: 2, images: { [oldSrc]: first.cover } } })
    );
    await page.goto("/");
    await page.evaluate((src) => {
      const image = {
        src,
        filename: "old-image.jpg",
        tags: [],
        sourceUrl: null,
        width: 0,
        height: 0,
        orientation: "unknown",
        sizeSeg: null,
        sizeBucket: "unknown",
      };
      window.localStorage.setItem(
        "glimr.favorites.v1",
        JSON.stringify([
          { gallerySlug: "__merged-away__", galleryTitle: "Merged away", filename: "old-image.jpg", image, addedAt: 1 },
        ])
      );
    }, oldSrc);

    await page.goto("/favorites");
    const thumb = page.locator(`img[src="${first.cover}"]`).first();
    await expect(thumb).toBeAttached();
    await expect(page.locator(`img[src="${oldSrc}"]`)).toHaveCount(0);
    await page.evaluate(() => window.localStorage.removeItem("glimr.favorites.v1"));
  });
});
