import type { GalleryImage } from "../types";
import type { FilterState, SortKey } from "../components/FilterBar";

export function shuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sortImages(images: GalleryImage[], sort: SortKey, seed: number): GalleryImage[] {
  switch (sort) {
    case "name-asc":
      return images
        .slice()
        .sort((a, b) =>
          a.filename.localeCompare(b.filename, undefined, { numeric: true })
        );
    case "name-desc":
      return images
        .slice()
        .sort((a, b) =>
          b.filename.localeCompare(a.filename, undefined, { numeric: true })
        );
    case "size-desc":
      return images
        .slice()
        .sort(
          (a, b) =>
            (b.width || 0) * (b.height || 0) -
            (a.width || 0) * (a.height || 0)
        );
    case "size-asc":
      return images
        .slice()
        .sort(
          (a, b) =>
            (a.width || 0) * (a.height || 0) -
            (b.width || 0) * (b.height || 0)
        );
    case "random":
      return shuffle(images, seed);
    default:
      return images.slice();
  }
}

export function applyFilters(
  images: GalleryImage[],
  f: FilterState,
  shuffleSeed: number
): GalleryImage[] {
  let out = images;
  if (f.orientation !== "any") {
    out = out.filter((i) => (i.orientation || "unknown") === f.orientation);
  }
  if (f.size !== "any") {
    out = out.filter((i) => (i.sizeBucket || "unknown") === f.size);
  }
  return sortImages(out, f.sort, shuffleSeed);
}
