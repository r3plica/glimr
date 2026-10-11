# Glimr

A private, local-first image gallery web app. Drop folders of images into `public/galleries/`, run the dev server, and you get:

- A browsable home view of all galleries with search across gallery names, descriptions, tags, and image filenames/tags
- Per-gallery view with a search box scoped to that gallery
- Click an image to open a full-screen dialog with **zoom & pan**
- **Slideshow** with prev/next, keyboard arrows, play/pause, and configurable interval
- **Download an entire gallery** as a ZIP (client-side via JSZip)
- **Download a single image**

Built with Vite + React + TypeScript + Tailwind CSS. Storage is currently local; a tiny `src/lib/storage.ts` adapter lets you swap to Cloudinary/S3/etc later without touching UI components.

## Getting started

```bash
npm install
npm run galleries:duplicates   # optional: preview merging duplicate galleries (add -- --apply to merge)
npm run galleries:prepare      # probe/hash images and write the catalogue
npm run dev
```

Then open http://localhost:5174. The home page shows 24 galleries per page; the page number and search query live in the URL (`?page=2&q=...`), so Back returns you to where you were.

## Preparing galleries

Image probing and hashing happen offline, not on every start. Rerun the scripts whenever you add, remove or change gallery folders, then restart `npm run dev`. `npm run dev` refuses to start if the prepared data is missing or in an old format, and warns when gallery folders are newer than it.

- `npm run galleries:duplicates` (`scripts/merge-duplicates.mjs`) finds duplicate galleries and **physically merges** them. Two galleries are related when the images they share (SHA-256, cached in `data/image-cache.json`) make up at least 10% of the unique images of the larger one (`-- --threshold 0.2` changes this). Sets of two or more galleries you marked as duplicates in the app (see below) are always included. Related galleries are joined transitively into groups. By default the command only previews: it prints the groups and writes the full plan to `data/merge-plan.json`. With `-- --apply`, for each group:
  - the folder with the most images is kept;
  - every image it does not already contain is moved into it unchanged (a random suffix resolves a name clash);
  - the other folders, which now hold only repeated images and non-image files, are moved to `data/merged-originals/<timestamp>/` — delete them once you are happy;
  - old gallery slugs and image paths are recorded in `data/folder-aliases.json`, so old gallery URLs redirect and favourites keep working.

  Then run `npm run galleries:prepare`.
- `npm run galleries:prepare` (`scripts/prepare-galleries.mjs`) probes and hashes every image (cached in `data/image-cache.json`, so reruns only process new or changed files). It never modifies gallery folders. Merged galleries' old slugs from `data/folder-aliases.json` redirect to the folder they were merged into. Unreadable images are listed in `data/prepare-report.json`. It writes:
  - `public/manifest.json` — lightweight catalogue used by the home page
  - `public/data/galleries/<slug>.json` — per-gallery image lists, loaded when a gallery is opened
  - `public/data/search-index.json` — image filenames/tags, loaded only when searching from the home page
  - `public/data/moved-images.json` — old image paths of merged galleries, used to show existing favourites

## Marking duplicates

While `npm run dev` (or `npm run preview`) is running, use **Mark as duplicate** on a gallery page to start a duplicate set or add the gallery to an existing one. A set may hold a single gallery while you look for its match, and you can keep any number of unrelated sets. The **Duplicates** link on the home page shows how many sets you have and opens `/duplicates`, where you can remove galleries, delete sets or merge sets. Marks are saved to `data/duplicate-marks.json`. The next `npm run galleries:duplicates -- --apply` merges every set with two or more galleries and removes it; single-gallery sets keep waiting.

## Adding a gallery

1. Create a folder under `public/galleries/`, e.g. `public/galleries/holiday-2024/`.
2. Drop image files into it (`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.avif`).
3. (Optional) Add a `meta.json`:

   ```json
   {
     "title": "Holiday 2024",
     "description": "Summer trip photos",
     "tags": ["travel", "summer", "2024"],
     "cover": "IMG_0123.jpg",
     "imageTags": {
       "IMG_0123.jpg": ["beach", "sunset"]
     }
   }
   ```

4. Run `npm run galleries:prepare` (and `npm run galleries:duplicates -- --apply` first if you want duplicates merged), then restart `npm run dev`.

## Scripts

- `npm run dev` — start Vite dev server (checks the prepared data first)
- `npm run build` — type-check + build (uses the already-prepared data)
- `npm run galleries:duplicates` — preview merging duplicate galleries; `-- --apply` merges them
- `npm run galleries:prepare` — regenerate the catalogue, gallery data and search index
- `npm run preview` — preview the production build
- `npm run lint` — run ESLint
- `npm run test` / `npm run test:e2e` — unit (Vitest) / end-to-end (Playwright) tests

## Keyboard shortcuts (image dialog)

- `←` / `→` — previous / next image
- `Space` — toggle slideshow play/pause
- `Esc` — close dialog
- Double-click image — toggle zoom; mouse wheel — zoom in/out

## Project structure

```
public/galleries/<name>/      image files (+ optional meta.json, urls.txt)
scripts/merge-duplicates.mjs  merges duplicate galleries -> data/folder-aliases.json
scripts/prepare-galleries.mjs probes/hashes images -> public/manifest.json, public/data/
scripts/check-prepared.mjs    predev check that prepared data exists and is current
src/components/               UI components
src/pages/                    Home, GalleryView, Favorites
src/lib/                      manifest loading, search (Fuse.js), zip (JSZip), storage adapter
```

## Swapping storage backend

Edit `src/lib/storage.ts` — `resolveUrl()` and `thumbUrl()` return the URL to fetch for a given `src`. Point them at Cloudinary, S3, or any CDN. The manifest's `src` values become opaque IDs you transform there.
