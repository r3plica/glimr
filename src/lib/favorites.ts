// localStorage-backed favorites store. A favorite is identified by
// `${gallerySlug}::${filename}` and we keep a snapshot of the resolved
// image so the favorites view still works if the source gallery is
// later removed or renamed.

import { useEffect, useState } from "react";
import type { GalleryImage } from "../types";

const STORAGE_KEY = "glimr.favorites.v1";
const EVENT = "glimr:favorites-changed";

export interface Favorite {
  gallerySlug: string;
  galleryTitle: string;
  filename: string;
  image: GalleryImage;
  addedAt: number;
}

export function favoriteKey(gallerySlug: string, filename: string): string {
  return `${gallerySlug}::${filename}`;
}

function readAll(): Favorite[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (f): f is Favorite =>
        f != null &&
        typeof f === "object" &&
        typeof (f as Favorite).gallerySlug === "string" &&
        typeof (f as Favorite).filename === "string" &&
        (f as Favorite).image != null
    );
  } catch {
    return [];
  }
}

function writeAll(list: Favorite[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // quota exceeded or storage disabled — nothing we can do
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function listFavorites(): Favorite[] {
  return readAll().sort((a, b) => b.addedAt - a.addedAt);
}

export function isFavorite(gallerySlug: string, filename: string): boolean {
  const key = favoriteKey(gallerySlug, filename);
  return readAll().some(
    (f) => favoriteKey(f.gallerySlug, f.filename) === key
  );
}

export function addFavorite(
  gallerySlug: string,
  galleryTitle: string,
  image: GalleryImage
): void {
  const key = favoriteKey(gallerySlug, image.filename);
  const list = readAll();
  if (list.some((f) => favoriteKey(f.gallerySlug, f.filename) === key)) return;
  list.push({
    gallerySlug,
    galleryTitle,
    filename: image.filename,
    image,
    addedAt: Date.now(),
  });
  writeAll(list);
}

export function removeFavorite(gallerySlug: string, filename: string): void {
  const key = favoriteKey(gallerySlug, filename);
  const next = readAll().filter(
    (f) => favoriteKey(f.gallerySlug, f.filename) !== key
  );
  writeAll(next);
}

export function toggleFavorite(
  gallerySlug: string,
  galleryTitle: string,
  image: GalleryImage
): boolean {
  if (isFavorite(gallerySlug, image.filename)) {
    removeFavorite(gallerySlug, image.filename);
    return false;
  }
  addFavorite(gallerySlug, galleryTitle, image);
  return true;
}

export function clearFavorites(): void {
  writeAll([]);
}

export function useFavorites(): {
  favorites: Favorite[];
  count: number;
  isFav: (slug: string, filename: string) => boolean;
} {
  const [favorites, setFavorites] = useState<Favorite[]>(() => listFavorites());
  useEffect(() => {
    const update = () => setFavorites(listFavorites());
    window.addEventListener(EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return {
    favorites,
    count: favorites.length,
    isFav: (slug, filename) =>
      favorites.some(
        (f) => favoriteKey(f.gallerySlug, f.filename) === favoriteKey(slug, filename)
      ),
  };
}
