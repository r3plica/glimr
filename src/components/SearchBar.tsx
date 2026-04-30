import { Search, X } from "lucide-react";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export function SearchBar({ value, onChange, placeholder }: Props) {
  return (
    <div className="relative w-full max-w-xl">
      <Search
        className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
        size={18}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || "Search..."}
        className="w-full rounded-lg border border-neutral-700 bg-neutral-900 py-2 pl-10 pr-10 text-sm text-neutral-100 placeholder-neutral-500 outline-none transition focus:border-neutral-500"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-100"
          aria-label="Clear search"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
