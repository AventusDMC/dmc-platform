-- Adds hotel-specific dispatch fields to booking_services so the operational
-- voucher carries the information a hotel front desk needs (meal plan + any
-- special requests like "king bed", "twin", "smoking/non-smoking", "honeymoon",
-- "accessibility"). Both columns are nullable so non-hotel rows leave them
-- untouched. mealPlan reuses the existing HotelMealPlan enum (RO/BB/HB/FB/AI).

ALTER TABLE "booking_services"
ADD COLUMN IF NOT EXISTS "mealPlan" "HotelMealPlan",
ADD COLUMN IF NOT EXISTS "specialRequests" TEXT;
