import { useEffect, useState } from "react";

const KEY = "glimr.visited.v1";
const EVT = "glimr:visited-changed";

function readSet(): Set<string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeSet(set: Set<string>) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(Array.from(set)));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* ignore */
  }
}

export function listVisited(): string[] {
  return Array.from(readSet());
}

export function isVisited(slug: string): boolean {
  return readSet().has(slug);
}

export function markVisited(slug: string): void {
  const set = readSet();
  if (set.has(slug)) return;
  set.add(slug);
  writeSet(set);
}

export function clearVisited(): void {
  writeSet(new Set());
}

export function useVisited() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(EVT, bump);
    window.addEventListener("storage", (e) => {
      if (e.key === KEY) bump();
    });
    return () => {
      window.removeEventListener(EVT, bump);
    };
  }, []);
  const set = readSet();
  return {
    version,
    has: (slug: string) => set.has(slug),
    count: set.size,
  };
}
