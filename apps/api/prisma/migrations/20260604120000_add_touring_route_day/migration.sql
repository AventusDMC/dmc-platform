-- CreateTable
CREATE TABLE "touring_route_days" (
    "id" UUID NOT NULL,
    "touringRouteId" UUID NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "distanceKm" DOUBLE PRECISION,
    "driveMinutes" INTEGER,
    "lunchIncluded" BOOLEAN NOT NULL DEFAULT false,
    "dinnerIncluded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "touring_route_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "touring_route_days_touringRouteId_idx" ON "touring_route_days"("touringRouteId");

-- CreateIndex
CREATE UNIQUE INDEX "touring_route_days_touringRouteId_dayNumber_key" ON "touring_route_days"("touringRouteId", "dayNumber");

-- AddForeignKey
ALTER TABLE "touring_route_days" ADD CONSTRAINT "touring_route_days_touringRouteId_fkey" FOREIGN KEY ("touringRouteId") REFERENCES "touring_routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
