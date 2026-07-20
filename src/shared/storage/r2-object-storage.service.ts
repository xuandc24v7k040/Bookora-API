import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type {
  StorageVisibility,
  UploadedObject,
  UploadObjectInput,
} from './storage.types';

interface StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBucket: string;
  privateBucket: string;
  publicBaseUrl: string;
}

@Injectable()
export class R2ObjectStorageService {
  private readonly logger = new Logger(R2ObjectStorageService.name);
  private readonly config: StorageConfig;
  private readonly client: S3Client;

  constructor(configService: ConfigService) {
    this.config = configService.getOrThrow<StorageConfig>('storage');
    this.client = new S3Client({
      endpoint: this.config.endpoint,
      region: this.config.region,
      credentials: {
        accessKeyId: this.config.accessKeyId,
        secretAccessKey: this.config.secretAccessKey,
      },
    });
  }

  async upload(input: UploadObjectInput): Promise<UploadedObject> {
    const key = this.normalizeKey(input.key);
    const bucket = this.bucketFor(input.visibility);
    try {
      const result = await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: input.body,
          ContentType: input.contentType,
          CacheControl: input.cacheControl,
        }),
      );
      return {
        bucket,
        key,
        url: input.visibility === 'public' ? this.getPublicUrl(key) : null,
        contentType: input.contentType,
        size: input.body.byteLength,
        ...(result.ETag ? { etag: result.ETag } : {}),
      };
    } catch (error) {
      this.logger.error(
        `R2 upload failed visibility=${input.visibility} key=${key} error=${this.errorName(error)}`,
      );
      throw new ServiceUnavailableException({
        code: 'STORAGE_UPLOAD_FAILED',
        message: 'Không thể tải tệp lên kho lưu trữ',
      });
    }
  }

  async delete(input: {
    visibility: StorageVisibility;
    key: string;
  }): Promise<void> {
    const key = this.normalizeKey(input.key);
    const bucket = this.bucketFor(input.visibility);
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: key }),
      );
    } catch (error) {
      this.logger.error(
        `R2 delete failed visibility=${input.visibility} key=${key} error=${this.errorName(error)}`,
      );
      throw new ServiceUnavailableException({
        code: 'STORAGE_DELETE_FAILED',
        message: 'Không thể xóa tệp khỏi kho lưu trữ',
      });
    }
  }

  getPublicUrl(key: string): string {
    return `${this.config.publicBaseUrl}/${this.normalizeKey(key)}`;
  }

  extractPublicKey(url: string): string | null {
    try {
      const base = new URL(`${this.config.publicBaseUrl}/`);
      const candidate = new URL(url);
      if (candidate.origin !== base.origin) return null;
      const basePath = base.pathname.replace(/\/+$/, '');
      if (!candidate.pathname.startsWith(`${basePath}/`)) return null;
      return this.normalizeKey(
        decodeURIComponent(candidate.pathname.slice(basePath.length + 1)),
      );
    } catch {
      return null;
    }
  }

  private bucketFor(visibility: StorageVisibility): string {
    return visibility === 'public'
      ? this.config.publicBucket
      : this.config.privateBucket;
  }

  private normalizeKey(key: string): string {
    const normalized = key.replace(/\\/g, '/').replace(/^\/+/, '');
    if (
      !normalized ||
      normalized.split('/').some((part) => !part || part === '..')
    ) {
      throw new ServiceUnavailableException({
        code: 'STORAGE_CONFIGURATION_INVALID',
        message: 'Khóa lưu trữ không hợp lệ',
      });
    }
    return normalized;
  }

  private errorName(error: unknown): string {
    return error instanceof Error ? error.name : 'UnknownError';
  }
}
