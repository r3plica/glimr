import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronDown, Copy } from "lucide-react";
import type { GallerySummary } from "../types";
import { useDuplicateMarks } from "../lib/duplicateMarks";

interface Props {
  slug: string;
  title: string;
  galleries: GallerySummary[];
}

function setLabel(slugs: string[], galleries: GallerySummary[]): string {
  const firstSlug = slugs[0];
  const gallery = galleries.find((item) => item.slug === firstSlug || item.aliases.includes(firstSlug));
  return gallery?.title ?? firstSlug ?? "Unknown gallery";
}

export function DuplicateControl({ slug, title, galleries }: Props) {
  const { marks, create, add, remove } = useDuplicateMarks();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const currentSet = marks.sets.find((set) => set.slugs.includes(slug));

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const choose = (action: () => Promise<void>) => {
    setOpen(false);
    void action();
  };
  const otherSets = marks.sets.filter((set) => set.id !== currentSet?.id);
  const accessibleName = currentSet
    ? currentSet.slugs.length === 1
      ? "Marked as duplicate \u2014 no match yet"
      : `In a duplicate set with ${currentSet.slugs.length - 1} other galleries`
    : "Mark as duplicate";

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        aria-label={accessibleName}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="duplicate-menu-button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800"
      >
        {currentSet ? <Check size={16} /> : <Copy size={16} />}
        <span>{currentSet ? "Duplicate set" : "Mark as duplicate"}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 min-w-64 rounded-lg border border-neutral-700 bg-neutral-900 p-1.5 shadow-xl">
          {currentSet ? (
            <>
              <Link role="menuitem" to="/duplicates" onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800">View duplicate sets</Link>
              <button role="menuitem" type="button" onClick={() => choose(() => remove(currentSet.id, slug))} className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800">Remove from duplicate set</button>
              {otherSets.length > 0 && <div role="separator" className="my-1 border-t border-neutral-700" />}
              {otherSets.map((set) => (
                <button key={set.id} role="menuitem" type="button" onClick={() => choose(() => add(set.id, slug))} className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800">
                  Move to set with {setLabel(set.slugs, galleries)}{set.slugs.length > 1 ? ` (+${set.slugs.length - 1} more)` : ""}
                </button>
              ))}
            </>
          ) : (
            <>
              <button role="menuitem" type="button" onClick={() => choose(() => create(slug))} className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800">Start a new duplicate set</button>
              {marks.sets.map((set) => (
                <button key={set.id} role="menuitem" type="button" onClick={() => choose(() => add(set.id, slug))} className="w-full rounded-md px-3 py-2 text-left text-sm text-neutral-200 hover:bg-neutral-800">
                  Add to set with {setLabel(set.slugs, galleries)}{set.slugs.length > 1 ? ` (+${set.slugs.length - 1} more)` : ""}
                </button>
              ))}
            </>
          )}
          <span className="sr-only">{title}</span>
        </div>
      )}
    </div>
  );
}
