-- Additive, nullable, inert column to persist the operator-entered meal name
-- (customServiceName) so it can be rebuilt into a meal update payload without
-- parsing pricingDescription. No default, no NOT NULL, no FK, no backfill here.
-- Does not feed pricing; pricingDescription generation is unchanged.

-- AlterTable
ALTER TABLE "quote_items" ADD COLUMN     "customServiceName" TEXT;
