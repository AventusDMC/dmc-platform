ALTER TABLE "touring_routes"
ADD COLUMN "operationalType" TEXT,
ADD COLUMN "routeCategory" TEXT,
ADD COLUMN "guideRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "overnight" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "departureCapable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "capacityBased" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "primaryOperatingCity" TEXT,
ADD COLUMN "operationalComplexity" TEXT;

CREATE INDEX "touring_routes_operationalType_idx" ON "touring_routes"("operationalType");
CREATE INDEX "touring_routes_routeCategory_idx" ON "touring_routes"("routeCategory");
