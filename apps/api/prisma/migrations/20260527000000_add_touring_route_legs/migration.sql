-- Touring Route Legs v1 — ordered Route Standard movements that compose
-- the operational flow of a Touring Route. Pricing layer is unchanged
-- (TouringRoutePricing remains the pricing authority); these legs only
-- describe movement + timing + risk profile.

CREATE TABLE "touring_route_legs" (
  "id"                    UUID NOT NULL,
  "touringRouteId"        UUID NOT NULL,
  "sequence"              INTEGER NOT NULL,
  "routeStandardId"       UUID,
  "fromAreaId"            UUID,
  "toAreaId"              UUID,
  "legType"               TEXT NOT NULL DEFAULT 'DRIVE',
  "notes"                 TEXT,
  "estimatedStopMinutes"  INTEGER,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "touring_route_legs_pkey" PRIMARY KEY ("id")
);

-- Unique sequence per touring route — guards against two legs landing
-- at the same position. Reordering reassigns sequences.
CREATE UNIQUE INDEX "touring_route_legs_touringRouteId_sequence_key"
  ON "touring_route_legs"("touringRouteId", "sequence");

CREATE INDEX "touring_route_legs_touringRouteId_sequence_idx"
  ON "touring_route_legs"("touringRouteId", "sequence");

CREATE INDEX "touring_route_legs_routeStandardId_idx"
  ON "touring_route_legs"("routeStandardId");

-- Cascade delete on touring_route → its legs go with it. This is safe
-- because legs are pure operational metadata; deleting a touring route
-- already wipes its pricing, stops, etc., and the legs are coupled to
-- that lifecycle.
ALTER TABLE "touring_route_legs"
  ADD CONSTRAINT "touring_route_legs_touringRouteId_fkey"
  FOREIGN KEY ("touringRouteId") REFERENCES "touring_routes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ON DELETE SET NULL on route_standards — removing a Route Standard
-- shouldn't cascade-delete every touring-route leg referencing it.
-- The leg loses its standard link but keeps from/to areas + sequence,
-- so it stays visible in the touring route's operational flow.
ALTER TABLE "touring_route_legs"
  ADD CONSTRAINT "touring_route_legs_routeStandardId_fkey"
  FOREIGN KEY ("routeStandardId") REFERENCES "route_standards"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Same SET NULL semantics for the operational area FKs — deactivating
-- an area shouldn't blow away every leg using it.
ALTER TABLE "touring_route_legs"
  ADD CONSTRAINT "touring_route_legs_fromAreaId_fkey"
  FOREIGN KEY ("fromAreaId") REFERENCES "operational_areas"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "touring_route_legs"
  ADD CONSTRAINT "touring_route_legs_toAreaId_fkey"
  FOREIGN KEY ("toAreaId") REFERENCES "operational_areas"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
