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
  > Dana Biosphere Reserve is Jordan's largest nature reserve — a dramatic
  > landscape of sandstone cliffs, deep wadis, and ancient villages that
  > descends from the highlands near Tafileh toward the Rift Valley.
  > Spanning four bio-geographic zones, it shelters a remarkable diversity
  > of plants, birds, and wildlife, and offers some of the country's finest
  > scenic walking and eco-tourism experiences.

> The DB currently stores only title + short description for Dana. The long
> description above is a **proposed** English source for review; confirm or
> replace it before the translations are finalized, since the PT/ES/AR long
> texts below are derived from it.

---

## 🇵🇹 Portuguese (pt) — DRAFT

- **Título:** Reserva da Biosfera de Dana
- **Descrição curta:** A maior reserva natural da Jordânia, abrangendo quatro zonas biogeográficas.
- **Descrição longa:**
  > A Reserva da Biosfera de Dana é a maior reserva natural da Jordânia —
  > uma paisagem deslumbrante de falésias de arenito, wadis profundos e
  > aldeias antigas que desce das terras altas próximas de Tafileh em
  > direção ao Vale do Rift. Abrangendo quatro zonas biogeográficas, abriga
  > uma notável diversidade de plantas, aves e vida selvagem, e oferece
  > algumas das melhores caminhadas paisagísticas e experiências de
  > ecoturismo do país.

## 🇪🇸 Spanish (es) — DRAFT

- **Título:** Reserva de la Biosfera de Dana
- **Descripción corta:** La mayor reserva natural de Jordania, que abarca cuatro zonas biogeográficas.
- **Descripción larga:**
  > La Reserva de la Biosfera de Dana es la mayor reserva natural de Jordania
  > — un paisaje impresionante de acantilados de arenisca, profundos uadis y
  > antiguas aldeas que desciende desde las tierras altas cercanas a Tafileh
  > hacia el valle del Rift. Abarca cuatro zonas biogeográficas y alberga una
  > notable diversidad de plantas, aves y fauna, además de ofrecer algunas de
  > las mejores caminatas paisajísticas y experiencias de ecoturismo del país.

## 🇯🇴 Arabic (ar) — DRAFT (RTL)

- **العنوان:** محمية ضانا للمحيط الحيوي
- **وصف مختصر:** أكبر محمية طبيعية في الأردن، تمتد عبر أربع مناطق جغرافية حيوية.
- **وصف مطوّل:**
  > محمية ضانا للمحيط الحيوي هي أكبر محمية طبيعية في الأردن — منطقة آسرة من
  > المنحدرات الرملية والأودية العميقة والقرى القديمة، تنحدر من المرتفعات قرب
  > الطفيلة نحو وادي الأردن المتصدّع. تمتد المحمية عبر أربع مناطق جغرافية
  > حيوية، وتضمّ تنوّعاً لافتاً من النباتات والطيور والحياة البرية، وتوفّر
  > بعضاً من أجمل مسارات المشي الطبيعية وتجارب السياحة البيئية في البلاد.

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
