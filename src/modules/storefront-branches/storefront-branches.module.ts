import { Module } from '@nestjs/common';
import { StorefrontBranchesController } from './storefront-branches.controller';
import { StorefrontBranchesRepository } from './storefront-branches.repository';
import { StorefrontBranchesService } from './storefront-branches.service';

@Module({
  controllers: [StorefrontBranchesController],
  providers: [StorefrontBranchesRepository, StorefrontBranchesService],
})
export class StorefrontBranchesModule {}
