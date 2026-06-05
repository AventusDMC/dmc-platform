# Operator guide — POI-driven proposal day summaries

_Phase 3B / 3C. Applies to the multilingual proposal (proposal-v3)._

## What this is

Each quote itinerary **day** can be given an ordered list of **Points of Interest (POIs)**.
When a day has POIs assigned, the client proposal **composes that day's summary
automatically** from those POIs, in the proposal's selected language. Nothing is
stored on the day — the summary is generated fresh every time the proposal renders,
so changing the proposal language changes the summary language.

This does **not** touch pricing, hotels, transport, or any service line. It only
controls the descriptive day summary paragraph shown in the proposal.

## How to assign POIs to a quote day

1. Open the quote and go to the itinerary / day planner.
2. Select the day you want (the active day's side panel opens).
3. Find the **"Points of interest"** section (just below "Destination / Country").
4. Use **"Add a point of interest…"** to add POIs from the catalog. Each one appears
   in an ordered list.
5. Reorder with the **↑ / ↓** buttons and remove with **✕**. The order is the order
   they will appear in the proposal summary.
6. Click **"Save points of interest"**. The save snapshots each POI's title and city
   at that moment (so the label survives even if the POI is later edited or removed).

POIs come from the central **Points of Interest** catalog (Product Catalog → Points
of Interest). Add or edit POI content there, including translations.

## How the proposal summary is generated

For each POI on the day, in order, the proposal produces a sentence:

> **Visit _{POI title}_ — _{short description}_**

- The boilerplate verb is localized: `Visit` (EN), `Visita a` (PT/ES), `زيارة` (AR).
- The short description is included only when it exists and is client-safe.
- Sentences are joined into one paragraph for the day.

The composer is intentionally conservative: it only writes "Visit …" lines. It does
**not** invent breakfast, overnight, arrival/departure, or "continue to" sentences.

## What happens when a translation is missing

POI content is multilingual (EN / PT / ES / AR). For each POI the title/description
is chosen by this fallback order:

1. The selected language (e.g. Portuguese)
2. English
3. The POI's internal name
4. The snapshot label saved when the POI was assigned

So if you render a Portuguese proposal and a POI only has English content, you get the
**Portuguese boilerplate with the English POI text** — e.g. `Visita a Amman Citadel —
Ancient hilltop core of Amman.` This is expected and acceptable until human
translations are added for that POI.

## How to clear POI assignments (return to manual notes)

1. In the day's **Points of interest** section, remove every POI (✕ on each).
2. Click **Save** with the list empty.

When a day has **no** POI assignments, the proposal falls back to the day's manually
written **notes** (the day description), exactly as before POIs existed. So clearing
the POIs reverts that day to manual control.

Precedence the proposal uses for a day summary:

1. Composed POI narrative (if the day has usable POIs)
2. The day's manual notes
3. An item-derived fallback
4. Nothing

## Supported languages

- **English (en)**, **Portuguese (pt)**, **Spanish (es)**, **Arabic (ar)**.
- Arabic renders right-to-left (RTL) in the on-screen / HTML proposal.
- Set the language per quote (proposal language) or per render via `?language=xx`.

## Arabic PDF rendering

Both the on-screen/HTML proposal and the downloadable **PDF** render Arabic correctly.
An Arabic web font (Noto Naskh Arabic, SIL OFL) is embedded in the proposal styles, so
Arabic PDFs display proper glyphs (no boxes/tofu) and keep right-to-left direction
without relying on server/system fonts. English/Portuguese/Spanish PDFs are unchanged.

## Generate a day skeleton from a touring route (Phase 3D)

In the **Itinerary** step of the quote builder, the Auto Builder has a **"Generate from
touring route"** panel. It builds a quote skeleton — itinerary days, one touring-route
transport package, and per-day POI assignments — from a route's POI-linked stops. The
proposal day narrative is then produced automatically by the POI composer (above).

How to use it:
1. Open the **Itinerary** step → expand **Generate from touring route**.
2. Pick a touring route, a **pricing row**, a start date, and pax.
3. Review the **preview**: generated days, the one transport package + cost, and each
   day's ordered POIs. You can **move / reorder / drop** POIs before applying.
4. Click **Apply to quote**.

Important limits (current version):
- **Empty quotes only.** If the quote already has itinerary days, **Apply is blocked**
  (no replace/append yet) — generate into a quote with no itinerary days.
- The route **must have an active pricing row** — otherwise Apply is disabled
  ("Select a pricing row"). See the pricing-entry checklist if a route has none.
- The route **should have POI-linked content stops** — otherwise days + transport are
  created but there are **no** POI assignments and the day narrative falls back to notes.
- **`day.notes` are left empty on purpose** — the proposal narrative comes from the POIs
  (the composer), not from stored notes.
- For **multi-day** routes the per-day POI split is an **automatic suggestion** — review
  and adjust it in the preview before applying.
- **Hotels, activities, entrances, and meals are still added manually** after generation;
  the generator does not create them and does not change pricing.

Nothing is written until you click Apply; the preview and your edits are local until then.
