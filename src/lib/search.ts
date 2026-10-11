import Fuse from "fuse.js";
import type { GallerySummary, GalleryImage, SearchIndex } from "../types";

export interface GlobalHit {
  type: "gallery" | "image";
  gallery: GallerySummary;
  image?: GalleryImage;
  score?: number;
}

interface ImageOccurrence {
  slug: string;
  image: GalleryImage;
}

// Many galleries reuse the same filenames, so fuzzy-match each distinct
// filename/tags combination once and expand the matches to every occurrence.
interface UniqueImageRow {
  filename: string;
  tags: string[];
  occurrences: ImageOccurrence[];
}

const imageIndexes = new WeakMap<SearchIndex, Fuse<UniqueImageRow>>();
const galleryIndexes = new WeakMap<GallerySummary[], Fuse<GallerySummary>>();
const summaryMaps = new WeakMap<GallerySummary[], Map<string, GallerySummary>>();

function getImageIndex(index: SearchIndex) {
  const cached = imageIndexes.get(index);
  if (cached) return cached;
  const rows = new Map<string, UniqueImageRow>();
  for (const detail of index.galleries) {
    for (const img of detail.images) {
      const tags = img.tags ?? [];
      const key = `${img.filename}\u0000${tags.join("\u0000")}`;
      let row = rows.get(key);
      if (!row) {
        row = { filename: img.filename, tags, occurrences: [] };
        rows.set(key, row);
      }
      row.occurrences.push({
        slug: detail.slug,
        image: {
          src: `/galleries/${detail.dir}/${img.filename}`,
          filename: img.filename,
          tags: img.tags,
        },
      });
    }
  }
  const fuse = new Fuse([...rows.values()], {
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true,
    keys: [
      { name: "filename", weight: 2 },
      { name: "tags", weight: 2 },
    ],
  });
  imageIndexes.set(index, fuse);
  return fuse;
}

function getGalleryIndex(galleries: GallerySummary[]) {
  let fuse = galleryIndexes.get(galleries);
  if (!fuse) {
    fuse = new Fuse(galleries, {
      includeScore: true,
      threshold: 0.4,
      ignoreLocation: true,
      keys: [
        { name: "title", weight: 3 },
        { name: "description", weight: 1 },
        { name: "tags", weight: 2 },
      ],
    });
    galleryIndexes.set(galleries, fuse);
  }
  return fuse;
}

function getSummaryMap(galleries: GallerySummary[]) {
  let map = summaryMaps.get(galleries);
  if (!map) {
    map = new Map(galleries.map((g) => [g.slug, g]));
    summaryMaps.set(galleries, map);
  }
  return map;
}

export function searchGlobal(
  galleries: GallerySummary[],
  index: SearchIndex | null,
  query: string
): GlobalHit[] {
  if (!query.trim()) {
    return galleries.map((gallery) => ({ type: "gallery", gallery }));
  }
  if (!index) return [];
  const hits: GlobalHit[] = getGalleryIndex(galleries)
    .search(query)
    .map((r) => ({ type: "gallery", gallery: r.item, score: r.score }));
  const summaries = getSummaryMap(galleries);
  for (const r of getImageIndex(index).search(query)) {
    for (const { slug, image } of r.item.occurrences) {
      const gallery = summaries.get(slug);
      if (gallery) hits.push({ type: "image", gallery, image, score: r.score });
    }
  }
  return hits.sort((a, b) => (a.score ?? 0) - (b.score ?? 0));
}

export function searchImages(
  images: GalleryImage[],
  query: string
): GalleryImage[] {
  if (!query.trim()) return images;
  const fuse = new Fuse(images, {
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true,
    keys: [
      { name: "filename", weight: 2 },
      { name: "tags", weight: 2 },
    ],
  });
  return fuse.search(query).map((r) => r.item);
}
