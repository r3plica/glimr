import { Heart } from "lucide-react";
import type { GalleryImage } from "../types";
import { toggleFavorite, useFavorites } from "../lib/favorites";

interface Props {
  gallerySlug: string;
  galleryTitle: string;
  image: GalleryImage;
  variant?: "overlay" | "toolbar";
}

export function HeartButton({
  gallerySlug,
  galleryTitle,
  image,
  variant = "overlay",
}: Props) {
  const { isFav } = useFavorites();
  const active = isFav(gallerySlug, image.filename);

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    toggleFavorite(gallerySlug, galleryTitle, image);
  };

  const baseClasses =
    variant === "overlay"
      ? "absolute right-1.5 top-1.5 z-10 rounded-full p-1.5 backdrop-blur-sm transition focus:outline-none focus:ring-2 focus:ring-rose-400"
      : "rounded p-2 transition focus:outline-none focus:ring-2 focus:ring-rose-400";

  const stateClasses = active
    ? "bg-rose-500/90 text-white hover:bg-rose-500"
    : variant === "overlay"
      ? "bg-black/50 text-white opacity-0 hover:bg-black/70 group-hover:opacity-100 focus:opacity-100"
      : "text-neutral-300 hover:bg-neutral-800";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={active ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={active}
      data-testid="heart-button"
      data-active={active ? "true" : "false"}
      className={`${baseClasses} ${stateClasses}`}
    >
      <Heart
        size={variant === "overlay" ? 16 : 18}
        fill={active ? "currentColor" : "none"}
      />
    </button>
  );
}
