# POI translation content-gap report — 2026-06-05

_Phase 3C pilot validation. Snapshot of the production Points of Interest catalog._

## Summary

- **35 POIs total, 33 active.**
- **Effectively the entire catalog is English-only.** 34 of 35 records have content in
  English only and none in PT / ES / AR. The single record with non-English content is
  a test entry — `ZZ Verification POI (safe to delete)` — and should be deactivated /
  removed by an operator (it is not a real POI).
- Net: **0 real POIs currently have Portuguese, Spanish, or Arabic content.**

## What this means for proposals today

The POI-driven day-summary composer (Phase 3B.2) is live and works in all four
languages. With the current data:

- **English proposals** render fully composed POI summaries (title + description).
- **PT / ES / AR proposals** render the **localized boilerplate** (`Visita a` / `زيارة`)
  combined with **English POI titles and descriptions** via the fallback chain.

This is acceptable and was approved as the interim behaviour. It becomes materially
better as soon as the highest-traffic POIs get human translations.

## Recommended first translation batch (top 15)

Prioritised by (a) POIs already linked to live quote days / sample routes, and
(b) flagship Jordan sites that appear in the majority of itineraries. Translate these
into **PT, ES, AR** first (title + short description; long description optional):

| # | POI | Why first |
|---|-----|-----------|
| 1 | Petra Archaeological City | Flagship; on nearly every itinerary |
| 2 | Wadi Rum Protected Area | Flagship; high frequency |
| 3 | Jerash Archaeological Site | Linked to live quote day; top day-tour |
| 4 | Amman Citadel | Linked in pilots; core Amman city tour |
| 5 | Roman Theatre | Linked in pilots; core Amman city tour |
| 6 | Dead Sea | Flagship; standard overnight |
| 7 | Mount Nebo | Biblical circuit staple |
| 8 | Madaba | Biblical circuit staple |
| 9 | Karak Castle | King's Highway staple |
| 10 | Little Petra | Common Petra add-on |
| 11 | Ajloun Castle | Linked to live quote day; north circuit |
| 12 | Wadi Mujib | Adventure / Dead Sea area |
| 13 | Downtown Amman | Core Amman city tour |
| 14 | Bethany Beyond the Jordan | Biblical / baptism site |
| 15 | Umm Qais | North circuit panorama |

After this batch, extend to the remaining active POIs (Aqaba, Dana, Shobak, Pella,
Qasr Amra/Kharana, Azraq/Shaumari reserves, the Islamic shrines, etc.).

## Separate technical gap — Arabic PDF font (flagged, not a content issue)

The Arabic **HTML** proposal renders glyphs and RTL correctly. The Arabic **PDF** does
not currently embed an Arabic font: the generated PDF only embeds Latin-only fonts
(Liberation family from the headless renderer), so Arabic characters have no covering
font and render as empty/box glyphs. Fix = embed an Arabic web font (e.g. Noto Naskh
Arabic `woff2`) as an `@font-face` in `proposal-v3.css`, alongside the existing brand
fonts, so the PDF renderer subsets Arabic glyphs. This is a small code change, tracked
separately from content translation.

## Suggested sequence (content-first, per the roadmap)

1. Translate the top-15 POIs above into PT / ES / AR (human).
2. Pilot real proposals in all four languages with a live quote.
3. (If Arabic PDFs are needed) ship the Arabic-font embedding fix.
4. Only then plan Phase 3D: the POI-aware touring-route → quote generator.
