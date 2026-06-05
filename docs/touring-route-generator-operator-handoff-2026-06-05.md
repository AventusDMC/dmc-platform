# Generate from Touring Route — operator handoff & real-use readiness — 2026-06-05

_Phase 3D.1F–3D.1H. Operator-facing handoff for the POI-aware touring-route → quote generator.
Updated 2026-06-05 after Phase 3D.1H (cross-currency pricing fix, production-verified)._

**Status: production-ready for real operator use**, including JOD-priced routes on USD quotes.
See the quick readiness summary at the bottom of this file (§6).

This is the go-live packet for Axis operators: a one-page SOP, a real-use pilot checklist,
a pricing QA checklist, a known-limitations list, and content follow-ups. See also the deeper
references:

- `docs/poi-day-narrative-operator-guide.md` — POI day narrative + the generator section.
- `docs/touring-route-generator-readiness-pilot-2026-06-05.md` — readiness, pricing-entry, §2.1 pricing model, §2.2 Dana gap.

---

## 1. Operator SOP — "Generate from Touring Route" (one page)

**What it does:** builds a quote skeleton from a touring route's POI-linked stops — itinerary
days, **one** touring-route transport package item, and per-day POI assignments. The proposal's
day-by-day narrative is then composed automatically from those POIs in the selected language.

**Steps**

1. **Find the panel.** Open the quote → **Itinerary** step → expand **"Generate from touring route"**
   (inside the Auto Itinerary Builder).
2. **The quote must be empty.** It must have **zero itinerary days**. If the quote already has
   itinerary days, **Apply is blocked** (there is no replace/append yet). Use a fresh/empty quote.
3. **Pick a touring route.** The route should have **active pricing** and **POI-linked content stops**.
4. **Pick a pricing row.** Required — without an active pricing row Apply stays disabled
   ("Select a pricing row").
   - **Pricing is the full package price for the whole route, *not* a per-day price.**
   - **`dayCount` is metadata only** — it does **not** multiply the base cost. The preview shows
     the cost as "… (full package, N days)".
   - **If the pricing row currency differs from the quote currency** (e.g. JOD pricing on a USD
     quote), the system **automatically converts** the cost to the quote currency before applying
     markup. You do not need to do this manually. (Fixed and production-verified 2026-06-05.)
5. **Set start date + pax.**
6. **Review the preview.** Confirm the per-day grouping and each day's ordered POIs.
   - For **multi-day routes the per-day POI split is an automatic suggestion** — **review it before
     applying.** You can **move / reorder / drop** POIs in the preview.
   - You must tick **"I have reviewed these warnings"** before Apply enables (multi-day routes).
7. **Apply to quote.** Creates the days + one transport package + the POI assignments. It **never
   deletes or overwrites** existing days/items.
8. **After apply — add the rest manually.** **Hotels, activities, entrance fees, and meals are not
   created** by the generator. Add them as quote items yourself.

**Good to know**

- **`day.notes` are intentionally left empty.** The proposal narrative comes from the **POIs**
  (the composer), not from stored notes — so do not expect text in the day notes field.
- The proposal renders in **en / pt / es / ar** (Arabic is right-to-left). POIs without a
  translation in the selected language fall back to **English** content.
- Nothing is written until you click **Apply** — the preview and your edits are local until then.

---

## 2. Real-use pilot checklist (Axis operators)

Run these in order. The first two columns are pre-checked from the 2026-06-05 readiness audit.

| Route | Active pricing | POI-linked stops | Days |
|---|---|---|---|
| Ajloun & Jerash | ✅ yes | Jerash, Ajloun (all 4 langs) | 1 |
| Amman City Sites | ✅ priced | Citadel, Roman Theatre, Downtown (all 4 langs) | 1 |
| Madaba → Mount Nebo | ✅ priced | Madaba, Mount Nebo (all 4 langs) | 1 |
| Amman → Dana → Petra ON | ✅ priced | Dana (EN only), Petra (all 4 langs) | 2 |
| Petra → Wadi Rum ON | ✅ yes | Petra, Wadi Rum (all 4 langs) | 2 |

**For each route:**

- [ ] Create or open an **empty** quote (0 itinerary days).
- [ ] Open **Itinerary → Generate from touring route**; **select the route**.
- [ ] **Select an active pricing row** (covering the chosen pax band).
- [ ] **Review the preview** — day grouping + transport package line (shows "full package, N days").
- [ ] **Check the multi-day POI split** (2-day routes: Dana→Petra, Petra→Wadi Rum). Move/reorder/drop
      if needed. Tick **"I have reviewed these warnings."**
