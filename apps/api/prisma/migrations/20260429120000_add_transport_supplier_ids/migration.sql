ALTER TABLE "vehicle_rates" ADD COLUMN "supplierId" UUID;

ALTER TABLE "transport_pricing_rules" ADD COLUMN "supplierId" UUID;

CREATE INDEX "vehicle_rates_supplierId_idx" ON "vehicle_rates"("supplierId");

CREATE INDEX "transport_pricing_rules_supplierId_idx" ON "transport_pricing_rules"("supplierId");

ALTER TABLE "vehicle_rates"
  ADD CONSTRAINT "vehicle_rates_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "transport_pricing_rules"
  ADD CONSTRAINT "transport_pricing_rules_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
