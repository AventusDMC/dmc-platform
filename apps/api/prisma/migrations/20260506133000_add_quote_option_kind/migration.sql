-- Add a discriminator so active quote hotel option sets can share the existing
-- quote_options table without being treated as commercial quote options.
CREATE TYPE "QuoteOptionKind" AS ENUM ('HOTEL_OPTION_SET', 'COMMERCIAL_OPTION');

ALTER TABLE "quote_options"
ADD COLUMN "kind" "QuoteOptionKind" NOT NULL DEFAULT 'COMMERCIAL_OPTION';

UPDATE "quote_options"
SET "kind" = 'HOTEL_OPTION_SET'
WHERE EXISTS (
  SELECT 1
  FROM "quote_hotel_options"
  WHERE "quote_hotel_options"."quoteOptionId" = "quote_options"."id"
);

CREATE INDEX "quote_options_kind_idx" ON "quote_options"("kind");
