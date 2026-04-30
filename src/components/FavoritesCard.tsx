import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { thumbUrl } from "../lib/storage";
import { useFavorites } from "../lib/favorites";

export function FavoritesCard() {
  const { favorites, count } = useFavorites();
  const cover = favorites[0]?.image;

  return (
    <Link
      to="/favorites"
      data-testid="favorites-card"
      className="group block overflow-hidden rounded-xl border border-rose-500/40 bg-gradient-to-br from-rose-950/40 to-neutral-900 transition hover:border-rose-400/70"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-neutral-800">
        {cover ? (
          <img
            src={thumbUrl(cover)}
            alt="Favorites"
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover opacity-80 transition duration-500 group-hover:scale-105 group-hover:opacity-100"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-600">
            <Heart size={48} />
          </div>
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <Heart
            size={56}
            className="fill-rose-500/90 text-rose-500 drop-shadow-lg"
          />
        </div>
      </div>
      <div className="p-3">
        <h3 className="flex items-center gap-2 truncate font-medium text-neutral-100">
          Favorites
        </h3>
        <p className="mt-1 text-xs text-neutral-400">
          {count.toLocaleString()} hearted image{count === 1 ? "" : "s"}
        </p>
      </div>
    </Link>
  );
}
