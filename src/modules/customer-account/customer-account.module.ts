import { Module } from '@nestjs/common';
import { AuthModule } from '@/modules/auth/auth.module';
import { ImagesModule } from '@/shared/images/images.module';
import { StorageModule } from '@/shared/storage/storage.module';
import { CustomerAccountController } from './customer-account.controller';
import { CustomerAccountRepository } from './customer-account.repository';
import { CustomerAccountService } from './customer-account.service';

@Module({
  imports: [AuthModule, ImagesModule, StorageModule],
  controllers: [CustomerAccountController],
  providers: [CustomerAccountRepository, CustomerAccountService],
})
export class CustomerAccountModule {}
