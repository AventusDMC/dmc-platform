ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "routeId" UUID;
ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "transportServiceTypeId" UUID;
ALTER TABLE "quote_items" ADD COLUMN IF NOT EXISTS "vehicleId" UUID;

CREATE INDEX IF NOT EXISTS "quote_items_routeId_idx" ON "quote_items"("routeId");
CREATE INDEX IF NOT EXISTS "quote_items_transportServiceTypeId_idx" ON "quote_items"("transportServiceTypeId");
CREATE INDEX IF NOT EXISTS "quote_items_vehicleId_idx" ON "quote_items"("vehicleId");
