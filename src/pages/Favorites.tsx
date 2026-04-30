import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Heart, Play, Trash2 } from "lucide-react";
import { VirtuosoGrid } from "react-virtuoso";
import { ImageThumb } from "../components/ImageThumb";
import { ImageDialog } from "../components/ImageDialog";
import { clearFavorites, useFavorites } from "../lib/favorites";

const FAVORITES_SLUG = "__favorites__";
const FAVORITES_TITLE = "Favorites";

export function Favorites() {
  const { favorites } = useFavorites();
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const images = useMemo(() => favorites.map((f) => f.image), [favorites]);

  const startSlideshow = () => {
    if (images.length === 0) return;
    setActiveIndex(0);
  };

  const handleClear = () => {
    if (
      window.confirm(`Remove all ${favorites.length} favorites? This cannot be undone.`)
    ) {
      clearFavorites();
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mx-auto w-full max-w-7xl px-4 py-4">
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-1 text-sm text-neutral-400 hover:text-neutral-100"
        >
          <ArrowLeft size={14} /> All galleries
        </Link>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              <Heart size={22} className="fill-rose-500 text-rose-500" />
              Favorites
            </h1>
            <p className="mt-1 text-xs text-neutral-500">
              {favorites.length.toLocaleString()} hearted image
              {favorites.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startSlideshow}
              disabled={images.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Play size={16} /> Slideshow
            </button>
            <button
              type="button"
              onClick={handleClear}
              disabled={favorites.length === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-300 transition hover:border-rose-500/60 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 size={16} /> Clear all
            </button>
          </div>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="mx-auto max-w-md px-4 py-16 text-center text-neutral-400">
          <Heart
            size={40}
            className="mx-auto mb-3 text-neutral-600"
          />
          <p className="font-medium text-neutral-200">No favorites yet</p>
          <p className="mt-1 text-sm">
            Hover any image and click the heart, or open an image and use the
            heart button in the toolbar to add it here.
          </p>
        </div>
      ) : (
        <VirtuosoGrid
          totalCount={images.length}
          overscan={600}
          className="flex-1"
          listClassName="grid grid-cols-2 gap-3 px-4 pb-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8"
          itemContent={(i) => {
            const fav = favorites[i];
            return (
              <ImageThumb
                key={`${fav.gallerySlug}::${fav.filename}`}
                image={fav.image}
                onOpen={() => setActiveIndex(i)}
                gallerySlug={fav.gallerySlug}
                galleryTitle={fav.galleryTitle}
              />
            );
          }}
        />
      )}

      <ImageDialog
        images={images}
        index={activeIndex}
        onClose={() => setActiveIndex(null)}
        onIndexChange={setActiveIndex}
        gallerySlug={
          activeIndex !== null
            ? favorites[activeIndex]?.gallerySlug || FAVORITES_SLUG
            : FAVORITES_SLUG
        }
        galleryTitle={
          activeIndex !== null
            ? favorites[activeIndex]?.galleryTitle || FAVORITES_TITLE
            : FAVORITES_TITLE
        }
      />
    </div>
  );
}
