import { describe, expect, it } from "vitest";
import { paginate } from "./pagination";

describe("paginate", () => {
  const items = [1, 2, 3, 4, 5];

  it("clamps pages to the available range", () => {
    expect(paginate(items, -3, 2)).toEqual({ items: [1, 2], page: 1, totalPages: 3 });
    expect(paginate(items, 99, 2)).toEqual({ items: [5], page: 3, totalPages: 3 });
  });

  it("keeps one empty page for an empty list", () => {
    expect(paginate([], 7, 24)).toEqual({ items: [], page: 1, totalPages: 1 });
  });

  it("returns the last partial page without mutating the input", () => {
    expect(paginate(items, "3", 2).items).toEqual([5]);
    expect(items).toEqual([1, 2, 3, 4, 5]);
  });

  it("handles invalid page values and truncates fractional pages", () => {
    for (const page of [NaN, Infinity, "invalid", "2oops", null, undefined, ""]) {
      expect(paginate(items, page, 2).page).toBe(1);
    }
    expect(paginate(items, "2.8", 2).items).toEqual([3, 4]);
  });
});
