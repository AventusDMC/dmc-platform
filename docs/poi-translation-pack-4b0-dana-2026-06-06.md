# POI Translation Review Pack — Phase 4B.0

**POI:** Dana Biosphere Reserve
**Date:** 2026-06-06
**Status:** ⛔ DRAFT FOR HUMAN REVIEW — **NOT applied to the database.**

## Why this pack exists

During an operator/client review of the Amman → Dana → Petra proposal in
Portuguese, the **Dana Biosphere Reserve** day narrative rendered its
place name and description in **English**, while Petra rendered in
Portuguese. Diagnosis (live, read-only) confirmed this is a **content
gap, not a code bug**:

| POI | Stored translation locales |
| --- | --- |
| Petra Archaeological City | `ar`, `en`, `es`, `pt` |
| **Dana Biosphere Reserve** | `en` **only** |

The proposal renderer's fallback chain correctly drops to English when a
locale translation is missing. The fix is **human-authored** PT/ES/AR
content for the Dana POI. Per standing scope, this pack is **review-only**
and must **not** be machine-translated directly into production.

## English source (canonical — verify before translating downstream)

- **Title:** Dana Biosphere Reserve
- **Short description (as stored in DB):** Jordan's largest nature reserve, spanning four bio-geographic zones.
- **Long description (PROPOSED source — ⚠️ confirm against canonical EN before publishing):**
  > Dramatic escarpments and wadis descending from the highlands to the
  > desert, with the historic Dana village, hiking trails and abundant
  > wildlife.

> This EN long matches the **canonical English row already stored on the POI**
> (confirmed in `seed-points-of-interest.ts`). The idempotent seed never
> modifies the English row, so the PT/ES/AR long texts below are translations
> of this canonical English — keeping all locales consistent.

---

## 🇵🇹 Portuguese (pt) — DRAFT

- **Título:** Reserva da Biosfera de Dana
- **Descrição curta:** A maior reserva natural da Jordânia, abrangendo quatro zonas biogeográficas.
- **Descrição longa:**
  > Escarpas e wadis dramáticos que descem das terras altas até ao deserto,
  > com a histórica aldeia de Dana, trilhos de caminhada e vida selvagem
  > abundante.

## 🇪🇸 Spanish (es) — DRAFT

- **Título:** Reserva de la Biosfera de Dana
- **Descripción corta:** La mayor reserva natural de Jordania, que abarca cuatro zonas biogeográficas.
- **Descripción larga:**
  > Espectaculares escarpas y uadis que descienden desde las tierras altas
  > hasta el desierto, con el histórico pueblo de Dana, senderos de senderismo
  > y abundante fauna.

## 🇯🇴 Arabic (ar) — DRAFT (RTL)

- **العنوان:** محمية ضانا للمحيط الحيوي
- **وصف مختصر:** أكبر محمية طبيعية في الأردن، تمتد عبر أربع مناطق جغرافية حيوية.
- **وصف مطوّل:**
  > منحدرات وأودية مهيبة تنحدر من المرتفعات نحو الصحراء، مع قرية ضانا
  > التاريخية ومسارات المشي والحياة البرية الوفيرة.

---

## Review checklist (for the human reviewer)

- [ ] Confirm the **English long description** source above (or replace it).
- [ ] Verify the **PT** title/short/long read naturally for a client audience.
- [ ] Verify the **ES** title/short/long.
- [ ] Verify the **AR** title/short/long, including RTL rendering and the
      transliteration of "Dana" (`ضانا`) and "Tafileh" (`الطفيلة`).
- [ ] Decide whether "biosphere reserve" should use the local convention
      (`محمية المحيط الحيوي`) or an alternate phrasing.

## Application path (only after sign-off — NOT done here)

1. A reviewer approves the four-locale content above (edits inline as needed).
2. The approved content is added to the **idempotent POI translation seed**
   (same pattern as Phase 4A.1, `upsert` keyed on `[poiId, locale]`).
3. The seed is dry-run, then applied **with explicit approval**, exactly like
   the 4A.1 top-15 pack — **no machine translation into production**.
4. Re-render the Amman → Dana → Petra proposal in PT/ES/AR and confirm Dana
   now reads in the selected language.

**This pack does not touch the database, the seed scripts, or any code.**
