import type { GalleryImage } from "../types";
import { thumbUrl } from "../lib/storage";
import { HeartButton } from "./HeartButton";

interface Props {
  image: GalleryImage;
  onOpen: () => void;
  gallerySlug: string;
  galleryTitle: string;
}

export function ImageThumb({ image, onOpen, gallerySlug, galleryTitle }: Props) {
  return (
    <div className="group relative aspect-square w-full">
      <button
        type="button"
        onClick={onOpen}
        className="block h-full w-full overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 transition hover:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-neutral-500"
      >
        <img
          src={thumbUrl(image)}
          alt={image.filename}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-2 py-1 text-left text-[11px] text-neutral-200 opacity-0 transition group-hover:opacity-100">
          {image.filename}
        </span>
      </button>
      <HeartButton
        gallerySlug={gallerySlug}
        galleryTitle={galleryTitle}
        image={image}
      />
    </div>
  );
}
