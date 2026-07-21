-- Abort with actionable evidence before adding the concurrency constraint.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM product_variants
    WHERE is_default = TRUE
    GROUP BY product_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Phase 10B preflight failed: a product has more than one default variant';
  END IF;
END $$;

-- PostgreSQL partial unique index: at most one default Variant per Product.
CREATE UNIQUE INDEX "product_variants_one_default_per_product"
ON "product_variants" ("product_id")
WHERE "is_default" = TRUE;
