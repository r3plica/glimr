export interface DuplicateSet {
  id: string;
  slugs: string[];
  createdAt: string;
}

export interface DuplicateMarks {
  version: 1;
  sets: DuplicateSet[];
}

export const MARKS_VERSION: 1;
export function emptyMarks(): DuplicateMarks;
export function normalizeMarks(value: unknown): DuplicateMarks;
export function readMarks(file: string): Promise<DuplicateMarks>;
export function writeMarks(file: string, marks: unknown): Promise<DuplicateMarks>;
