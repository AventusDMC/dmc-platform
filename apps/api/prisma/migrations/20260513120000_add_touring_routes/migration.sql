ALTER TYPE "TransportServiceClassification" ADD VALUE IF NOT EXISTS 'TOURING_ROUTE';

CREATE TYPE "TouringRoutePricingBasis" AS ENUM ('PER_VEHICLE', 'PER_DAY');

CREATE TABLE "touring_routes" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startCity" TEXT NOT NULL,
    "durationDays" INTEGER NOT NULL DEFAULT 1,
    "routeDescription" TEXT,
    "mainDestinations" JSONB,
    "includedKm" DOUBLE PRECISION,
    "includedHours" DOUBLE PRECISION,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "touring_routes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "touring_route_stops" (
    "id" UUID NOT NULL,
    "touringRouteId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "city" TEXT NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "touring_route_stops_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "touring_route_pricings" (
    "id" UUID NOT NULL,
    "touringRouteId" UUID NOT NULL,
    "supplierId" UUID,
    "vehicleId" UUID,
    "transportServiceTypeId" UUID,
    "pricingBasis" "TouringRoutePricingBasis" NOT NULL DEFAULT 'PER_VEHICLE',
    "minPax" INTEGER NOT NULL DEFAULT 1,
    "maxPax" INTEGER NOT NULL DEFAULT 99,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "baseCost" DOUBLE PRECISION NOT NULL,
    "costPerDay" DOUBLE PRECISION,
    "includedKm" DOUBLE PRECISION,
    "includedHours" DOUBLE PRECISION,
    "extraKmRate" DOUBLE PRECISION,
    "extraHourRate" DOUBLE PRECISION,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "touring_route_pricings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "quote_items" ADD COLUMN "touringRouteId" UUID;
ALTER TABLE "package_template_components" ADD COLUMN "touringRouteId" UUID;
ALTER TABLE "excursion_template_components" ADD COLUMN "touringRouteId" UUID;

CREATE UNIQUE INDEX "touring_routes_code_key" ON "touring_routes"("code");
CREATE INDEX "touring_routes_active_name_idx" ON "touring_routes"("active", "name");
CREATE INDEX "touring_routes_startCity_idx" ON "touring_routes"("startCity");
CREATE UNIQUE INDEX "touring_route_stops_touringRouteId_order_key" ON "touring_route_stops"("touringRouteId", "order");
CREATE INDEX "touring_route_stops_touringRouteId_idx" ON "touring_route_stops"("touringRouteId");
CREATE INDEX "touring_route_pricings_touringRouteId_idx" ON "touring_route_pricings"("touringRouteId");
CREATE INDEX "touring_route_pricings_supplierId_idx" ON "touring_route_pricings"("supplierId");
CREATE INDEX "touring_route_pricings_vehicleId_idx" ON "touring_route_pricings"("vehicleId");
CREATE INDEX "touring_route_pricings_transportServiceTypeId_idx" ON "touring_route_pricings"("transportServiceTypeId");
CREATE INDEX "touring_route_pricings_active_touringRouteId_minPax_maxPax_idx" ON "touring_route_pricings"("active", "touringRouteId", "minPax", "maxPax");
CREATE INDEX "quote_items_touringRouteId_idx" ON "quote_items"("touringRouteId");
CREATE INDEX "package_template_components_touringRouteId_idx" ON "package_template_components"("touringRouteId");
CREATE INDEX "excursion_template_components_touringRouteId_idx" ON "excursion_template_components"("touringRouteId");

ALTER TABLE "touring_route_stops" ADD CONSTRAINT "touring_route_stops_touringRouteId_fkey" FOREIGN KEY ("touringRouteId") REFERENCES "touring_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "touring_route_pricings" ADD CONSTRAINT "touring_route_pricings_touringRouteId_fkey" FOREIGN KEY ("touringRouteId") REFERENCES "touring_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "touring_route_pricings" ADD CONSTRAINT "touring_route_pricings_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "touring_route_pricings" ADD CONSTRAINT "touring_route_pricings_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "touring_route_pricings" ADD CONSTRAINT "touring_route_pricings_transportServiceTypeId_fkey" FOREIGN KEY ("transportServiceTypeId") REFERENCES "transport_service_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_touringRouteId_fkey" FOREIGN KEY ("touringRouteId") REFERENCES "touring_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "package_template_components" ADD CONSTRAINT "package_template_components_touringRouteId_fkey" FOREIGN KEY ("touringRouteId") REFERENCES "touring_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "excursion_template_components" ADD CONSTRAINT "excursion_template_components_touringRouteId_fkey" FOREIGN KEY ("touringRouteId") REFERENCES "touring_routes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
