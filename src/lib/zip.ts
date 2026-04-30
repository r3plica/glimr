import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { Gallery } from "../types";
import { resolveUrl } from "./storage";

export async function downloadGalleryAsZip(
  gallery: Gallery,
  onProgress?: (loaded: number, total: number) => void
): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder(gallery.slug) || zip;
  let loaded = 0;
  const total = gallery.images.length;

  await Promise.all(
    gallery.images.map(async (img) => {
      const res = await fetch(resolveUrl(img.src));
      if (!res.ok) throw new Error(`Failed to fetch ${img.src}`);
      const blob = await res.blob();
      folder.file(img.filename, blob);
      loaded += 1;
      onProgress?.(loaded, total);
    })
  );

  const out = await zip.generateAsync({ type: "blob" });
  saveAs(out, `${gallery.slug}.zip`);
}

export async function downloadSingleImage(
  src: string,
  filename: string
): Promise<void> {
  const res = await fetch(resolveUrl(src));
  if (!res.ok) throw new Error(`Failed to fetch ${src}`);
  const blob = await res.blob();
  saveAs(blob, filename);
}
