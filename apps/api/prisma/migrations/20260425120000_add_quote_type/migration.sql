CREATE TYPE "QuoteType" AS ENUM ('FIT', 'GROUP');

ALTER TABLE "quotes"
ADD COLUMN "quoteType" "QuoteType" NOT NULL DEFAULT 'FIT';
