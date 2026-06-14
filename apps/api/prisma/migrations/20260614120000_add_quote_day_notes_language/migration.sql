-- Phase P.3X-5E-4B — capture the LANGUAGE of planner day notes.
-- ADDITIVE, nullable, METADATA ONLY — a single TEXT column on quote_itinerary_days.
-- NULL everywhere on deploy = unknown = identical to current behavior. Validated in
-- TS against PROPOSAL_LOCALES (en|es|pt|ar); no DB enum. No backfill. proposal-v3 does
-- NOT read it yet (capture-only). Never touches pricing. Legacy itineraries.description
-- is intentionally NOT modified. Fully reversible:
--   ALTER TABLE "quote_itinerary_days" DROP COLUMN "notesLanguage";

-- AlterTable
ALTER TABLE "quote_itinerary_days" ADD COLUMN     "notesLanguage" TEXT;
