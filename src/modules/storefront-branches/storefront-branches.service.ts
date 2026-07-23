import { Injectable } from '@nestjs/common';
import { StorefrontBranchesRepository } from './storefront-branches.repository';

@Injectable()
export class StorefrontBranchesService {
  constructor(private readonly repository: StorefrontBranchesRepository) {}

  list() {
    return this.repository.listActive();
  }
}
