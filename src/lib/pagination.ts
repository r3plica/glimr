export function paginate<T>(
  items: T[],
  page: number | string | null | undefined,
  pageSize: number
): { items: T[]; page: number; totalPages: number } {
  const size = Number.isFinite(pageSize) ? Math.max(1, Math.floor(pageSize)) : 1;
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const parsed = Number(page);
  const requested = Number.isFinite(parsed) ? Math.floor(parsed) : 1;
  const current = Math.min(totalPages, Math.max(1, requested));
  return {
    items: items.slice((current - 1) * size, current * size),
    page: current,
    totalPages,
  };
}
