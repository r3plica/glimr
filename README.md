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
npm run dev
```

Then open http://localhost:5174.

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

4. Restart `npm run dev` (or run `npm run manifest`) — the manifest is regenerated automatically on dev/build.

## Scripts

- `npm run dev` — start Vite dev server (regenerates manifest first)
- `npm run build` — type-check + build (regenerates manifest first)
- `npm run manifest` — regenerate `src/data/manifest.json` only
- `npm run preview` — preview the production build
- `npm run lint` — run ESLint

## Keyboard shortcuts (image dialog)

- `←` / `→` — previous / next image
- `Space` — toggle slideshow play/pause
- `Esc` — close dialog
- Double-click image — toggle zoom; mouse wheel — zoom in/out

## Project structure

```
public/galleries/<name>/   image files (+ optional meta.json)
scripts/build-manifest.mjs scans public/galleries -> src/data/manifest.json
src/components/            UI components
src/pages/                 Home, GalleryView
src/lib/                   search (Fuse.js), zip (JSZip), storage adapter
```

## Swapping storage backend

Edit `src/lib/storage.ts` — `resolveUrl()` and `thumbUrl()` return the URL to fetch for a given `src`. Point them at Cloudinary, S3, or any CDN. The manifest's `src` values become opaque IDs you transform there.
