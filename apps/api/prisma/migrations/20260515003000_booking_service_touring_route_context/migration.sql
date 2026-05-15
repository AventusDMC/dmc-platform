ALTER TABLE "booking_services" ADD COLUMN "touringRouteId" UUID;
ALTER TABLE "booking_services" ADD COLUMN "touringRoutePricingId" UUID;

CREATE INDEX "booking_services_touringRouteId_idx" ON "booking_services"("touringRouteId");
CREATE INDEX "booking_services_touringRoutePricingId_idx" ON "booking_services"("touringRoutePricingId");

ALTER TABLE "booking_services"
  ADD CONSTRAINT "booking_services_touringRouteId_fkey"
  FOREIGN KEY ("touringRouteId") REFERENCES "touring_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "booking_services"
  ADD CONSTRAINT "booking_services_touringRoutePricingId_fkey"
  FOREIGN KEY ("touringRoutePricingId") REFERENCES "touring_route_pricings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
