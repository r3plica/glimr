import { Link } from "react-router-dom";
import { Copy } from "lucide-react";
import { useDuplicateMarks } from "../lib/duplicateMarks";

export function DuplicatesLink() {
  const { marks } = useDuplicateMarks();
  const count = marks.sets.length;
  return (
    <Link
      to="/duplicates"
      aria-label={`Duplicates (${count} ${count === 1 ? "set" : "sets"})`}
      data-testid="duplicates-link"
      className="inline-flex items-center gap-2 self-start rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-200 transition hover:border-neutral-500 hover:bg-neutral-800 sm:self-auto"
    >
      <Copy size={15} />
      <span>Duplicates</span>
      {count > 0 && <span className="rounded-full bg-neutral-700 px-1.5 py-0.5 text-[10px] font-semibold text-neutral-100">{count}</span>}
    </Link>
  );
}
