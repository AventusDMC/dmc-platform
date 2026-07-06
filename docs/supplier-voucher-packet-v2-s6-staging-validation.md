# Supplier Voucher Packet V2 — S6 (Stale Detection + Regenerate) Staging Validation Report

**Date:** 2026-07-06
**Environment:** Staging only (staging API + `dmc-platform-admin-web-staging.vercel.app`)
**Verdict:** ✅ PASS — read-only stale detection and regenerate work end-to-end on
staging; production remains fail-closed.
**Scope of change:** Documentation only. No code, schema, flag, or environment change
accompanies this report.

Feature: Supplier Voucher Packet V2 Slice S6 — read-only `isStale` detection (recompute the
current group's `contentHash` and compare to the stored `packet.contentHash`) surfaced on the
groups endpoint, plus a fail-closed `POST /bookings/:id/voucher-packets/:packetId/regenerate`
that rebuilds an existing packet's snapshot/items/`contentHash` in place. References:
`docs/supplier-voucher-packet-v2-s6-plan.md`,
`docs/supplier-voucher-packet-v2-s5-staging-validation.md`.

---

## 1. Merge commit
`3c2d9408ce283932b372398f799b2ac22e9f281f` — PR #657
(`feat: add supplier voucher packet stale detection and regenerate`), MERGED with all checks
green.

## 2. Staging deploy status
- **Staging API** (Railway): the S6 merge deployed **SUCCESS**. Confirmed live at runtime —
  the groups endpoint now returns the new `isStale` field, the regenerate endpoint responds,
  and the packet PDF serves.
- **Staging admin-web** (Vercel): auto-deployed the merge.

## 3. Flag status
- Staging backend `OPS_V2_VOUCHER_PACKET_ENABLED = true`.
- Staging frontend `NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET = true`.

## 4. Validation target
- Booking **BK-2026-0002**.
- Packet **f32d6acf-17aa-490b-94b7-c4f4bac426a0** (HOTEL group, supplier "TEST Hotel
  Supplier A", 1 service — "QA Hotel Service", day 1).

## 5. Initial stale state
On arrival the packet was **already stale** (`isStale = true`) — its stored `contentHash`
predated the current service data. Reported honestly (the plan anticipated "report current
stale state if already stale"). A baseline regenerate synced the stored hash to the current
data (`isStale = false`) before the test proper, establishing a known baseline hash.

## 6. Reversible change made
One reversible change to the included HOTEL service that affects the content hash: the
service's `serviceDate` time-of-day was moved within the **same calendar day**. Because the
HOTEL grouping key uses the date only, the group key was unchanged (so this exercised the
stale · **needs-regenerate** path, not the orphaned path), while the hashed full-timestamp
changed. A second pass separately exercised the **service-label** change path. All changes
were fully reverted afterward (see §11).

## 7. Stale badge result
After the change the groups endpoint reported the HOTEL group **`isStale = true`**,
**`orphaned = false`**, group key unchanged, packet status `GENERATED` — i.e. the exact
condition under which the panel renders the "Stale · needs regenerate" badge.

## 8. Regenerate button condition
With `isStale = true`, `orphaned = false`, and a present `existingPacketId`, the panel's
Regenerate control is shown (stale, non-orphaned, generated packet only). The regenerate was
then invoked against the backend endpoint.

## 9. Regenerate result
`POST …/voucher-packets/{packetId}/regenerate` → **success (201)**.

## 10. Same packetId / status / hash / generatedAt
- **Same packetId retained:** `f32d6acf-17aa-490b-94b7-c4f4bac426a0`.
- **Packet status remains `GENERATED`** (no STALE/SENT/other transition).
- **`contentHash` changed** to a new value on the data change (and reverted to the baseline
  value when the data was restored — deterministic).
- **`generatedAt` advanced** and **`generatedBy` updated** on each regenerate.
- The packet snapshot reflected the changed member value (items/snapshot replaced in place).
- After regenerate, the groups endpoint reported **`isStale = false`**.

## 11. Restore / cleanup result
The staging edits were made **only** to trigger the stale condition for this test and were
reverted to restore the baseline:
- `serviceDate` restored to its original value.
- The HOTEL service `description` was restored to **"QA Hotel Service"** (the booking-service
  edit path re-derives the description on every edit, so the original custom label was
  re-set), then a final regenerate re-synced the packet's stored `contentHash` to the restored
  data.
- **Final baseline confirmed:** description "QA Hotel Service", original `serviceDate`,
  snapshot label "QA Hotel Service", **`isStale = false`**, status `GENERATED`, same
  `packetId`. No packet rows were created or deleted; the packet row was updated in place.

## 12. PDF after regenerate
`GET …/voucher-packets/{packetId}/pdf` → **HTTP 200**, **Content-Type application/pdf**,
Content-Disposition preserved (`attachment; filename="packet-f32d6acf-…-voucher.pdf"`), body
starts with `%PDF`. The PDF reflects the regenerated snapshot.

## 13. Audit result
- **`voucher_packet_regenerated`** entries were written (booking-scoped, entityId = packet id)
  for each regenerate.
- **No `voucher_packet_marked_stale`** event (stale is read-only / not persisted).
- **No per-service included/removed deltas** — correct, because the single-member set never
  changed during the test (those audits only fire on a membership delta).
- No send / send-preview / email actions present.

## 14. Safety confirmations
- **No `voucher_packet_marked_stale` audit** — stale is computed read-only; the packet status
  stayed `GENERATED` throughout.
- **No send / send-preview / email behavior** — none invoked; the regenerate endpoint is
  snapshot/items/hash only.
- **No DOWNLOADED / SENT lifecycle tracking** — packet status never transitioned; no such
  fields were written.
- **No delete / discard** — the packet row was updated in place (same `packetId`); its items
  were replaced, not the packet row deleted.
- **Production unchanged / fail-closed** — no production flag/env/deploy change was made in
  this validation (all writes were to staging). Production backend
  `OPS_V2_VOUCHER_PACKET_ENABLED` is **absent/unset** and the production frontend
  `NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET` is **absent** → the enrichment exposes nothing and the
  regenerate/PDF endpoints fail-closed in production; the panel stays hidden.
- **Voucher-send allowlist unchanged** — `ziad@axisdmc.com` only; supplier sending remains
  disabled.
- **No Classic change.**
- Read-only inspections used credentials pulled into temporary files that were deleted
  immediately; no secrets, hosts, URLs, or connection details are recorded here.
- Documentation only — no code, schema, flag, or environment change in this report.
