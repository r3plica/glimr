import JSZip from "jszip";
import { saveAs } from "file-saver";
import type { Gallery, GalleryImage } from "../types";
import { downloadUrl } from "./storage";

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
      const res = await fetch(downloadUrl(img));
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
  image: GalleryImage
): Promise<void> {
  const res = await fetch(downloadUrl(image));
  if (!res.ok) throw new Error(`Failed to fetch ${image.src}`);
  const blob = await res.blob();
  saveAs(blob, image.filename);
}
