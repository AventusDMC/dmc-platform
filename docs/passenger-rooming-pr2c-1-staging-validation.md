# Passenger / Rooming MVP — PR-2c-1 (Room CRUD) Staging Validation Report

**Date:** 2026-07-05
**Environment:** Staging only (`dmc-platform-admin-web-staging.vercel.app` + staging API)
**Verdict:** ✅ PR-2c-1 (flag-gated V2 room create/edit/delete) validated end-to-end on staging.
Production unchanged.
**Scope of change:** Documentation only. No code, schema, flag, or environment change accompanies this report.

Feature: flag-gated room CRUD on the Operations V2 Passengers & Rooming tab — Add / Edit / Delete room
— behind `NEXT_PUBLIC_OPS_V2_PAX_EDIT` (default OFF), admin/operations only, via new V2 JSON proxies.
Passenger assignment / unassignment / auto-assign remain out of scope (PR-2c-2). References:
`docs/passenger-rooming-pr2c-rooming-editing-plan.md`, `docs/passenger-rooming-pr2b-staging-validation.md`.

---

## 1. Deploy status
- **Merge commit for #627:** `5546823a` (`feat(admin-web): add flag-gated Ops V2 rooming CRUD`).
- **Staging admin-web:** the merge auto-deployed a fresh staging build carrying PR-2c-1;
  `NEXT_PUBLIC_OPS_V2_PAX_EDIT` was already set on staging, so the flag is inlined. Editor live.
- **Production:** unchanged — `NEXT_PUBLIC_OPS_V2_PAX_EDIT` absent on production admin-web (4gu9); the
  V2 editor is not accessible in production.

## 2. Validation on BK-2026-0002

| # | Check | Result |
| - | ----- | ------ |
| 1 | Staging edit flag present | Yes |
| 2 | Production 4gu9 flag absent | Yes |
| 3–4 | Rooming editor appears | Yes — "Passengers and rooms are editable in V2…"; Add room + per-room Edit/Delete |
| 5 | Passenger editing still works/unchanged | Yes — Add passenger + the 8 non-PII fields, Edit/Delete |
| 6 | Add a temporary empty room | 201 — created; non-allowlisted fields stripped |
| 7 | Edit that room | 200 — occupancy + notes updated |
| 8 | Delete that (empty) room | 200 |
| 9 | Delete the occupied original room | 400 — **"Unassign passengers from the room before deleting the rooming entry."** |
| 10 | Assignment / unassignment / auto-assign controls | Not present — assigned passengers shown read-only |
| 11 | Readiness warnings update after refresh | Yes — returned to baseline after cleanup |
| 12 | No finance / cost / sell / margin data | None in the passengers/rooming view |
| 13 | Production unchanged | Yes — production editor flag absent |

**End state:** BK-2026-0002 restored to baseline — one room (Room 1) with the lead passenger; no
leftover test data.

## 3. Key results
- **Add / Edit / Delete room** all succeed against the staging API; the occupancy select
  (single/double/triple/quad/unknown) works and only the allowlisted room fields persist.
- **Occupied-room delete guard** blocks with the exact expected message.
- **Assignment / auto-assign are not present** (deferred to PR-2c-2); assigned passengers are read-only.
- **Passenger editing is unchanged** and still works.
- **Readiness** updates on refresh; **no finance/pricing** surfaced.

## 4. Safety confirmation
- **Production not enabled** — no production flag changes; the V2 editor flag is absent on 4gu9.
- **Voucher-send allowlist unchanged** — remains `ziad@axisdmc.com` only; supplier email / voucher-send
  untouched.
- **No PII fields editable** in V2; **no finance/pricing** surfaced in the passengers/rooming view.
- Documentation only — no code, schema, flag, or environment change in this report.