- [ ] **Apply.**
- [ ] **Confirm day count** = the route's `durationDays` (1 for Ajloun&Jerash / Amman City / Madaba-Nebo; 2 for Dana-Petra / Petra-Wadi Rum).
- [ ] **Confirm exactly ONE transport package item** (the touring-route package; `dayCount` set, base cost = the selected row).
- [ ] **Confirm the proposal renders in en / pt / es / ar** (day narrative composed from the POIs).
- [ ] **Confirm Arabic is RTL** and reads correctly.
- [ ] **Manually add hotels / activities / entrances / meals** as needed.
- [ ] **Confirm the final quote total** is correct (full package price + any manual items + markup).

**Acceptance:** all boxes pass for at least one route end-to-end with a real human operator (start
with **Ajloun & Jerash**, which has been ready longest).

---

## 3. Pricing QA checklist

- [ ] Each touring route's pricing row **`baseCost` is the FULL route package price** (the whole
      trip), entered in the route's native currency.
- [ ] **Do NOT enter per-day prices.** `dayCount` is metadata; it does **not** multiply `baseCost`.
- [ ] **Multi-day routes need special confirmation** that the base cost covers the entire trip:
  - **Petra → Wadi Rum ON** (2 days) — base cost = full 2-day package (Petra + overnight + Wadi Rum).
  - **Amman → Dana → Petra ON** (2 days) — base cost = full 2-day package (Amman → Dana → Petra w/ overnight).
- [ ] If a row was historically entered as a per-day rate, **multiply it out to the full-route total**
      before piloting — otherwise multi-day quotes under-price.
- [ ] At least **one active pricing row** per route, covering the relevant pax bands; mark inactive
      rows inactive (the generator ignores them).
- [ ] **No pricing formulas were changed and `QuotePricingService` is untouched** — pricing flows
      through the existing engine exactly as for any manual quote item.

---

## 4. Known limitations (current version)

- **Empty quotes only** — the generator applies only into a quote with **0 itinerary days**.
- **No append mode** — it will not add days onto a quote that already has some.
- **No replace mode** — it will not overwrite/clear existing days.
- **No hotel auto-matching** — hotels are added manually after generation.
- **No auto-created activities.**
- **No auto-created entrance fees.**
- **No meals** created.
- **Multi-day POI partition is a suggestion** — it must be reviewed (and can be adjusted) in the
  preview before applying.
- **Routes without an active pricing row cannot be applied** — Apply stays disabled until a row exists.
- **POIs without PT/ES/AR translations fall back to English** in those languages (acceptable; the
  boilerplate is still localized and Arabic stays RTL).

---

## 5. Content / data follow-up notes

- **Dana Biosphere Reserve is EN-only** — add it to the **next human translation pack** (PT/ES/AR
  title + short description) if Dana/Petra routes will be sold often. Petra is already fully
  translated, so completing Dana makes the whole **Amman → Dana → Petra ON** narrative localized.
  (See readiness doc §2.2.)
- **More POI-linked route variants may need active pricing** before broad rollout. The 2026-06-05
  audit found several POI-linked routes with **zero active pricing rows**; price them (full package
  price) before adding them to the operator pilot set.

---

## Out of scope (not built; do not assume present)

Phase 3D.2 hotels · replace existing days · append mode · pricing-engine changes · auto-created
activities · auto-created entrance fees · meals · TouringRouteDay · PR #321 reconciliation · manual
per-locale override UI · machine translation · ZZ Verification cleanup.

_After operator handoff and one real human pilot, decide whether Phase 3D.2 (hotels) is worth planning._

---

## 6. Final operator readiness note (Phase 3D.1H — 2026-06-05)

The generator is **production-ready** for real operator use. The following items were confirmed
working in production before this note was written:

| Item | Status |
|---|---|
| Generator works on empty quotes only | ✅ Ready |
| Route must have active pricing to apply | ✅ Ready |
| Pricing row `baseCost` is the full route package cost | ✅ Ready |
| If pricing currency ≠ quote currency, the system converts before markup | ✅ **Fixed and verified** |
| `dayCount` is metadata only — does not multiply price | ✅ Ready |
| Hotels, activities, entrances, meals, and guides are still added manually | ✅ Ready |
| Operators must review the POI day split before applying (multi-day routes) | ✅ Ready |
| Proposal renders correctly in EN / PT / ES / AR | ✅ Ready |
| Arabic is right-to-left | ✅ Ready |

**Cross-currency pricing (Phase 3D.1H):** a bug where JOD-priced routes on USD quotes were
under-priced 1:1 has been fixed and production-verified. Example: JOD 100 + 20% markup now
correctly produces USD 169.20 (not the previous wrong USD 120). **No manual workaround is needed.**

**Standard practice:** always review the final quote total before sending to a client. This is
standard for all quote types, not specific to the generator.
