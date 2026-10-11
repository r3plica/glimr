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
npm run galleries:duplicates   # optional: find duplicate gallery folders
npm run galleries:prepare      # probe/hash images and write the catalogue
npm run dev
```

Then open http://localhost:5174. The home page shows 24 galleries per page; the page number and search query live in the URL (`?page=2&q=...`), so Back returns you to where you were.

## Preparing galleries

Image probing and hashing happen offline, not on every start. Rerun the scripts whenever you add, remove or change gallery folders, then restart `npm run dev`. `npm run dev` refuses to start if the prepared data is missing or in an old format, and warns when gallery folders are newer than it.

- `npm run galleries:duplicates` (`scripts/find-duplicates.ps1`) hashes **every image** with SHA-256 and compares complete sorted lists of hashes, including repeated-image counts. Only galleries with identical image bytes are written to `data/duplicates.json`: the alphabetically first folder is the `root`, the rest are `duplicates`, and `contentSha256` is the full-gallery signature. Filenames and image order do not affect matching. Shared first images alone never qualify; resized or recompressed images are not exact duplicates. The scan rereads files rather than trusting cached hashes, so it can take longer on large collections. Unreadable files are reported and make the command fail; affected galleries are excluded rather than partially compared.
- `npm run galleries:prepare` (`scripts/prepare-galleries.mjs`) probes and hashes every image (cached in `data/image-cache.json`, so reruns only process new or changed files). It verifies each candidate group by comparing the folders' **full** contents: only byte-identical galleries are merged into the canonical gallery, and the merged folder's old URL redirects to it. Rejected candidates and unreadable images are listed in `data/prepare-report.json`. It writes:
  - `public/manifest.json` — lightweight catalogue used by the home page
  - `public/data/galleries/<slug>.json` — per-gallery image lists, loaded when a gallery is opened
  - `public/data/search-index.json` — image filenames/tags, loaded only when searching from the home page

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

4. Run `npm run galleries:prepare` (and `npm run galleries:duplicates` first if you want duplicate detection), then restart `npm run dev`.

## Scripts

- `npm run dev` — start Vite dev server (checks the prepared data first)
- `npm run build` — type-check + build (uses the already-prepared data)
- `npm run galleries:duplicates` — find byte-identical gallery folders
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
scripts/find-duplicates.ps1   full-content duplicate finder -> data/duplicates.json
scripts/prepare-galleries.mjs probes/hashes images -> public/manifest.json, public/data/
scripts/check-prepared.mjs    predev check that prepared data exists and is current
src/components/               UI components
src/pages/                    Home, GalleryView, Favorites
src/lib/                      manifest loading, search (Fuse.js), zip (JSZip), storage adapter
```

## Swapping storage backend

Edit `src/lib/storage.ts` — `resolveUrl()` and `thumbUrl()` return the URL to fetch for a given `src`. Point them at Cloudinary, S3, or any CDN. The manifest's `src` values become opaque IDs you transform there.
