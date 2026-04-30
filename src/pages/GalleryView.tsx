import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Play } from "lucide-react";
import manifest from "../data/manifest.json";
import type { Manifest } from "../types";
import { SearchBar } from "../components/SearchBar";
import { ImageThumb } from "../components/ImageThumb";
import { ImageDialog } from "../components/ImageDialog";
import { DownloadGalleryButton } from "../components/DownloadGalleryButton";
import { searchImages } from "../lib/search";

const data = manifest as Manifest;

export function GalleryView() {
  const { slug } = useParams<{ slug: string }>();
  const gallery = data.galleries.find((g) => g.slug === slug);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const filtered = useMemo(
    () => (gallery ? searchImages(gallery.images, query) : []),
    [gallery, query]
  );

  if (!gallery) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <p className="text-neutral-400">Gallery not found.</p>
        <Link
          to="/"
          className="mt-2 inline-flex items-center gap-1 text-sm text-neutral-200 hover:underline"
        >
          <ArrowLeft size={14} /> Back
        </Link>
      </div>
    );
  }

  const startSlideshow = () => {
    if (filtered.length === 0) return;
    const firstIdx = gallery.images.indexOf(filtered[0]);
    setActiveIndex(firstIdx >= 0 ? firstIdx : 0);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6 flex flex-col gap-4">
        <Link
          to="/"
          className="inline-flex w-fit items-center gap-1 text-sm text-neutral-400 hover:text-neutral-100"
        >
          <ArrowLeft size={14} /> All galleries
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {gallery.title}
            </h1>
            {gallery.description && (
              <p className="mt-1 max-w-2xl text-sm text-neutral-400">
                {gallery.description}
              </p>
            )}
            <p className="mt-1 text-xs text-neutral-500">
              {gallery.images.length} image
              {gallery.images.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={startSlideshow}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800"
            >
              <Play size={16} /> Slideshow
            </button>
            <DownloadGalleryButton gallery={gallery} />
          </div>
        </div>
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search this gallery..."
        />
      </header>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-neutral-500">
          {query
            ? `No matches for "${query}".`
            : "This gallery is empty."}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((img) => {
            const idx = gallery.images.indexOf(img);
            return (
              <ImageThumb
                key={img.src}
                image={img}
                onOpen={() => setActiveIndex(idx)}
              />
            );
          })}
        </div>
      )}

      <ImageDialog
        images={gallery.images}
        index={activeIndex}
        onClose={() => setActiveIndex(null)}
        onIndexChange={setActiveIndex}
      />
    </div>
  );
}
