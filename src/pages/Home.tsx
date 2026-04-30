import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useManifest } from "../lib/manifest";
import { GalleryCard } from "../components/GalleryCard";
import { FavoritesCard } from "../components/FavoritesCard";
import { SearchBar } from "../components/SearchBar";
import { searchGlobal } from "../lib/search";
import { useFavorites } from "../lib/favorites";

export function Home() {
  const { data, loading, error } = useManifest();
  const { count: favCount } = useFavorites();
  const [query, setQuery] = useState("");
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
    return Array.from(map.values());
  }, [hits]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link to="/" className="flex items-baseline gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Glimr</h1>
          <span className="text-xs text-neutral-500">
            {data.galleries.length} galleries
          </span>
        </Link>
        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder="Search galleries, images, tags..."
        />
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
          No matches for &quot;{query}&quot;.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {favCount > 0 && !query.trim() && <FavoritesCard />}
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
