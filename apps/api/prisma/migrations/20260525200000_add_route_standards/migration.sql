-- Route Standards: canonical single source of truth for route distance,
-- duration, operational buffers, and risk flags. Keyed by routeCode.
-- Additive only — does NOT modify the routes or touring_routes tables.

CREATE TABLE "route_standards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "routeCode" TEXT NOT NULL,
    "routeName" TEXT NOT NULL,
    "fromCity" TEXT,
    "toCity" TEXT,
    "destinationArea" TEXT,
    "standardDistanceKm" DOUBLE PRECISION,
    "standardDurationHours" DOUBLE PRECISION,
    "operationalBufferMinutes" INTEGER,
    "longDistanceFlag" BOOLEAN NOT NULL DEFAULT false,
    "overnightRisk" BOOLEAN NOT NULL DEFAULT false,
    "mountainRoadFlag" BOOLEAN NOT NULL DEFAULT false,
    "borderCrossingFlag" BOOLEAN NOT NULL DEFAULT false,
    "airportRouteFlag" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_standards_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "route_standards_routeCode_key" ON "route_standards"("routeCode");
CREATE INDEX "route_standards_isActive_routeCode_idx" ON "route_standards"("isActive", "routeCode");
CREATE INDEX "route_standards_fromCity_toCity_idx" ON "route_standards"("fromCity", "toCity");
