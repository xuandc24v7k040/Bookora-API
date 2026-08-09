CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE OR REPLACE FUNCTION public.bookora_normalize_search(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS $$
  SELECT lower(
    regexp_replace(
      public.unaccent('public.unaccent'::regdictionary, input),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

CREATE INDEX IF NOT EXISTS products_name_search_trgm_idx
  ON products USING gin (public.bookora_normalize_search(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS authors_name_search_trgm_idx
  ON authors USING gin (public.bookora_normalize_search(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS publishers_name_search_trgm_idx
  ON publishers USING gin (public.bookora_normalize_search(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS product_variants_isbn_search_trgm_idx
  ON product_variants USING gin (public.bookora_normalize_search(isbn) gin_trgm_ops)
  WHERE isbn IS NOT NULL;

CREATE INDEX IF NOT EXISTS product_variants_barcode_search_trgm_idx
  ON product_variants USING gin (public.bookora_normalize_search(barcode) gin_trgm_ops)
  WHERE barcode IS NOT NULL;

CREATE INDEX IF NOT EXISTS product_variants_sku_search_trgm_idx
  ON product_variants USING gin (public.bookora_normalize_search(sku) gin_trgm_ops);
