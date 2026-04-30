import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Play } from "lucide-react";
import { VirtuosoGrid, type VirtuosoGridHandle } from "react-virtuoso";
import { useManifest } from "../lib/manifest";
import type { GalleryImage } from "../types";
import { SearchBar } from "../components/SearchBar";
import { ImageThumb } from "../components/ImageThumb";
import { ImageDialog } from "../components/ImageDialog";
import { DownloadGalleryButton } from "../components/DownloadGalleryButton";
import { FilterBar, type FilterState } from "../components/FilterBar";
import { searchImages } from "../lib/search";

const DEFAULT_FILTERS: FilterState = {
  orientation: "any",
  size: "any",
  sort: "name-asc",
};

function shuffle<T>(arr: T[], seed: number): T[] {
  const a = arr.slice();
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function applyFilters(
  images: GalleryImage[],
  f: FilterState,
  shuffleSeed: number
): GalleryImage[] {
  let out = images;
  if (f.orientation !== "any") {
    out = out.filter((i) => (i.orientation || "unknown") === f.orientation);
  }
  if (f.size !== "any") {
    out = out.filter((i) => (i.sizeBucket || "unknown") === f.size);
  }
  switch (f.sort) {
    case "name-asc":
      out = out
        .slice()
        .sort((a, b) =>
          a.filename.localeCompare(b.filename, undefined, { numeric: true })
        );
      break;
    case "name-desc":
      out = out
        .slice()
        .sort((a, b) =>
          b.filename.localeCompare(a.filename, undefined, { numeric: true })
        );
      break;
    case "size-desc":
      out = out
        .slice()
        .sort(
          (a, b) =>
            (b.width || 0) * (b.height || 0) -
            (a.width || 0) * (a.height || 0)
        );
      break;
    case "size-asc":
      out = out
        .slice()
        .sort(
          (a, b) =>
            (a.width || 0) * (a.height || 0) -
            (b.width || 0) * (b.height || 0)
        );
      break;
    case "random":
      out = shuffle(out, shuffleSeed);
      break;
  }
  return out;
}

export function GalleryView() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data, loading, error } = useManifest();
  const galleryIndex = data.galleries.findIndex((g) => g.slug === slug);
  const gallery = galleryIndex >= 0 ? data.galleries[galleryIndex] : undefined;
  const total = data.galleries.length;
  const prevGallery =
    total > 0 && galleryIndex >= 0
      ? data.galleries[(galleryIndex - 1 + total) % total]
      : undefined;
  const nextGallery =
    total > 0 && galleryIndex >= 0
      ? data.galleries[(galleryIndex + 1) % total]
      : undefined;
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [shuffleSeed, setShuffleSeed] = useState(1);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [prevSlug, setPrevSlug] = useState(slug);
  const gridRef = useRef<VirtuosoGridHandle>(null);

  if (prevSlug !== slug) {
    setPrevSlug(slug);
    setQuery("");
    setActiveIndex(null);
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    gridRef.current?.scrollToIndex({ index: 0, behavior: "auto" });
  }, [slug]);

  useEffect(() => {
    if (activeIndex !== null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && prevGallery) {
        e.preventDefault();
        navigate(`/g/${prevGallery.slug}`);
      } else if (e.key === "ArrowRight" && nextGallery) {
        e.preventDefault();
        navigate(`/g/${nextGallery.slug}`);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeIndex, prevGallery, nextGallery, navigate]);

  const handleFilters = (v: FilterState) => {
    if (v.sort === "random" && filters.sort !== "random") {
      setShuffleSeed(Date.now());
    }
    setFilters(v);
  };

  const visible = useMemo(() => {
    if (!gallery) return [];
    const filtered = applyFilters(gallery.images, filters, shuffleSeed);
    return query.trim() ? searchImages(filtered, query) : filtered;
  }, [gallery, filters, shuffleSeed, query]);

  if (!gallery) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <p className="text-neutral-400">
          {loading
            ? "Loading manifest..."
            : error
              ? `Failed to load: ${error}`
              : "Gallery not found."}
        </p>
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
    if (visible.length === 0) return;
    setActiveIndex(0);
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
            <h1 className="text-2xl font-semibold tracking-tight">
              {gallery.title}
            </h1>
            {gallery.description && (
              <p className="mt-1 max-w-2xl text-sm text-neutral-400">
                {gallery.description}
              </p>
            )}
            <p className="mt-1 text-xs text-neutral-500">
              Showing {visible.length.toLocaleString()} of{" "}
              {gallery.images.length.toLocaleString()}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {prevGallery && (
              <Link
                to={`/g/${prevGallery.slug}`}
                title={`Previous: ${prevGallery.title}`}
                aria-label={`Previous gallery: ${prevGallery.title}`}
                data-testid="prev-gallery"
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800"
              >
                <ChevronLeft size={16} />
                <span className="hidden sm:inline max-w-[10ch] truncate">
                  {prevGallery.title}
                </span>
              </Link>
            )}
            {nextGallery && (
              <Link
                to={`/g/${nextGallery.slug}`}
                title={`Next: ${nextGallery.title}`}
                aria-label={`Next gallery: ${nextGallery.title}`}
                data-testid="next-gallery"
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 bg-neutral-900 px-2.5 py-2 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800"
              >
                <span className="hidden sm:inline max-w-[10ch] truncate">
                  {nextGallery.title}
                </span>
                <ChevronRight size={16} />
              </Link>
            )}
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
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search this gallery..."
          />
          <FilterBar value={filters} onChange={handleFilters} />
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-16 text-center text-neutral-500">
          {query ? `No matches for "${query}".` : "No images match the current filters."}
        </p>
      ) : (
        <VirtuosoGrid
          ref={gridRef}
          totalCount={visible.length}
          overscan={600}
          className="flex-1"
          listClassName="grid grid-cols-2 gap-3 px-4 pb-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8"
          itemContent={(i) => {
            const img = visible[i];
            return (
              <ImageThumb
                key={img.src}
                image={img}
                onOpen={() => setActiveIndex(i)}
                gallerySlug={gallery.slug}
                galleryTitle={gallery.title}
              />
            );
          }}
        />
      )}

      <ImageDialog
        images={visible}
        index={activeIndex}
        onClose={() => setActiveIndex(null)}
        onIndexChange={setActiveIndex}
        gallerySlug={gallery.slug}
        galleryTitle={gallery.title}
      />
    </div>
  );
}
