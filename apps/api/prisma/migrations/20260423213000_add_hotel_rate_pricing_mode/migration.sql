DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HotelRatePricingMode') THEN
    CREATE TYPE "HotelRatePricingMode" AS ENUM ('PER_ROOM_PER_NIGHT', 'PER_PERSON_PER_NIGHT');
  END IF;
END $$;

ALTER TABLE "hotel_rates"
  ADD COLUMN "pricingMode" "HotelRatePricingMode";
