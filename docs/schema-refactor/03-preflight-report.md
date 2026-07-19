# Schema Refactor Preflight Report

Database measured: frozen restored clone `bookora_schema_refactor_rehearsal_20260719`.

Result: **PASS**, blocker count `0`.

The versioned command was:

```text
npm run schema-refactor:preflight -- --output=docs/schema-refactor/artifacts/preflight.json
```

Checks with zero conflicts:

- branch price variants with multiple price tuples;
- non-zero reserved stock;
- reviews with multiple replies;
- unlinked or mismatched coupon usage;
- orphan/invalid product option mappings or two values for one option;
- OrderItem without Variant or with Combo/non-product item type;
- orphan variant media or multiple primary media;
- `ProductStatus.PREORDER` data;
- `DiscountType.FREE_SHIPPING` data;
- duplicates in all six Phase 8 authorization mapping tables;
- users with multiple active primary branch assignments.

All 28 legacy tables without a direct target are empty. The three backfill sources
`branch_product_prices`, `product_variant_media`, and `review_replies` are also empty. All
Product/Variant/Cart/Coupon/Order/Payment/Review/Wishlist business tables currently contain zero
rows. Consequently every planned backfill is a verified zero-row no-op on this clone; scripts
and verification still remain required before cleanup.

The sanitized machine-readable result is `artifacts/preflight.json`; it contains only counts
and table names, no credentials or personal data.
