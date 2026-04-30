import { Link } from "react-router-dom";
import type { Gallery, GalleryImage } from "../types";
import { thumbUrl } from "../lib/storage";

interface Props {
  gallery: Gallery;
  highlightImage?: GalleryImage;
}

export function GalleryCard({ gallery, highlightImage }: Props) {
  const coverImage =
    highlightImage ||
    gallery.images.find((i) => i.src === gallery.cover) ||
    gallery.images[0];
  return (
    <Link
      to={`/g/${gallery.slug}`}
      className="group block overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900 transition hover:border-neutral-600"
    >
      <div className="aspect-[4/3] overflow-hidden bg-neutral-800">
        {coverImage && (
          <img
            src={thumbUrl(coverImage)}
            alt={gallery.title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        )}
      </div>
      <div className="p-3">
        <h3 className="truncate font-medium text-neutral-100">
          {gallery.title}
        </h3>
        <p className="mt-1 text-xs text-neutral-400">
          {gallery.images.length.toLocaleString()} image
          {gallery.images.length === 1 ? "" : "s"}
        </p>
        {gallery.tags && gallery.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {gallery.tags.slice(0, 4).map((t) => (
              <span
                key={t}
                className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-300"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
