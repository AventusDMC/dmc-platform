-- Manual destination-country override for an itinerary day. NULL means the
-- country is derived at read time from the day's services (deriveDayCountry);
-- a non-null value is an explicit operator override used by the builder +
-- proposal country grouping. Nullable + no default => backward-compatible and
-- inert until set. Location metadata only — never affects pricing.

ALTER TABLE "quote_itinerary_days" ADD COLUMN "country" TEXT;
