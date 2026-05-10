ALTER TABLE "excursion_templates"
  ADD COLUMN "operatingDays" TEXT,
  ADD COLUMN "recommendedDepartureTime" TEXT,
  ADD COLUMN "estimatedReturnTime" TEXT,
  ADD COLUMN "minimumPax" INTEGER,
  ADD COLUMN "maximumPax" INTEGER,
  ADD COLUMN "weatherSensitive" BOOLEAN,
  ADD COLUMN "childFriendly" BOOLEAN,
  ADD COLUMN "wheelchairAccessible" BOOLEAN,
  ADD COLUMN "seasonalRestrictions" TEXT,
  ADD COLUMN "operationalWarnings" TEXT;

ALTER TABLE "excursion_template_components"
  ADD COLUMN "requiredArrivalTime" TEXT,
  ADD COLUMN "supplierConfirmationRequired" BOOLEAN,
  ADD COLUMN "voucherRequired" BOOLEAN,
  ADD COLUMN "pickupNotes" TEXT,
  ADD COLUMN "operationalDependency" TEXT,
  ADD COLUMN "estimatedDurationMinutes" INTEGER;
