import Fuse from "fuse.js";
import type { Gallery, GalleryImage } from "../types";

export interface GlobalHit {
  type: "gallery" | "image";
  gallery: Gallery;
  image?: GalleryImage;
  score?: number;
}

interface FlatRow {
  type: "gallery" | "image";
  gallerySlug: string;
  galleryTitle: string;
  galleryDescription: string;
  galleryTags: string;
  imageFilename: string;
  imageTags: string;
}

export function buildGlobalIndex(galleries: Gallery[]) {
  const rows: { row: FlatRow; gallery: Gallery; image?: GalleryImage }[] = [];
  for (const g of galleries) {
    rows.push({
      gallery: g,
      row: {
        type: "gallery",
        gallerySlug: g.slug,
        galleryTitle: g.title,
        galleryDescription: g.description || "",
        galleryTags: (g.tags || []).join(" "),
        imageFilename: "",
        imageTags: "",
      },
    });
    for (const img of g.images) {
      rows.push({
        gallery: g,
        image: img,
        row: {
          type: "image",
          gallerySlug: g.slug,
          galleryTitle: g.title,
          galleryDescription: g.description || "",
          galleryTags: (g.tags || []).join(" "),
          imageFilename: img.filename,
          imageTags: (img.tags || []).join(" "),
        },
      });
    }
  }
  const fuse = new Fuse(rows, {
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true,
    keys: [
      { name: "row.galleryTitle", weight: 3 },
      { name: "row.galleryDescription", weight: 1 },
      { name: "row.galleryTags", weight: 2 },
      { name: "row.imageFilename", weight: 2 },
      { name: "row.imageTags", weight: 2 },
    ],
  });
  return { fuse, rows };
}

export function searchGlobal(
  galleries: Gallery[],
  query: string
): GlobalHit[] {
  if (!query.trim()) {
    return galleries.map((g) => ({ type: "gallery" as const, gallery: g }));
  }
  const { fuse } = buildGlobalIndex(galleries);
  return fuse.search(query).map((r) => ({
    type: r.item.row.type,
    gallery: r.item.gallery,
    image: r.item.image,
    score: r.score,
  }));
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
