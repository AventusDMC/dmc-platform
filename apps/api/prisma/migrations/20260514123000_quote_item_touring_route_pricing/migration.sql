ALTER TABLE "quote_items" ADD COLUMN "touringRoutePricingId" UUID;

CREATE INDEX "quote_items_touringRoutePricingId_idx" ON "quote_items"("touringRoutePricingId");

ALTER TABLE "quote_items"
  ADD CONSTRAINT "quote_items_touringRoutePricingId_fkey"
  FOREIGN KEY ("touringRoutePricingId") REFERENCES "touring_route_pricings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
