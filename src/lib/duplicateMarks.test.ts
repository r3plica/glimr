import { describe, expect, it } from "vitest";
import {
  addToSet,
  createSet,
  deleteSet,
  findSetForSlug,
  mergeSets,
  normalizeMarks,
  removeFromSet,
  type DuplicateMarks,
} from "./duplicateMarks";

const sample: DuplicateMarks = {
  version: 1,
  sets: [
    { id: "one", slugs: ["alpha", " beta ", "alpha", ""], createdAt: "today" },
    { id: "two", slugs: ["beta", "gamma"], createdAt: "yesterday" },
    { id: "empty", slugs: [], createdAt: "now" },
  ],
};

describe("duplicate marks helpers", () => {
  it("normalizes slugs and keeps only the first set containing each slug", () => {
    expect(normalizeMarks(sample)).toEqual({
      version: 1,
      sets: [
        { id: "one", slugs: ["alpha", "beta"], createdAt: "today" },
        { id: "two", slugs: ["gamma"], createdAt: "yesterday" },
      ],
    });
    expect(sample.sets[0].slugs).toEqual(["alpha", " beta ", "alpha", ""]);
  });

  it("moves a slug between sets and removes an emptied source set", () => {
    const one: DuplicateMarks = { version: 1, sets: [{ id: "one", slugs: ["alpha"], createdAt: "today" }] };
    expect(addToSet(one, "two", "alpha")).toEqual(one);
    const moved = addToSet({ ...one, sets: [...one.sets, { id: "two", slugs: ["beta"], createdAt: "today" }] }, "two", "alpha");
    expect(moved.sets).toEqual([{ id: "two", slugs: ["beta", "alpha"], createdAt: "today" }]);
    const movedOutOfLastSource = addToSet({ version: 1, sets: [
      { id: "solo", slugs: ["alone"], createdAt: "today" },
      { id: "target", slugs: ["beta"], createdAt: "today" },
    ] }, "target", "alone");
    expect(movedOutOfLastSource.sets).toEqual([{ id: "target", slugs: ["beta", "alone"], createdAt: "today" }]);
    expect(removeFromSet(moved, "two", "beta").sets).toHaveLength(1);
    expect(removeFromSet(moved, "two", "alpha").sets).toEqual([{ id: "two", slugs: ["beta"], createdAt: "today" }]);
    expect(removeFromSet(one, "one", "alpha").sets).toEqual([]);
  });

  it("merges source slugs into the target and deletes the source", () => {
    const marks = { version: 1 as const, sets: [
      { id: "source", slugs: ["a", "b"], createdAt: "1" },
      { id: "target", slugs: ["c"], createdAt: "2" },
    ] };
    expect(mergeSets(marks, "source", "target").sets).toEqual([
      { id: "target", slugs: ["c", "a", "b"], createdAt: "2" },
    ]);
    expect(deleteSet(marks, "source").sets).toHaveLength(1);
  });

  it("keeps single-gallery waiting sets and supports lookup and creation", () => {
    const marks = createSet({ version: 1, sets: [] }, " solo ", "new", "now");
    expect(marks.sets).toEqual([{ id: "new", slugs: ["solo"], createdAt: "now" }]);
    expect(findSetForSlug(marks, " solo ")?.id).toBe("new");
  });
});
