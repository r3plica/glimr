import type { Orientation, SizeBucket } from "../types";

export type SortKey = "name-asc" | "name-desc" | "size-desc" | "size-asc" | "random";

export interface FilterState {
  orientation: Orientation | "any";
  size: SizeBucket | "any";
  sort: SortKey;
}

interface Props {
  value: FilterState;
  onChange: (v: FilterState) => void;
}

const orientations: { v: FilterState["orientation"]; label: string }[] = [
  { v: "any", label: "All" },
  { v: "portrait", label: "Portrait" },
  { v: "landscape", label: "Landscape" },
  { v: "square", label: "Square" },
];

const sizes: { v: FilterState["size"]; label: string }[] = [
  { v: "any", label: "Any size" },
  { v: "large", label: "Large" },
  { v: "medium", label: "Medium" },
  { v: "small", label: "Small" },
];

const sorts: { v: SortKey; label: string }[] = [
  { v: "name-asc", label: "Name A→Z" },
  { v: "name-desc", label: "Name Z→A" },
  { v: "size-desc", label: "Resolution: high→low" },
  { v: "size-asc", label: "Resolution: low→high" },
  { v: "random", label: "Shuffle" },
];

export function FilterBar({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex overflow-hidden rounded-lg border border-neutral-800 bg-neutral-900 text-xs">
        {orientations.map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => onChange({ ...value, orientation: o.v })}
            className={
              "px-3 py-1.5 transition " +
              (value.orientation === o.v
                ? "bg-neutral-700 text-neutral-50"
                : "text-neutral-300 hover:bg-neutral-800")
            }
          >
            {o.label}
          </button>
        ))}
      </div>

      <select
        value={value.size}
        onChange={(e) =>
          onChange({ ...value, size: e.target.value as FilterState["size"] })
        }
        className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200"
        aria-label="Filter by size"
      >
        {sizes.map((s) => (
          <option key={s.v} value={s.v}>
            {s.label}
          </option>
        ))}
      </select>

      <select
        value={value.sort}
        onChange={(e) => onChange({ ...value, sort: e.target.value as SortKey })}
        className="rounded-lg border border-neutral-800 bg-neutral-900 px-2 py-1.5 text-xs text-neutral-200"
        aria-label="Sort order"
      >
        {sorts.map((s) => (
          <option key={s.v} value={s.v}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  );
}
