import { randomUUID } from 'node:crypto';
import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { R2ObjectStorageService } from '@/shared/storage/r2-object-storage.service';
import type { AuthenticatedUser } from '@/modules/auth/types/authenticated-user.type';
import { SupportRepository } from './support.repository';
import { SupportService } from './support.service';
import {
  assertSupportReply,
  supportInvalid,
  supportNotFound,
  supportScope,
} from './support.policy';
import { validateSupportFile } from './support-file-validation';
import type { SupportUploadContextDto } from './dto/support.dto';

@Injectable()
export class SupportFilesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SupportFilesService.name);
  private timer?: ReturnType<typeof setInterval>;
  private cleaning?: Promise<void>;

  constructor(
    private readonly repository: SupportRepository,
    private readonly support: SupportService,
    private readonly storage: R2ObjectStorageService,
  ) {}

  async upload(
    actor: AuthenticatedUser,
    dto: SupportUploadContextDto,
    file: Express.Multer.File | undefined,
    branchId?: string,
  ) {
    if (!file)
      supportInvalid('SUPPORT_ATTACHMENT_INVALID', 'Vui lòng chọn tệp.');
    const metadata = await validateSupportFile(file);
    const existing = dto.ticketId
      ? await this.support.ticket(actor, dto.ticketId, branchId)
      : null;
    if (existing) assertSupportReply(actor, existing);
    const context = existing
      ? existing
      : await this.support.context(actor, {
          type:
            dto.type ??
            supportInvalid(
              'SUPPORT_CONTEXT_INVALID',
              'Vui lòng chọn loại hỗ trợ.',
            ),
          branchId: dto.branchId,
          orderId: dto.orderId,
        });
    const scopeKey = supportScope(context);
    const record = await this.repository.prisma.$transaction(async (tx) => {
      await this.repository.lockScope(tx, `upload:${actor.id}`);
      if (
        (await tx.supportAttachment.count({
          where: { ownerId: actor.id, messageId: null },
        })) >= 20
      )
        supportInvalid(
          'SUPPORT_UPLOAD_LIMIT',
          'Vui lòng gửi hoặc xóa các tệp đã tải trước khi tải thêm.',
        );
      return tx.supportAttachment.create({
        data: {
          ...metadata,
          ownerId: actor.id,
          scopeKey,
          objectKey: `support/staged/${randomUUID()}`,
          expiresAt: new Date(Date.now() + 3600000),
        },
      });
    });
    try {
      await this.storage.upload({
        visibility: 'private',
        key: record.objectKey,
        body: file.buffer,
        contentType: metadata.mimeType,
        cacheControl: 'private, no-store',
      });
      await this.repository.prisma.supportAttachment.update({
        where: { id: record.id },
        data: { ready: true },
      });
      return { id: record.id, ...metadata };
    } catch (error) {
      // Keep a tracked expired row even for an ambiguous R2 response; cleanup retries deletion.
      await this.repository.prisma.supportAttachment
        .update({ where: { id: record.id }, data: { expiresAt: new Date(0) } })
        .catch(() => undefined);
      throw error;
    }
  }

  async discard(actor: AuthenticatedUser, id: string) {
    await this.repository.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM support_attachments WHERE id = ${id} FOR UPDATE`;
      const row = await tx.supportAttachment.findUnique({ where: { id } });
      if (!row || row.ownerId !== actor.id || row.messageId) supportNotFound();
      await tx.supportAttachment.update({
        where: { id },
        data: { expiresAt: new Date(0), ready: false },
      });
    });
    return { id };
  }

  async download(actor: AuthenticatedUser, id: string, branchId?: string) {
    const row = await this.repository.prisma.supportAttachment.findUnique({
      where: { id },
      include: { message: { select: { ticketId: true } } },
    });
    if (!row?.message || !row.ready) supportNotFound();
    await this.support.ticket(actor, row.message.ticketId, branchId);
    const body = await this.storage.readPrivate(row.objectKey);
    return { ...row, body };
  }

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.cleanup().catch(() =>
        this.logger.warn('Support staged cleanup cần thử lại.'),
      );
    }, 60000);
    this.timer.unref();
  }

  cleanup(): Promise<void> {
    if (this.cleaning) return this.cleaning;
    this.cleaning = this.removeExpired().finally(() => {
      this.cleaning = undefined;
    });
    return this.cleaning;
  }

  private async removeExpired(): Promise<void> {
    // Commit a non-attachable state before network deletion; each failed delete remains tracked.
    const rows = await this.repository.prisma.$transaction(async (tx) => {
      const candidates = await tx.$queryRaw<
        Array<{ id: string; object_key: string }>
      >`SELECT id, object_key FROM support_attachments WHERE message_id IS NULL AND expires_at < (now() AT TIME ZONE 'UTC') ORDER BY expires_at LIMIT 50 FOR UPDATE SKIP LOCKED`;
      await tx.supportAttachment.updateMany({
        where: { id: { in: candidates.map((row) => row.id) } },
        data: { ready: false },
      });
      return candidates;
    });
    for (const row of rows) {
      try {
        await this.storage.delete({
          visibility: 'private',
          key: row.object_key,
        });
        await this.repository.prisma.supportAttachment.deleteMany({
          where: { id: row.id, messageId: null, ready: false },
        });
      } catch {
        this.logger.warn('Support staged object chưa xóa được; sẽ thử lại.');
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    await this.cleaning;
  }
}
