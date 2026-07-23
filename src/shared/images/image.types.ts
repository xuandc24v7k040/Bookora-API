import type { StorageVisibility } from '../storage/storage.types';

export type ImageNamespace = 'categories' | 'products' | 'reviews' | 'avatars';
export type ImagePresetName =
  | 'category'
  | 'product'
  | 'productGallery'
  | 'optionValueThumbnail'
  | 'review'
  | 'avatar';

export interface ImagePreset {
  maxBytes: number;
  minWidth: number;
  minHeight: number;
  maxInputPixels: number;
  maxOutputEdge: number;
  webpQuality: number;
  fit?: 'inside' | 'cover';
}

export interface UploadImageInput {
  file: Express.Multer.File;
  namespace: ImageNamespace;
  ownerId: string;
  visibility: StorageVisibility;
  preset: ImagePresetName;
}
