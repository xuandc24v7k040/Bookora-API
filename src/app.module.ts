import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { configurations, validateEnv } from '@/config';
import { getEnvFilePaths } from '@/config/env.loader';
import { DatabaseModule } from '@/database/database.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { HealthModule } from '@/modules/health/health.module';
import { VietMapModule } from '@/modules/integrations/vietmap/vietmap.module';
import { UsersModule } from '@/modules/users/users.module';
import { CategoriesModule } from '@/modules/categories/categories.module';
import { SuppliersModule } from '@/modules/suppliers/suppliers.module';
import { PublishersModule } from '@/modules/publishers/publishers.module';
import { AuthorsModule } from '@/modules/authors/authors.module';
import { ProductAttributesModule } from '@/modules/product-attributes/product-attributes.module';
import { ProductsModule } from '@/modules/products/products.module';
import { ProductMediaModule } from '@/modules/product-media/product-media.module';
import { InventoryModule } from '@/modules/inventory/inventory.module';
import { StockReceiptsModule } from '@/modules/stock-receipts/stock-receipts.module';
import { CustomerAccountModule } from '@/modules/customer-account/customer-account.module';
import { CustomerAddressesModule } from '@/modules/customer-addresses/customer-addresses.module';
import { StorefrontBranchesModule } from '@/modules/storefront-branches/storefront-branches.module';
import { StorefrontCatalogModule } from '@/modules/storefront-catalog/storefront-catalog.module';
import { CartModule } from '@/modules/cart/cart.module';
import { CheckoutModule } from '@/modules/checkout/checkout.module';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { ShippingModule } from '@/modules/shipping/shipping.module';
import { CustomerOrdersModule } from '@/modules/customer-orders/customer-orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: getEnvFilePaths(),
      load: configurations,
      validate: validateEnv,
      cache: true,
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    DatabaseModule,
    HealthModule,
    VietMapModule,
    UsersModule,
    CategoriesModule,
    SuppliersModule,
    PublishersModule,
    AuthorsModule,
    ProductAttributesModule,
    ProductsModule,
    ProductMediaModule,
    InventoryModule,
    StockReceiptsModule,
    CustomerAccountModule,
    CustomerAddressesModule,
    StorefrontBranchesModule,
    StorefrontCatalogModule,
    CartModule,
    ShippingModule,
    CheckoutModule,
    PaymentsModule,
    CustomerOrdersModule,
    AuthModule,
  ],
})
export class AppModule {}
