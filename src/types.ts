export interface GalleryImage {
  src: string;
  filename: string;
  tags?: string[];
  width?: number;
  height?: number;
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
