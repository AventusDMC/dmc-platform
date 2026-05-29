-- Hotel contract supplements: optional date window.
--
-- Adds nullable `appliesFrom` / `appliesTo` columns to
-- hotel_contract_supplements. When set, the quote engine charges the
-- supplement only on nights the stay covers within that window — e.g. a
-- Gala Dinner pinned to 31 Dec (appliesFrom = appliesTo = that date) is
-- billed once per guest and only when the stay includes that night.
--
-- Additive and backward-compatible: all existing rows migrate as NULL on
-- both columns, which the engine treats as "charged across the whole
-- stay per the charge basis" — exactly the current behaviour. Older
-- contracts price identically until an operator sets a window.

ALTER TABLE "hotel_contract_supplements"
  ADD COLUMN "appliesFrom" TIMESTAMP(3),
  ADD COLUMN "appliesTo"   TIMESTAMP(3);
