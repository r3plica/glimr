import { useEffect, useSyncExternalStore } from "react";
import type { GalleryImage } from "../types";

export type MovedImages = Record<string, string>;
const EMPTY_IMAGES: MovedImages = {};
let images = EMPTY_IMAGES;
let loadPromise: Promise<void> | null = null;
const subscribers = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

function getSnapshot(): MovedImages {
  return images;
}

function getServerSnapshot(): MovedImages {
  return EMPTY_IMAGES;
}

export function remapImageSrc(src: string, moved: MovedImages): string {
  return moved[src] ?? src;
}

export function remapFavoriteImage(image: GalleryImage, moved: MovedImages): GalleryImage {
  const src = remapImageSrc(image.src, moved);
  return src === image.src ? image : { ...image, src, sourceUrl: null };
}

export function loadMovedImages(): Promise<void> {
  if (!loadPromise) {
    loadPromise = fetch(`${import.meta.env.BASE_URL}data/moved-images.json`, { cache: "no-cache" })
      .then(async (response) => {
        if (!response.ok) return;
        const body = await response.json() as unknown;
        if (body === null || typeof body !== "object" || !("formatVersion" in body) ||
          body.formatVersion !== 2 || !("images" in body) || body.images === null || typeof body.images !== "object" || Array.isArray(body.images)) return;
        const valid: MovedImages = {};
        for (const [oldSrc, newSrc] of Object.entries(body.images)) {
          if (typeof newSrc === "string") valid[oldSrc] = newSrc;
        }
        images = valid;
        subscribers.forEach((subscriber) => subscriber());
      })
      .catch(() => {
        // Missing or invalid movement data is a no-op for existing favorites.
      });
  }
  return loadPromise;
}

export function useMovedImages(): MovedImages {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => { void loadMovedImages(); }, []);
  return snapshot;
}
