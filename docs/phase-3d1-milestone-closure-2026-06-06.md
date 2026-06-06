# Phase 3D.1 — Milestone Closure

**Status:** ✅ Accepted for **controlled production use** (operator pilot approved 2026-06-06)
**Reference sample:** the **Dana & Petra** proposal (quote `b6ec8410-b8f8-4b0a-9364-b80da0e7585c`, Q-2026-0034)

Phase 3D.1 delivers a POI-aware touring-route → quote generator plus a fully
multilingual, commercially-clean client proposal (EN/PT/ES/AR). After an
operator pilot and iterative client-readiness fixes, the workflow is approved
for controlled production use within the documented limits below.

## What is live and accepted

- **POI-aware touring-route generator** — generate a quote itinerary from a
  touring route. Live and operator-approved.
- **Route picker / search** — usable in the quote builder.
- **Empty-quote-only apply** — generation applies to empty quotes; accepted as
  the safe operating mode for now.
- **One touring-route transport package item** is generated (priced from the
  route's package price; `dayCount` is metadata, not a price multiplier).
- **Ordered POI assignments** are generated per day.
- **Multilingual proposal composer** — per-day narrative composed from each
  day's ordered POIs in the selected language.
- **EN / PT / ES / AR proposal PDFs** export correctly.
- **Arabic PDF rendering fixed** — embedded Noto Naskh Arabic on all elements,
  RTL layout, no tofu/□ boxes (Phase 3D.1P).
- **JOD/USD cross-currency pricing fixed** — JOD-priced routes on USD quotes
  convert correctly before markup (Phase 3D.1H).
- **Inclusions and Exclusions** sections present and localized; Exclusions
  added with B2B + Jordan-specific defaults and an operator override (3D.1R).
- **AXIS branding / logo fixed** — logo embedded as a data URI (renders offline
  in the PDF); supplier/agent company names no longer leak as the brand; brand
  defaults to AXIS Destination Management unless an explicit `branding.displayName`
  override is set (3D.1Q / 3D.1R).
- **Proposal title centering fixed** — cover title block centered across all
  four languages, including multi-line titles (3D.1S).
- **Operator approved the workflow** (pilot review positive).
- **Dana & Petra proposal is the accepted reference sample.**

### Supporting fixes that shipped in this phase
3D.1I language selector · 3D.1J route-movement narrative · 3D.1K localized
strings + hide-empty-accommodation · 3D.1L/L.2 display + hotel-location +
route-aware cover · 3D.1M localization cleanup + internal-text hygiene ·
3D.1N localized destination connector · 3D.1O pricing/inclusion bullets +
transport label + overnight city · 4B.1 Dana POI EN/PT/ES/AR translations.

## Current known limits

- **Empty quotes only** — generation is not yet supported on quotes that already
  have content.
- **No append / replace mode yet** — cannot merge into or replace an existing
  itinerary.
- **Hotels are manual** — overnight hotels are added by the operator.
- **Activities are manual.**
- **Entrance fees are manual.**
- **Meals are manual.**
- **Operator must enter a real client-facing proposal title** before sending —
  test/numeric titles (e.g. "7", "Jordan Tour #7") render verbatim on the cover.
- **Operator must verify the final price** before sending (standard for all
  quote types).
- **Arabic should still get a native-speaker review** for high-value clients —
  rendering and RTL are correct, but copy nuance is worth a human pass.

## Next phase — to be decided separately

No implementation has been started. The next phase will be chosen from:

- **A)** Phase 3D.2 — hotel suggestions
- **B)** append / replace mode
- **C)** broader route pricing coverage
- **D)** more POI translations
- **E)** activity / entrance suggestions
- **F)** proposal title UX polish (e.g. weak/numeric-title fallback)

**Milestone closed. No new work in progress.**
