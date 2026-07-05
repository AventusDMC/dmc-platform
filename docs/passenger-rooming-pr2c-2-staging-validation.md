# Passenger / Rooming MVP — PR-2c-2 (Assignments + Auto-assign) Staging Validation Report

**Date:** 2026-07-05
**Environment:** Staging only (`dmc-platform-admin-web-staging.vercel.app` + staging API)
**Verdict:** ✅ PR-2c-2 (flag-gated V2 rooming assignment / unassignment / auto-assign) validated
end-to-end on staging. Production unchanged.
**Scope of change:** Documentation only. No code, schema, flag, or environment change accompanies this report.

Feature: flag-gated passenger→room assignment, unassignment, and auto-assign on the Operations V2
Passengers & Rooming tab, behind `NEXT_PUBLIC_OPS_V2_PAX_EDIT` (default OFF), admin/operations only,
via new V2 JSON proxies. Room CRUD (PR-2c-1) and passenger editing (PR-2b) remain unchanged.
References: `docs/passenger-rooming-pr2c-rooming-editing-plan.md`,
`docs/passenger-rooming-pr2c-1-staging-validation.md`.

---

## 1. Deploy status
- **Merge commit for #629:** `e30eb1ca` (`feat(admin-web): add Ops V2 rooming assignment controls`).
- **Staging admin-web:** the merge auto-deployed a fresh staging build carrying PR-2c-2;
  `NEXT_PUBLIC_OPS_V2_PAX_EDIT` was already set on staging, so the flag is inlined. Editor live.
- **Production:** unchanged — `NEXT_PUBLIC_OPS_V2_PAX_EDIT` absent on production admin-web (4gu9); the
  V2 editor is not accessible in production.

## 2. Validation on BK-2026-0002

| # | Check | Result |
| - | ----- | ------ |
| 1–2 | Flags (staging ON / production 4gu9 OFF) | Yes |
| 3–4 | Rooming assignment controls appear | Yes — assigned passengers show Unassign; assign picker + Auto-assign render when passengers are unassigned |
| 5 | Add a temporary second passenger | 201 (no passport) |
| 6 | Assign passenger to a room (no capacity limit) | 201 |
| 7 | Capacity guard (room set to a full occupancy) | 400 — **"This room is already at its single occupancy limit."** |
| 8 | Capacity path exercised via occupancy edit | Yes |
| 9 | Unassign the passenger | 200 |
| 10 | Auto-assign with an unassigned passenger | 201 — created 1 room, assigned 1 passenger |
| 11 | Auto-created room appears after refresh | Yes |
| 12 | Clean up temporary passenger/room, restore baseline | Yes — back to 1 passenger, 1 room |
| 13 | Readiness warnings update after refresh | Yes |
| 14 | Room CRUD + passenger editing still work | Yes |
| 15 | No finance / cost / sell / margin data | None in the passengers/rooming view |
| 16 | Production unchanged | Yes — production editor flag absent |
| 17 | Voucher-send allowlist unchanged | Yes — `ziad@axisdmc.com` only |

**End state:** BK-2026-0002 restored to baseline — one passenger (QA Contact, lead) in Room 1; no
leftover test data.

## 3. Key results
- **Assign / Unassign / Auto-assign** all succeed against the staging API; the assign picker lists only
  currently-unassigned passengers.
- **Capacity guard** blocks assignment to a full room with the exact expected message, surfaced inline.
- **Auto-assign** creates a room and assigns the unassigned passenger; the new room appears on refresh.
- **Room CRUD and passenger editing are unchanged** and still work.
- **Readiness** updates on refresh; **no finance/pricing** surfaced.

## 4. Safety confirmation
- **Production not enabled** — no production flag changes; the V2 editor flag is absent on 4gu9.
- **Voucher-send allowlist unchanged** — remains `ziad@axisdmc.com` only; supplier email / voucher-send
  untouched.
- **No PII fields editable** in V2; **no finance/pricing** surfaced in the passengers/rooming view.
- Documentation only — no code, schema, flag, or environment change in this report.
