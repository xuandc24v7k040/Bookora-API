-- Deterministic one-time backfill generated with xorshift32 seed 0xB00C0A.
-- SKU uniqueness was verified before freezing this manifest.
WITH weight_manifest (sku, weight_gram) AS (
  VALUES
    ('RELIFE-12-MANUAL-10B', 330),
    ('FO024-001', 660),
    ('FO024-BLUE-20-MANUAL', 400),
    ('FO024-003', 390),
    ('FO024-004', 420),
    ('FO024-005', 870),
    ('FO024-006', 370),
    ('COCO-001', 440),
    ('COCO-002', 260),
    ('COCO-003', 310),
    ('JKS-01', 300)
)
UPDATE "product_variants" AS variant
SET "weight_gram" = manifest.weight_gram
FROM weight_manifest AS manifest
WHERE variant."sku" = manifest.sku
  AND variant."weight_gram" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "product_variants"
    WHERE "weight_gram" IS NULL
       OR "weight_gram" <= 0
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce product variant weight constraints: invalid data remains';
  END IF;
END $$;

ALTER TABLE "product_variants"
ALTER COLUMN "weight_gram" SET NOT NULL;

ALTER TABLE "product_variants"
ADD CONSTRAINT "product_variants_weight_gram_positive"
CHECK ("weight_gram" > 0);
