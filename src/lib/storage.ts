// Adapter for resolving image URLs.
// For images sourced from Blogger CDN we transform the URL to fetch a
// resized variant (thumbs use a small size, full-view uses a medium size).
// Blogger URLs include a "/sNNN/" or "/sNNN-w*/" segment that we replace.
// Falls back to the local path stored in `src` for any non-Blogger image.

import type { GalleryImage } from "../types";

const BLOGGER_HOST = /(?:^|\.)blogger\.googleusercontent\.com$/i;

function isBloggerUrl(u: string | null | undefined): u is string {
  if (!u) return false;
  try {
    return BLOGGER_HOST.test(new URL(u).hostname);
  } catch {
    return false;
  }
}

function withBloggerSize(url: string, size: number): string {
  // Replace the "/sNNN[-w*]/" segment, otherwise prepend "/sNNN/" before the basename.
  const replaced = url.replace(/\/s\d+(?:-[^/]*)?\//, `/s${size}/`);
  if (replaced !== url) return replaced;
  return url.replace(/\/([^/]+)$/, `/s${size}/$1`);
}

export function thumbUrl(input: string | GalleryImage): string {
  if (typeof input === "string") return input;
  if (isBloggerUrl(input.sourceUrl)) {
    return withBloggerSize(input.sourceUrl, 320);
  }
  return input.src;
}

export function viewUrl(input: string | GalleryImage): string {
  if (typeof input === "string") return input;
  if (isBloggerUrl(input.sourceUrl)) {
    return withBloggerSize(input.sourceUrl, 1600);
  }
  return input.src;
}

// Used for ZIP download / single-image download — always returns the
// local copy so we get a stable, original-quality file.
export function downloadUrl(input: string | GalleryImage): string {
  if (typeof input === "string") return input;
  return input.src;
}

// Back-compat alias used by some components / earlier code.
export function resolveUrl(input: string | GalleryImage): string {
  return viewUrl(input);
}
