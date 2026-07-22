CREATE TYPE "ProductOptionPresentationType" AS ENUM ('TEXT', 'COLOR', 'IMAGE');

ALTER TABLE "product_options"
ADD COLUMN "presentation_type" "ProductOptionPresentationType" NOT NULL DEFAULT 'TEXT';

UPDATE "product_options" AS option
SET "presentation_type" = CASE
  WHEN EXISTS (
    SELECT 1
    FROM "product_option_values" AS value
    WHERE value."option_id" = option."id"
      AND value."color_code" IS NOT NULL
  ) THEN 'COLOR'::"ProductOptionPresentationType"
  WHEN EXISTS (
    SELECT 1
    FROM "product_option_values" AS value
    WHERE value."option_id" = option."id"
      AND value."image_url" IS NOT NULL
  ) THEN 'IMAGE'::"ProductOptionPresentationType"
  ELSE 'TEXT'::"ProductOptionPresentationType"
END;
