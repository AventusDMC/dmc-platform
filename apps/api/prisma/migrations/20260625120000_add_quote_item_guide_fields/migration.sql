-- Additive, nullable, inert columns to persist the guide pricing inputs
-- (guideType, guideDuration, guideOvernight) so a guide update payload can be
-- rebuilt without parsing pricingDescription. No default, no NOT NULL, no FK,
-- no backfill here. These do not feed pricing; pricingDescription generation and
-- guide totals are unchanged. Non-guide items leave them NULL.

-- AlterTable
ALTER TABLE "quote_items" ADD COLUMN     "guideType" TEXT;
ALTER TABLE "quote_items" ADD COLUMN     "guideDuration" TEXT;
ALTER TABLE "quote_items" ADD COLUMN     "guideOvernight" BOOLEAN;
