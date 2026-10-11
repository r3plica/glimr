import { useEffect, useSyncExternalStore } from "react";

export interface DuplicateSet {
  id: string;
  slugs: string[];
  createdAt: string;
}

export interface DuplicateMarks {
  version: 1;
  sets: DuplicateSet[];
}

const EMPTY_MARKS: DuplicateMarks = { version: 1, sets: [] };
type StoreSnapshot = { marks: DuplicateMarks; loading: boolean; error: string | null };
let snapshot: StoreSnapshot = { marks: EMPTY_MARKS, loading: true, error: null };
const subscribers = new Set<() => void>();
let loadPromise: Promise<void> | null = null;
let saveQueue: Promise<void> = Promise.resolve();
let mutationVersion = 0;

function publish(next: StoreSnapshot): void {
  snapshot = next;
  subscribers.forEach((subscriber) => subscriber());
}

function subscribe(listener: () => void): () => void {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
}

function getSnapshot(): StoreSnapshot {
  return snapshot;
}

const SERVER_SNAPSHOT: StoreSnapshot = { marks: EMPTY_MARKS, loading: true, error: null };

function getServerSnapshot(): StoreSnapshot {
  return SERVER_SNAPSHOT;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ensureLoaded(): void {
  if (loadPromise) return;
  loadPromise = fetch("/api/duplicate-marks", { cache: "no-cache" })
    .then(async (response) => {
      if (!response.ok) throw new Error(`Duplicate marks HTTP ${response.status}`);
      const marks = normalizeMarks(await response.json() as DuplicateMarks);
      if (mutationVersion === 0) publish({ marks, loading: false, error: null });
      else publish({ ...snapshot, loading: false });
    })
    .catch((error: unknown) => {
      loadPromise = null;
      publish({ ...snapshot, loading: false, error: errorMessage(error) });
    });
}

export function normalizeMarks(input: DuplicateMarks): DuplicateMarks {
  const usedSlugs = new Set<string>();
  const sets: DuplicateSet[] = [];
  const incoming = Array.isArray(input?.sets) ? input.sets : [];
  for (const set of incoming) {
    if (!set || typeof set.id !== "string" || typeof set.createdAt !== "string" || !Array.isArray(set.slugs)) continue;
    const slugs: string[] = [];
    for (const rawSlug of set.slugs) {
      if (typeof rawSlug !== "string") continue;
      const slug = rawSlug.trim();
      if (!slug || usedSlugs.has(slug)) continue;
      usedSlugs.add(slug);
      slugs.push(slug);
    }
    if (slugs.length > 0) sets.push({ id: set.id, slugs, createdAt: set.createdAt });
  }
  return { version: 1, sets };
}

export function createSet(marks: DuplicateMarks, slug: string, id: string, createdAt: string): DuplicateMarks {
  const normalized = normalizeMarks(marks);
  return normalizeMarks({ version: 1, sets: [...normalized.sets, { id, slugs: [slug], createdAt }] });
}

export function addToSet(marks: DuplicateMarks, setId: string, slug: string): DuplicateMarks {
  const normalized = normalizeMarks(marks);
  const cleanSlug = slug.trim();
  const target = normalized.sets.find((set) => set.id === setId);
  if (!cleanSlug || !target) return normalized;
  if (target.slugs.includes(cleanSlug)) return normalized;
  return normalizeMarks({
    version: 1,
    sets: normalized.sets.map((set) => ({
      ...set,
      slugs: set.id === setId
        ? [...set.slugs.filter((value) => value !== cleanSlug), cleanSlug]
        : set.slugs.filter((value) => value !== cleanSlug),
    })),
  });
}

export function removeFromSet(marks: DuplicateMarks, setId: string, slug: string): DuplicateMarks {
  const normalized = normalizeMarks(marks);
  return normalizeMarks({
    version: 1,
    sets: normalized.sets.map((set) => set.id === setId
      ? { ...set, slugs: set.slugs.filter((value) => value !== slug.trim()) }
      : set),
  });
}

export function deleteSet(marks: DuplicateMarks, setId: string): DuplicateMarks {
  const normalized = normalizeMarks(marks);
  return { version: 1, sets: normalized.sets.filter((set) => set.id !== setId) };
}

export function mergeSets(marks: DuplicateMarks, sourceId: string, targetId: string): DuplicateMarks {
  const normalized = normalizeMarks(marks);
  const source = normalized.sets.find((set) => set.id === sourceId);
  if (!source || sourceId === targetId || !normalized.sets.some((set) => set.id === targetId)) return normalized;
  return normalizeMarks({
    version: 1,
    sets: normalized.sets
      .filter((set) => set.id !== sourceId)
      .map((set) => set.id === targetId
        ? { ...set, slugs: [...set.slugs, ...source.slugs] }
        : set),
  });
}

export function findSetForSlug(marks: DuplicateMarks, slug: string): DuplicateSet | undefined {
  const cleanSlug = slug.trim();
  const found = marks.sets.find((set) => set.slugs.includes(cleanSlug));
  return found ? { ...found, slugs: [...found.slugs] } : undefined;
}

async function save(previous: DuplicateMarks, version: number): Promise<void> {
  saveQueue = saveQueue.then(async () => {
    const response = await fetch("/api/duplicate-marks", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot.marks),
    });
    if (!response.ok) {
      let message = `Duplicate marks HTTP ${response.status}`;
      try {
        const body = await response.json() as { error?: unknown };
        if (typeof body.error === "string") message = body.error;
      } catch {
        // Use the HTTP status when the response is not JSON.
      }
      throw new Error(message);
    }
    const saved = normalizeMarks(await response.json() as DuplicateMarks);
    if (version === mutationVersion) publish({ marks: saved, loading: false, error: null });
  }).catch((error: unknown) => {
    if (version === mutationVersion) publish({ marks: previous, loading: false, error: errorMessage(error) });
    else publish({ ...snapshot, error: errorMessage(error) });
  });
  await saveQueue;
}

function mutate(update: (marks: DuplicateMarks) => DuplicateMarks): Promise<void> {
  const previous = snapshot.marks;
  const next = update(previous);
  const version = ++mutationVersion;
  publish({ marks: next, loading: false, error: null });
  return save(previous, version);
}

export function useDuplicateMarks(): {
  marks: DuplicateMarks;
  loading: boolean;
  error: string | null;
  create(slug: string): Promise<void>;
  add(setId: string, slug: string): Promise<void>;
  remove(setId: string, slug: string): Promise<void>;
  removeSet(setId: string): Promise<void>;
  merge(sourceId: string, targetId: string): Promise<void>;
} {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => ensureLoaded(), []);
  return {
    ...current,
    create: (slug) => mutate((marks) => createSet(marks, slug, crypto.randomUUID(), new Date().toISOString())),
    add: (setId, slug) => mutate((marks) => addToSet(marks, setId, slug)),
    remove: (setId, slug) => mutate((marks) => removeFromSet(marks, setId, slug)),
    removeSet: (setId) => mutate((marks) => deleteSet(marks, setId)),
    merge: (sourceId, targetId) => mutate((marks) => mergeSets(marks, sourceId, targetId)),
  };
}
