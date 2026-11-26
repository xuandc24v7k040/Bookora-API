import { Module } from '@nestjs/common';
import { GhnClient } from './ghn.client';
import { GhnAddressResolver } from './ghn-address.resolver';
import { GhnQuoteService } from './ghn-quote.service';

@Module({
  providers: [GhnClient, GhnAddressResolver, GhnQuoteService],
  exports: [GhnQuoteService],
})
export class GhnModule {}
