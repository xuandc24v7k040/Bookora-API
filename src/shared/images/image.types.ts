import type { StorageVisibility } from '../storage/storage.types';

export type ImageNamespace = 'categories' | 'products' | 'reviews' | 'avatars';
export type ImagePresetName = 'category' | 'product' | 'review' | 'avatar';

export interface ImagePreset {
  maxBytes: number;
  minWidth: number;
  minHeight: number;
  maxInputPixels: number;
  maxOutputEdge: number;
  webpQuality: number;
}

export interface UploadImageInput {
  file: Express.Multer.File;
  namespace: ImageNamespace;
  ownerId: string;
  visibility: StorageVisibility;
  preset: ImagePresetName;
}
