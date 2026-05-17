ALTER TABLE "touring_routes"
  ADD COLUMN IF NOT EXISTS "estimatedDistanceKm" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "estimatedDriveHours" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "region" TEXT,
  ADD COLUMN IF NOT EXISTS "longDistance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "desertRoad" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "mountainRoad" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "seasonalHeatRisk" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sicPossible" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "overnightRisk" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reviewNotes" TEXT;

CREATE INDEX IF NOT EXISTS "touring_routes_region_idx" ON "touring_routes"("region");
CREATE INDEX IF NOT EXISTS "touring_routes_sicPossible_idx" ON "touring_routes"("sicPossible");
