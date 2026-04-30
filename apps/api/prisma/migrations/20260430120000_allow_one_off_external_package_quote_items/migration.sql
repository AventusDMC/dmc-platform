ALTER TABLE "quote_items"
  ALTER COLUMN "serviceId" DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS "externalPackageName" TEXT;
