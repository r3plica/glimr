export type Orientation = "portrait" | "landscape" | "square" | "unknown";
export type SizeBucket = "small" | "medium" | "large" | "unknown";

export interface GalleryImage {
  src: string;
  filename: string;
  tags?: string[];
  width?: number;
  height?: number;
  sourceUrl?: string | null;
  orientation?: Orientation;
  sizeSeg?: number | null;
  sizeBucket?: SizeBucket;
}

export interface Gallery {
  slug: string;
  title: string;
  description?: string;
  tags?: string[];
  cover?: string;
  images: GalleryImage[];
}

export interface Manifest {
  generatedAt: string;
  galleries: Gallery[];
}
