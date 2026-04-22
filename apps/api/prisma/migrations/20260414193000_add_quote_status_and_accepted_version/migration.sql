ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'lost';
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'cancelled';

ALTER TABLE "quotes"
  ADD COLUMN "acceptedVersionId" UUID;

ALTER TABLE "quotes"
  ADD CONSTRAINT "quotes_acceptedVersionId_fkey"
  FOREIGN KEY ("acceptedVersionId") REFERENCES "quote_versions"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "quotes_acceptedVersionId_idx" ON "quotes"("acceptedVersionId");
