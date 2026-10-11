import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Layers } from "lucide-react";
import { useManifest, useSearchIndex } from "../lib/manifest";
import { GalleryCard } from "../components/GalleryCard";
import { FavoritesCard } from "../components/FavoritesCard";
import { SearchBar } from "../components/SearchBar";
import { searchGlobal } from "../lib/search";
import { useFavorites } from "../lib/favorites";
import { useVisited } from "../lib/visited";
import { paginate } from "../lib/pagination";
import { DuplicatesLink } from "../components/DuplicatesLink";
import type { GalleryImage, GallerySummary } from "../types";

type VisitedFilter = "all" | "unviewed" | "viewed";

const NEXT_FILTER: Record<VisitedFilter, VisitedFilter> = {
  all: "unviewed",
  unviewed: "viewed",
  viewed: "all",
};

const FILTER_LABEL: Record<VisitedFilter, string> = {
  all: "All",
  unviewed: "Unviewed",
  viewed: "Viewed",
};

const VISITED_FILTER_KEY = "glimr.visitedFilter.v1";

function loadVisitedFilter(): VisitedFilter {
  try {
    const raw = window.localStorage.getItem(VISITED_FILTER_KEY);
    if (raw === "all" || raw === "unviewed" || raw === "viewed") return raw;
  } catch {
    /* ignore */
  }
  return "all";
}

export function Home() {
  const { data, loading, error } = useManifest();
  const { count: favCount } = useFavorites();
  const { hasGallery: hasVisited, count: visitedCount } = useVisited();
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const isSearching = Boolean(query.trim());
  const { data: searchIndex, loading: searchLoading, error: searchError } = useSearchIndex(isSearching && data.galleries.length > 0);
  const [visitedFilter, setVisitedFilter] = useState<VisitedFilter>(
    loadVisitedFilter
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(VISITED_FILTER_KEY, visitedFilter);
    } catch {
      /* ignore */
    }
  }, [visitedFilter]);

  const hits = useMemo(
    () => searchGlobal(data.galleries, searchIndex, query),
    [data.galleries, searchIndex, query]
  );

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        gallery: GallerySummary;
        matchedImage?: GalleryImage;
        imageMatchCount: number;
      }
    >();
    for (const h of hits) {
      const existing = map.get(h.gallery.slug);
      if (!existing) {
        map.set(h.gallery.slug, {
          gallery: h.gallery,
          matchedImage: h.image,
          imageMatchCount: h.type === "image" ? 1 : 0,
        });
      } else if (h.type === "image") {
        existing.imageMatchCount += 1;
        if (!existing.matchedImage) existing.matchedImage = h.image;
      }
    }
    let arr = Array.from(map.values());
    if (visitedFilter === "unviewed") {
      arr = arr.filter((g) => !hasVisited(g.gallery));
    } else if (visitedFilter === "viewed") {
      arr = arr.filter((g) => hasVisited(g.gallery));
    }
    return arr;
  }, [hits, visitedFilter, hasVisited]);

  const { items: pageItems, page, totalPages } = paginate(grouped, searchParams.get("page"), 24);
  const showFavorites = favCount > 0 && !isSearching && page === 1;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [page]);

  const setQuery = (value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value.trim()) params.set("q", value);
    else params.delete("q");
    params.delete("page");
    setSearchParams(params, { replace: true });
  };

  const cycleFilter = () => {
    setVisitedFilter(NEXT_FILTER[visitedFilter]);
    const params = new URLSearchParams(searchParams);
    params.delete("page");
    setSearchParams(params);
  };

  const changePage = (next: number) => {
    const params = new URLSearchParams(searchParams);
    if (next === 1) params.delete("page");
    else params.set("page", String(next));
    setSearchParams(params);
  };

  const filterIcon =
    visitedFilter === "unviewed" ? (
      <EyeOff size={14} />
    ) : visitedFilter === "viewed" ? (
      <Eye size={14} />
    ) : (
      <Layers size={14} />
    );

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/" className="flex items-baseline gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Glimr</h1>
          <span className="text-xs text-neutral-500">
            {data.galleries.length} galleries
            {visitedCount > 0 && ` · ${visitedCount} viewed`}
          </span>
        </Link>
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
          <SearchBar
            value={query}
            onChange={setQuery}
            placeholder="Search galleries, images, tags..."
          />
          <DuplicatesLink />
          <button
            type="button"
            onClick={cycleFilter}
            data-testid="visited-filter"
            data-state={visitedFilter}
            title={`Show: ${FILTER_LABEL[visitedFilter]} (click to cycle)`}
            className="inline-flex items-center gap-2 self-start rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-800 sm:self-auto"
          >
            {filterIcon}
            <span>Show: {FILTER_LABEL[visitedFilter]}</span>
          </button>
        </div>
      </header>

      {loading ? (
        <p className="py-16 text-center text-neutral-500">Loading manifest...</p>
      ) : error ? (
        <p className="py-16 text-center text-red-400">
          Failed to load manifest: {error}
        </p>
      ) : data.galleries.length === 0 ? (
        <>
          {showFavorites && (
            <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <FavoritesCard />
            </div>
          )}
          <EmptyState />
        </>
      ) : isSearching && searchLoading ? (
        <p className="py-16 text-center text-neutral-500" role="status">Searching...</p>
      ) : isSearching && searchError ? (
        <p className="py-16 text-center text-red-400">Failed to load search index: {searchError}</p>
      ) : (
        <>
          {(showFavorites || pageItems.length > 0) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {showFavorites && <FavoritesCard />}
              {pageItems.map(({ gallery, matchedImage, imageMatchCount }) => (
                <div key={gallery.slug} className="flex flex-col">
                  <GalleryCard gallery={gallery} highlightImage={matchedImage} />
                  {imageMatchCount > 0 && (
                    <p className="mt-1 text-[11px] text-neutral-500">
                      {imageMatchCount} image match
                      {imageMatchCount === 1 ? "" : "es"}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          {grouped.length === 0 && (
            <p className="py-16 text-center text-neutral-500">
              {isSearching
                ? `No matches for "${query}".`
                : visitedFilter === "unviewed"
                  ? "Every gallery has been viewed."
                  : visitedFilter === "viewed"
                    ? "No galleries viewed yet."
                    : "No galleries."}
            </p>
          )}
          {totalPages > 1 && (
            <nav aria-label="Pagination" className="mt-6 flex items-center justify-center gap-4">
              <button
                type="button"
                aria-label="Previous page"
                data-testid="prev-page"
                disabled={page === 1}
                onClick={() => changePage(page - 1)}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous page
              </button>
              <span className="text-sm text-neutral-400">Page {page} of {totalPages}</span>
              <button
                type="button"
                aria-label="Next page"
                data-testid="next-page"
                disabled={page === totalPages}
                onClick={() => changePage(page + 1)}
                className="rounded-lg border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next page
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-neutral-700 p-10 text-center text-neutral-400">
      <p className="mb-2 font-medium text-neutral-200">No galleries yet</p>
      <p className="text-sm">
        Drop folders of images into{" "}
        <code className="rounded bg-neutral-800 px-1 py-0.5 text-xs text-neutral-200">
          public/galleries/
        </code>{" "}
        and run{" "}
        <code className="rounded bg-neutral-800 px-1 py-0.5 text-xs text-neutral-200">
          npm run galleries:prepare
        </code>
        .
      </p>
    </div>
  );
}
