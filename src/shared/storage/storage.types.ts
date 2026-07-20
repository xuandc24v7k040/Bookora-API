export type StorageVisibility = 'public' | 'private';

export interface UploadObjectInput {
  visibility: StorageVisibility;
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
}

export interface UploadedObject {
  bucket: string;
  key: string;
  url: string | null;
  contentType: string;
  size: number;
  etag?: string;
}
