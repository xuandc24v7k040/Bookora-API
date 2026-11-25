import { Module } from '@nestjs/common';
import { RealtimeModule } from '@/modules/realtime/realtime.module';
import { StorageModule } from '@/shared/storage/storage.module';
import { SupportController } from './support.controller';
import { SupportRepository } from './support.repository';
import { SupportService } from './support.service';
import { SupportRealtimeService } from './support-realtime.service';
import { SupportFilesService } from './support-files.service';

@Module({
  imports: [RealtimeModule, StorageModule],
  controllers: [SupportController],
  providers: [
    SupportRepository,
    SupportService,
    SupportRealtimeService,
    SupportFilesService,
  ],
  exports: [SupportService],
})
export class SupportModule {}
