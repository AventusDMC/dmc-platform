-- Adds the nights column on booking_services so HOTEL rows can record their
-- stay length structurally instead of inferring it from a free-text description
-- like "Rate USD 45.00 x 2 pax x 1 night". Voucher snapshot derives checkOut
-- as serviceDate + nights days when both are present.
--
-- Nullable so non-HOTEL rows (transport, activity, etc.) leave it unset.

ALTER TABLE "booking_services"
ADD COLUMN IF NOT EXISTS "nights" INT;
