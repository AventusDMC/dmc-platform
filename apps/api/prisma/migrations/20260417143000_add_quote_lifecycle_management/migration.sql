CREATE TYPE "QuoteStatus_new" AS ENUM ('DRAFT', 'READY', 'SENT', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

ALTER TABLE "quotes"
ADD COLUMN "validUntil" TIMESTAMP(3),
ADD COLUMN "sentAt" TIMESTAMP(3),
ADD COLUMN "acceptedAt" TIMESTAMP(3);

ALTER TABLE "quotes"
ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "quotes"
ALTER COLUMN "status" TYPE "QuoteStatus_new"
USING (
  CASE "status"::text
    WHEN 'draft' THEN 'DRAFT'
    WHEN 'sent' THEN 'SENT'
    WHEN 'accepted' THEN 'ACCEPTED'
    WHEN 'lost' THEN 'EXPIRED'
    WHEN 'cancelled' THEN 'CANCELLED'
    ELSE 'DRAFT'
  END
)::"QuoteStatus_new";

DROP TYPE "QuoteStatus";

ALTER TYPE "QuoteStatus_new" RENAME TO "QuoteStatus";

ALTER TABLE "quotes"
ALTER COLUMN "status" SET DEFAULT 'DRAFT';

UPDATE "quotes"
SET "sentAt" = COALESCE("sentAt", "updatedAt")
WHERE "status" = 'SENT';

UPDATE "quotes"
SET "acceptedAt" = COALESCE("acceptedAt", "updatedAt")
WHERE "status" = 'ACCEPTED';
