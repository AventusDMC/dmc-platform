# Booking Creation V2 — Controlled Pilot Enablement Plan

**Date:** 2026-07-03
**Status:** Proposal only. Nothing enabled — both flags remain OFF everywhere. No env or code change.
**Feature under test:** Quote Builder V2 → Create Booking → Operations V2, behind `QUOTE_BOOKING_CREATE` (backend) / `NEXT_PUBLIC_QUOTE_BOOKING_CREATE` (frontend), both default OFF / fail-closed.
**References:** `docs/booking-creation-v2-launch-control.md` (runbook), `docs/booking-creation-v2-slice-1b-verification.md` (§3 supplier-data), `docs/booking-creation-v2-slice-1e-finance-check.md`.

---

## 1. Which environment to test first
**Staging first, then a tightly-scoped production pilot.**
- **Phase A — Staging** (staging admin-web + staging API + distinct staging DB): full end-to-end rehearsal on a staging quote. Zero production risk.
- **Phase B — Production controlled** (production admin-web + production API): **one** real ACCEPTED/CONFIRMED quote (or an approved production dummy quote), a single admin/operations operator, both flags ON. Only after Phase A passes clean.

Do **not** enable production-wide. This is a single-booking, single-operator pilot.

## 2. Exact backend/frontend flags needed
Both must be ON for the end-to-end path (fail-closed otherwise):
- **Backend (API service):** `QUOTE_BOOKING_CREATE=true`, then restart/redeploy the API (runtime flag).
- **Frontend (admin-web):** `NEXT_PUBLIC_QUOTE_BOOKING_CREATE=true`, then **trigger a fresh build/redeploy** — `NEXT_PUBLIC_*` is inlined at build time, so an env change alone does nothing until rebuilt.
- **Enable order:** backend first (route live, no UI), then frontend (UI appears). Apply to the **staging** projects for Phase A, then the **production** API + admin-web for Phase B.
- **Unchanged:** every other flag — especially the voucher-send flag and its allowlist (see §11).

## 3. Backend flag is the kill switch
`QUOTE_BOOKING_CREATE` is a **runtime** backend env var, so flipping it OFF disables conversion **instantly** (no rebuild, no migration): the route returns `feature_disabled` and any still-visible UI card fails closed. The frontend flag is build-time and hides the card only after a redeploy. **Roll back with the backend flag first.**

## 4. Pilot quote requirements
The pilot quote must be:
- Status **ACCEPTED or CONFIRMED** with a populated **`acceptedVersionId`** (the conversion precondition; DRAFT/SENT is not convertible).
- The **latest revision** (no newer revision).
- **Not already converted** (no existing primary booking).
- Fully **priced** (item cost/sell present) so the finance snapshot is meaningful.
- Built/handled in **Quote Builder V2** (V2-first path).
- Ideally a mix of service types (hotel, transport, activity, guide) to exercise mapping; optionally one **non-USD** quote to validate the currency label.
- Small (few items, few pax) to keep the pilot legible.

## 5. Supplier data checklist (per pilot quote, before enabling)
Unresolved suppliers do **not** block conversion but produce "Needs Assignment" rows in Operations V2:
- [ ] Every priced item's supplier **resolves to a catalog supplier record** (else the id is dropped at conversion; name retained, row unassigned).
- [ ] Each item's service **category maps to the intended operational bucket** (TRANSPORT / HOTEL / GUIDE / ACTIVITY / DINING / TICKET / EXTERNAL_PACKAGE / SERVICE). Meals → DINING; guides preserve timing; external packages → EXTERNAL_PACKAGE.
- [ ] Each pilot supplier has a **valid operational email** on file (needed later for voucher, not for conversion).
- [ ] The quote **currency** is correct (USD or non-USD both supported).

## 6. Step-by-step test flow
1. **Quote Builder V2** — open the pilot quote in Builder V2 as an admin/operations user. Confirm the **"Create booking"** card appears in the right sidebar (only shows when flag ON + role + status ACCEPTED/CONFIRMED).
2. **Create Booking** — click. Expect success: **booking reference** shown + **"Open in Operations V2"** CTA. Record the booking reference.
3. **Duplicate guard** — return to the builder and click Create Booking again (or reload). Expect **"Booking already exists" + "Open booking"** (idempotent), with **no** second booking created.
4. **Operations V2** — open the booking workspace. Verify: header, **service rows** mapped from the quote (correct type buckets, correct days), **Finance tab** shows quoted total / realized cost / margin with the **correct currency label**, and the **snapshot** is preserved.
5. **Supplier Assignment** — assign an operational supplier to one service row (existing Ops V2 flow). Confirm it persists and audits.
6. **Voucher Preview / PDF** — generate a voucher **preview** and **download the PDF** for an assigned + confirmed service. **Stop at preview/PDF** — do not broadly send (see §7, §11).

## 7. What is out of scope (do not test yet)
- Broad supplier email sending (only the single allowlisted address if send is exercised at all — see §11).
- Supplier Voucher Packet V2.
- Full passenger/rooming MVP (only the minimal foundation exists on a converted booking).
- Finance accounting / invoices / supplier payments.

## 8. Rollback steps
- **Instant kill (primary):** set backend `QUOTE_BOOKING_CREATE=false` (or remove it) and restart the API. Conversion is disabled immediately; any visible card returns `feature_disabled`. No rebuild, no migration.
- **Full UI rollback:** set `NEXT_PUBLIC_QUOTE_BOOKING_CREATE=false` on admin-web and redeploy to hide the card.
- **Data:** no schema change in either direction; a booking already created is left as-is (roll forward). If a pilot booking must be removed, do it deliberately as a separate, reviewed step — not part of flag rollback.

## 9. Go / no-go criteria
**GO if all true:**
- Booking created with a correct reference and a working **source-quote link**.
- **Snapshot preserved** (pricing totals + **currency** correct) and **service rows** mapped correctly per type, in the right days.
- Booking is **visible in Operations V2**; **supplier assignment** works; **voucher preview + PDF** generate.
- **Duplicate re-click** returns the existing booking (no second booking).
- **Audit events** written: `booking.created` + `quote.booking.created` (sanitized — ids only).
- No 500s / unhandled errors; **no supplier emails** sent by conversion.

**NO-GO / halt if any:**
- Conversion 500s or produces malformed / mis-mapped service rows.
- Finance currency or totals wrong.
- Duplicate protection fails (a second booking is created).
- Any unexpected outbound email, or the voucher-send allowlist is found widened.

## 10. Evidence to capture
- Screenshots: the Create Booking card; the success state (reference + CTA); the duplicate "already exists" state; the Operations V2 booking workspace (service rows); the Operations V2 **Finance tab** (currency + totals); supplier assignment; voucher preview + the downloaded PDF.
- The **booking reference** (and internal id if needed for follow-up).
- **Audit log entries** for `booking.created` and `quote.booking.created` (confirm metadata is sanitized — ids only, no PII/email).
- Network evidence: the create-booking request returns **200**; no supplier-email call is fired by conversion.
- A short pass/fail note against the §9 criteria.

## 11. Final safety confirmation — voucher send allowlist
- The voucher-send recipient allowlist stays **limited to `ziad@axisdmc.com` only**. This pilot **must not widen** it, and this plan does not change it.
- **Conversion itself sends no email at all** — Create Booking creates database rows only. The only place an email could be sent is the separate, already-gated voucher-send flow, which remains allowlisted to that single address and is out of scope here (voucher **preview/PDF** only in §6.6).
