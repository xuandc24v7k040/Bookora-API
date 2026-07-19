# Schema Refactor Audit Report

## Repository baseline

- Branch: `master` (tracking `origin/master`).
- Commit: `56f183ef2674349acee215ecc1a753d895b29682`.
- Initial working tree: clean.
- Runtime: Node.js `v22.22.2`, Prisma CLI/Client `7.8.0`, PostgreSQL `18.4`.
- Database checked: local `bookora_db`, schema `public` (credentials intentionally omitted).
- Prisma schema path: `prisma/schema`, configured by `prisma.config.ts`.
- Migration path: `prisma/migrations`.
- GitNexus index refreshed at this commit: 2,006 nodes, 7,415 edges, 163 flows.

## Current schema

The repository starts with exactly 67 application models and 27 enums.

Models:

```text
User AuthSession AuthAttempt Branch UserAddress
Category ProductCategory MegaMenu MegaMenuColumn MegaMenuSection MegaMenuItem
Supplier Publisher Author ProductAuthor Product ProductMedia ProductOption
ProductOptionValue ProductVariant ProductVariantOptionValue ProductVariantMedia
ProductAttribute ProductAttributeValue FilterDefinition FilterOption CategoryFilterSet
BranchProductStock BranchProductPrice StockMovement StockTransfer StockTransferItem
Cart CartItem Coupon CouponBranch CouponProduct CouponCategory CouponUsage
Order OrderItem Payment PaymentTransaction OrderShipment OrderStatusHistory
Review ReviewReply Wishlist Notification RelatedProduct Combo ComboItem ComboBranch
BookSeries BookSeriesItem Preorder BookPreview BookPreviewPage AuditLog
Role Permission UserRole RolePermission UserPermission UserBranch UserBranchRole
UserBranchPermission
```

Enums:

```text
UserType PermissionEffect AuthProvider AuthAttemptType CategoryType MegaMenuItemType
ProductStatus ProductMediaType ProductAttributeType FilterType FilterSource
StockMovementType StockTransferStatus StockTransferItemStatus CouponScope CouponTargetType
DiscountType OrderStatus OrderItemType PreorderStatus AuditAction AuditTargetType
PaymentMethod PaymentStatus PaymentTransactionType PaymentTransactionStatus NotificationType
```

## Deployed migrations

All five migrations are recorded as finished and `prisma migrate status` reports the database up to date:

```text
20260604082015_init
20260621090000_authorization_phase_1
20260623120000_branch_scoped_staff_assignments
20260714090000_add_user_gender_birthday
20260714170000_two_level_addresses
```

No historical migration was modified.

## Repository commands

The actual scripts used are defined in `package.json`: Prisma format/validate/generate,
migrate deploy/status, catalog/development seed, TypeScript type-check, ESLint, Jest,
Nest build, OpenAPI export/contract validation and Redocly lint. CI additionally runs all
unit and E2E tests against PostgreSQL.

No frontend package exists in this workspace. Frontend regeneration is therefore outside
this repository unless the backend public OpenAPI contract changes.

## Legacy reference audit

- Runtime `src/**`: no Prisma access or DTO/OpenAPI reference to any of the 31 models to remove.
- `docs/openapi.json`: 66 operations, 64 schemas, zero references to the 31 models or the
  `PREORDER`/`FREE_SHIPPING` enum values.
- Seeds/tests: no business-data fixture for the legacy catalog/commerce tables. The only
  inventory-related runtime test reference is the authorization permission probe, not a
  Prisma model reference.
- Prisma schema: all legacy references are relation fields or model definitions in
  `20-auth-users-branches`, `21-categories-menu`, `22-products`, `23-filters`,
  `24-inventory-pricing`, `26-coupons`, `27-orders-payments-shipping`, `28-engagement`,
  `29-merchandising`, and `30-audit`.
- `99-service-rules.prisma`: contains obsolete documentation for reservation,
  StockMovement, StockTransfer, BranchProductPrice, shipment and AuditLog behavior.

GitNexus did not identify catalog/products/inventory/orders execution flows. Current runtime
modules are Auth, Users, Authorization, VietMap and Health. This agrees with the text scan.

## Source-to-target differences

- Products currently keep ISBN/publication/page/package/cover fields on `Product`; target moves
  variant-specific fields to `ProductVariant` and removes `coverType`.
- Product options are global (`code @unique`); target scopes options to Product.
- Variant media and branch price are separate legacy tables; target folds them into
  ProductMedia/ProductVariant.
- Inventory currently contains reservation, movement and transfer concepts; target uses stock
  plus two new receipt models.
- Coupon targeting/usage counters, Order combo/shipment/history, Payment transactions,
  ReviewReply, notification, merchandising and audit models exist only in schema and are empty.
- Target adds `Order.stockDeductedAt/stockRestoredAt` and official reply fields on Review.
- The 13 Phase 8 tables require only relation-array changes; no target decision requires a
  physical column, key, index, nullability, default or `onDelete` change on them.

## Boundary conclusion

The approved 38-model target is compatible with the runtime boundary. Physical changes to the
13 Phase 8 tables remain forbidden. Destructive cleanup remains gated by clone preflight,
backfill verification, core hashes and regression.

## Blocking drift discovered at the no-op gate

Before any schema organization edit, the live/clone-to-Prisma diff produces:

```sql
CREATE INDEX "users_type_idx" ON "users"("type");
CREATE INDEX "users_is_active_idx" ON "users"("is_active");
```

Both indexes are declared in the current Prisma `User` model but do not exist in the initial
migration or any forward migration. Git blame traces both declarations to commit `2fbff71d`.
The database contains neither index. This is pre-existing schema drift on an immutable Phase 8
table, not a change introduced by this refactor.
