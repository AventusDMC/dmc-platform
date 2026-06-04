-- CreateTable
CREATE TABLE "points_of_interest" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "cityId" UUID,
    "operationalAreaId" UUID,
    "activityId" UUID,
    "entranceFeeId" UUID,
    "stopType" TEXT,
    "visitDurationMinutes" INTEGER,
    "guideRecommended" BOOLEAN NOT NULL DEFAULT false,
    "lunchOpportunity" BOOLEAN NOT NULL DEFAULT false,
    "photoStop" BOOLEAN NOT NULL DEFAULT false,
    "viewpoint" BOOLEAN NOT NULL DEFAULT false,
    "religiousSite" BOOLEAN NOT NULL DEFAULT false,
    "imageUrl" TEXT,
    "operationalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "points_of_interest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_of_interest_translations" (
    "id" UUID NOT NULL,
    "poiId" UUID NOT NULL,
    "locale" TEXT NOT NULL,
    "title" TEXT,
    "shortDescription" TEXT,
    "longDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "point_of_interest_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "points_of_interest_code_key" ON "points_of_interest"("code");

-- CreateIndex
CREATE INDEX "points_of_interest_isActive_sortOrder_idx" ON "points_of_interest"("isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "points_of_interest_cityId_idx" ON "points_of_interest"("cityId");

-- CreateIndex
CREATE INDEX "points_of_interest_operationalAreaId_idx" ON "points_of_interest"("operationalAreaId");

-- CreateIndex
CREATE INDEX "point_of_interest_translations_poiId_idx" ON "point_of_interest_translations"("poiId");

-- CreateIndex
CREATE UNIQUE INDEX "point_of_interest_translations_poiId_locale_key" ON "point_of_interest_translations"("poiId", "locale");

-- AddForeignKey
ALTER TABLE "points_of_interest" ADD CONSTRAINT "points_of_interest_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_of_interest" ADD CONSTRAINT "points_of_interest_operationalAreaId_fkey" FOREIGN KEY ("operationalAreaId") REFERENCES "operational_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_of_interest" ADD CONSTRAINT "points_of_interest_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "points_of_interest" ADD CONSTRAINT "points_of_interest_entranceFeeId_fkey" FOREIGN KEY ("entranceFeeId") REFERENCES "entrance_fees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_of_interest_translations" ADD CONSTRAINT "point_of_interest_translations_poiId_fkey" FOREIGN KEY ("poiId") REFERENCES "points_of_interest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
