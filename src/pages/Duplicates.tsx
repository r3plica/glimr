import { useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { resolveGallery, useManifest } from "../lib/manifest";
import { useDuplicateMarks } from "../lib/duplicateMarks";
import { thumbUrl } from "../lib/storage";

export function Duplicates() {
  const { data, loading: manifestLoading, error: manifestError } = useManifest();
  const { marks, loading, error, remove, removeSet, merge } = useDuplicateMarks();
  const galleryBySlug = useMemo(() => {
    const resolved = new Map<string, ReturnType<typeof resolveGallery>>();
    for (const set of marks.sets) {
      for (const slug of set.slugs) resolved.set(slug, resolveGallery(data.galleries, slug));
    }
    return resolved;
  }, [data.galleries, marks.sets]);

  const firstTitle = (slugs: string[]) => galleryBySlug.get(slugs[0] ?? "")?.title ?? slugs[0] ?? "Empty set";
  const busy = loading || manifestLoading;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-4">
      <Link to="/" className="inline-flex w-fit items-center gap-1 text-sm text-neutral-400 hover:text-neutral-100">
        <ArrowLeft size={14} /> All galleries
      </Link>
      <div className="mt-3">
        <h1 className="text-2xl font-semibold tracking-tight">Duplicate sets</h1>
        <p className="mt-2 max-w-3xl text-sm text-neutral-400">
          Sets with 2 or more galleries are merged into one folder (the largest gallery is kept) the next time <code className="rounded bg-neutral-800 px-1 py-0.5 text-xs text-neutral-200">npm run galleries:duplicates -- --apply</code> and then <code className="rounded bg-neutral-800 px-1 py-0.5 text-xs text-neutral-200">npm run galleries:prepare</code> are run. Single-gallery sets wait until you find a match.
        </p>
      </div>

      {error && <p role="alert" className="mt-4 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-300">Failed to save duplicate sets: {error}</p>}
      {manifestError && <p role="alert" className="mt-4 text-sm text-red-400">Failed to load galleries: {manifestError}</p>}
      {busy ? (
        <p role="status" className="py-12 text-center text-neutral-500">Loading duplicate sets...</p>
      ) : manifestError ? null : marks.sets.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-neutral-700 p-10 text-center text-neutral-400">
          <p className="font-medium text-neutral-200">No duplicate sets yet</p>
          <p className="mt-1 text-sm">Open a gallery and use “Mark as duplicate” to start a set or add it to an existing set.</p>
          <Link to="/" className="mt-4 inline-flex rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 hover:bg-neutral-800">Browse galleries</Link>
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {marks.sets.map((set, index) => {
            const ready = set.slugs.length > 1;
            const label = firstTitle(set.slugs);
            return (
              <section key={set.id} data-testid="duplicate-set" aria-label={`Duplicate set ${index + 1}: ${label}`} className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <h2 className="font-medium text-neutral-100">{label}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ready ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-300"}`}>
                      {ready ? "Ready to merge" : "Waiting for a match"}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {marks.sets.length > 1 && (
                      <label className="sr-only" htmlFor={`merge-${set.id}`}>Merge {label} into another set</label>
                    )}
                    {marks.sets.length > 1 && (
                      <select id={`merge-${set.id}`} aria-label={`Merge ${label} into another set`} defaultValue="" onChange={(event) => { if (event.target.value) void merge(set.id, event.target.value); }} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200">
                        <option value="">Merge into…</option>
                        {marks.sets.filter((target) => target.id !== set.id).map((target) => (
                          <option key={target.id} value={target.id}>{firstTitle(target.slugs)}</option>
                        ))}
                      </select>
                    )}
                    <button type="button" onClick={() => void removeSet(set.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:border-red-800 hover:text-red-300">
                      <Trash2 size={14} /> Delete set
                    </button>
                  </div>
                </div>
                <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {set.slugs.map((slug) => {
                    const gallery = galleryBySlug.get(slug);
                    return (
                      <li key={slug} className="flex min-w-0 items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950/50 p-2">
                        {gallery ? (
                          <>
                            <Link to={`/g/${gallery.slug}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-md hover:bg-neutral-800/50">
                              <img src={thumbUrl(gallery.cover)} alt="" loading="lazy" decoding="async" className="h-14 w-20 shrink-0 rounded-md bg-neutral-800 object-cover" />
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-medium text-neutral-100">{gallery.title}</span>
                                <span className="block text-xs text-neutral-500">{gallery.imageCount.toLocaleString()} image{gallery.imageCount === 1 ? "" : "s"}</span>
                              </span>
                            </Link>
                            <button type="button" aria-label={`Remove ${gallery.title} from set`} onClick={() => void remove(set.id, slug)} className="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-red-300">Remove</button>
                          </>
                        ) : (
                          <>
                            <span className="min-w-0 flex-1 truncate text-sm text-amber-300">Missing gallery: {slug}</span>
                            <button type="button" aria-label={`Remove missing gallery ${slug} from set`} onClick={() => void remove(set.id, slug)} className="shrink-0 rounded-md px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-red-300">Remove</button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
