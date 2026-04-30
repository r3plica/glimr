import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, EyeOff, Layers } from "lucide-react";
import { useManifest } from "../lib/manifest";
import { GalleryCard } from "../components/GalleryCard";
import { FavoritesCard } from "../components/FavoritesCard";
import { SearchBar } from "../components/SearchBar";
import { searchGlobal } from "../lib/search";
import { useFavorites } from "../lib/favorites";
import { useVisited } from "../lib/visited";

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

export function Home() {
  const { data, loading, error } = useManifest();
  const { count: favCount } = useFavorites();
  const { has: hasVisited, count: visitedCount } = useVisited();
  const [query, setQuery] = useState("");
  const [visitedFilter, setVisitedFilter] = useState<VisitedFilter>("all");

  const hits = useMemo(
    () => searchGlobal(data.galleries, query),
    [data.galleries, query]
  );

  const grouped = useMemo(() => {
    const map = new Map<
      string,
      {
        gallery: (typeof data.galleries)[number];
        matchedImage?: (typeof data.galleries)[number]["images"][number];
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
      arr = arr.filter((g) => !hasVisited(g.gallery.slug));
    } else if (visitedFilter === "viewed") {
      arr = arr.filter((g) => hasVisited(g.gallery.slug));
    }
    return arr;
  }, [hits, visitedFilter, hasVisited]);

  const cycleFilter = () => setVisitedFilter(NEXT_FILTER[visitedFilter]);

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
        <EmptyState />
      ) : grouped.length === 0 ? (
        <p className="py-16 text-center text-neutral-500">
          {query
            ? `No matches for "${query}".`
            : visitedFilter === "unviewed"
              ? "Every gallery has been viewed."
              : visitedFilter === "viewed"
                ? "No galleries viewed yet."
                : "No galleries."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {favCount > 0 && !query.trim() && visitedFilter === "all" && (
            <FavoritesCard />
          )}
          {grouped.map(({ gallery, matchedImage, imageMatchCount }) => (
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
          npm run manifest
        </code>
        .
      </p>
    </div>
  );
}
