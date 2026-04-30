import { useEffect, useState } from "react";
import type { Manifest } from "../types";

const EMPTY: Manifest = { generatedAt: "", galleries: [] };

let cachedPromise: Promise<Manifest> | null = null;

export function loadManifest(): Promise<Manifest> {
  if (!cachedPromise) {
    cachedPromise = fetch(`${import.meta.env.BASE_URL}manifest.json`, {
      cache: "force-cache",
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
