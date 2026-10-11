import { useEffect, useState } from "react";
import type { Gallery, GallerySummary, Manifest, SearchIndex } from "../types";

const EMPTY: Manifest = { formatVersion: 2, generatedAt: "", galleries: [] };

let cachedPromise: Promise<Manifest> | null = null;

export function loadManifest(): Promise<Manifest> {
  if (!cachedPromise) {
    cachedPromise = fetch(`${import.meta.env.BASE_URL}manifest.json`, {
      cache: "no-cache",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Manifest HTTP ${r.status}`);
        return r.json() as Promise<Manifest>;
      })
      .catch((err) => {
        cachedPromise = null;
        throw err;
      });
  }
  return cachedPromise;
}

export function useManifest(): {
  data: Manifest;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<Manifest>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadManifest()
      .then((m) => {
        if (alive) setData(m);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return { data, loading, error };
}

const galleryPromises = new Map<string, Promise<Gallery>>();
let searchIndexPromise: Promise<SearchIndex> | null = null;

export function resolveGallery(
  galleries: GallerySummary[],
  slug: string | undefined
): GallerySummary | undefined {
  if (!slug) return undefined;
  return galleries.find((g) => g.slug === slug) ??
    galleries.find((g) => g.aliases.includes(slug));
}

export function loadGallery(slug: string): Promise<Gallery> {
  const cached = galleryPromises.get(slug);
  if (cached) return cached;
  const promise = fetch(
    `${import.meta.env.BASE_URL}data/galleries/${encodeURIComponent(slug)}.json`,
    { cache: "no-cache" }
  )
    .then((r) => {
      if (!r.ok) throw new Error(`Gallery HTTP ${r.status}`);
      return r.json() as Promise<Gallery>;
    })
    .catch((err: unknown) => {
      galleryPromises.delete(slug);
      throw err;
    });
  galleryPromises.set(slug, promise);
  return promise;
}

export function useGallery(slug: string | undefined): {
  data: Gallery | null;
  loading: boolean;
  error: string | null;
} {
  const [result, setResult] = useState<{
    slug: string;
    data: Gallery | null;
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!slug) return;
    let alive = true;
    loadGallery(slug)
      .then((data) => {
        if (alive) setResult({ slug, data, error: null });
      })
      .catch((e: unknown) => {
        if (alive) setResult({
          slug,
          data: null,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    return () => { alive = false; };
  }, [slug]);

  // Key the resolved state to its request so a new slug never shows stale images.
  const current = result?.slug === slug ? result : null;
  return {
    data: current?.data ?? null,
    loading: Boolean(slug) && !current,
    error: current?.error ?? null,
  };
}

export function loadSearchIndex(): Promise<SearchIndex> {
  if (!searchIndexPromise) {
    searchIndexPromise = fetch(`${import.meta.env.BASE_URL}data/search-index.json`, {
      cache: "no-cache",
    })
      .then((r) => {
        if (!r.ok) throw new Error(`Search index HTTP ${r.status}`);
        return r.json() as Promise<SearchIndex>;
      })
      .catch((err: unknown) => {
        searchIndexPromise = null;
        throw err;
      });
  }
  return searchIndexPromise;
}

export function useSearchIndex(enabled: boolean) {
  const [result, setResult] = useState<{
    data: SearchIndex | null;
    error: string | null;
  }>({ data: null, error: null });

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    loadSearchIndex()
      .then((data) => {
        if (alive) setResult({ data, error: null });
      })
      .catch((e: unknown) => {
        if (alive) setResult({
          data: null,
          error: e instanceof Error ? e.message : String(e),
        });
      });
    return () => { alive = false; };
  }, [enabled]);

  return { ...result, loading: enabled && !result.data && !result.error };
}
