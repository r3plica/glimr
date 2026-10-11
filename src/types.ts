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

export interface GallerySummary {
  slug: string;
  title: string;
  description: string;
  tags: string[];
  cover: string;
  imageCount: number;
  aliases: string[];
}

export interface Gallery extends Omit<GallerySummary, "imageCount"> {
  images: GalleryImage[];
}

export interface Manifest {
  formatVersion: 2;
  generatedAt: string;
  galleries: GallerySummary[];
}

export interface SearchIndex {
  formatVersion: 2;
  galleries: {
    slug: string;
    dir: string;
    images: { filename: string; tags?: string[] }[];
  }[];
}
