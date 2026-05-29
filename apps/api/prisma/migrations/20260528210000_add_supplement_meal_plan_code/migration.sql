-- Hotel contract supplements: explicit meal-plan tag.
--
-- Adds a nullable `mealPlanCode` column to hotel_contract_supplements.
-- When set, the quote engine treats the supplement as the canonical
-- add-on that converts a base BB rate into the requested meal plan
-- (HB / FB / etc.) — no more guessing from the `type` string.
--
-- All existing rows are migrated as NULL. The pricing resolver keeps
-- its legacy fallback (treating `type = EXTRA_DINNER` as an HB
-- supplement) for those rows, so this column is additive — older
-- contracts continue pricing exactly as before until an operator
-- explicitly tags them.
--
-- Why a separate column instead of overloading `type`: a contract
-- can legitimately have one HB supplement (lunch OR dinner, 18 JOD)
-- and one FB supplement (lunch AND dinner, 36 JOD) sourced from the
-- same dish. The `type` enum can't express that disambiguation, so
-- before this column the engine would either double-count or skip the
-- FB add-on entirely.

ALTER TABLE "hotel_contract_supplements"
  ADD COLUMN "mealPlanCode" "HotelMealPlan";

-- Index supports the per-meal-plan lookups the pricing resolver runs
-- on every quote: "find any active supplement on this contract whose
-- mealPlanCode = the requested meal plan".
CREATE INDEX "hotel_contract_supplements_contract_meal_plan_active_idx"
  ON "hotel_contract_supplements"("hotelContractId", "mealPlanCode", "isActive");
