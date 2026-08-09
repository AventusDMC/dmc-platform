# Quote Builder V2 — VV-3: Read-Only Version List/View Plan

Planning document. No code, no behavior change. Plans a read-only V2 proposal
version list/view so users can see saved versions from Quote Builder V2 without
returning to Classic — with a **security-first** sequence, because the existing
version read routes are neither role-gated nor company-scoped and the raw detail
endpoint exposes the full `snapshotJson`.

---

## 1. Current state

- **`GET /quotes/:id/versions`** exists and returns **metadata only**:
  `{id, quoteId, versionNumber, label, createdAt}`, newest-first, `take: 50`. No
  snapshot, no cost.
- **`GET /quotes/:id/versions/:versionId`** exists and returns the **raw
  `QuoteVersion` row including `snapshotJson`**.
- **V2 has no version list/view** — users must go back to Classic (which has a
  server-rendered version page).
- **VV-1** only shows the just-saved version number (after Save version).
- **VV-2** only shows readiness booleans (advisory), not the versions themselves.
- admin-web GET proxies already exist for both the list and the detail routes.

## 2. Security gap

- The existing version read routes are **not role-gated** (no `@Roles`).
- They are **not company-scoped through the actor** — both call `findOne(id)`
  **without** the actor, so any authenticated user of any company can read them.
- The **raw version detail exposes `snapshotJson`**.
- `snapshotJson` can include **cost, margin, PII, internal notes, passengers,
  contacts, and pricing data** (it is a full quote snapshot).
- **V2 must not build on the raw detail endpoint.**

## 3. Recommended design

- **Slice 0 / security first:** harden the existing version read routes with
  `@Roles` + actor (company) scoping before surfacing versions in V2.
- **Slice 1:** read-only **saved-versions metadata list** in V2 (no cost, no PII).
- **Slice 2:** **redacted, PII-free version summary endpoint** + detail drawer
  (curated summary, never raw JSON; completeness reuses the VV-2 evaluator).
- **Slice 3:** any further raw-route hardening if not already completed in Slice 0.

No mutations anywhere in VV-3: no restore/rollback, no set-accepted, no send.
Classic remains the system of record.

## 4. Safe list fields

- `versionNumber`
- `label`
- `createdAt`
- accepted badge if available
- **no `snapshotJson`**
- **no cost / margin / PII**

## 5. Safe detail summary

- title / status-at-snapshot
- travel dates
- pax counts
- client-facing selling total / per-person / currency
- item count
- day count
- inclusions / exclusions presence
- completeness / `acceptWillSucceed`
- **no passenger PII**
- **no raw JSON**

## 6. Cost / privacy rules

- **Server-side redaction required.**
- `admin` / `super_admin` / `finance` may see cost if needed.
- `viewer` sees the **client-facing summary only**.
- **Raw `snapshotJson` must not be sent to non-finance clients.**
- **FE-only redaction is insufficient** (the raw values still reach the browser) —
  redact on the backend. The existing `redactQuoteV2CostMargin` targets the adapted
  V2 `Quote`, not a raw snapshot, so it is not directly reusable for detail.

## 7. Risks

- Raw `snapshotJson` exposure.
- Cross-company access risk (unscoped read routes).
- Cost / PII leakage.
- Role mismatch (viewer in the read gate but not cost-visible).
- Stale snapshot vs live quote (the view reflects the saved snapshot, not live).
- UI accidentally rendering raw JSON.

## 8. Test plan

- List metadata render.
- Accepted badge.
- Summary endpoint omits `snapshotJson`.
- Summary omits PII.
- Cost gated by finance role.
- Company scope returns 404.
- Unauthorized role returns 403.
- No writes.
- Save-version / readiness / proposal regressions.
- Staging read-only validation on Q-2026-0004.

## 9. GO / NO-GO

**GO**

- Harden the existing version read routes first (roles + actor scoping).
- Build the read-only metadata list after route hardening.
- Build the redacted summary detail later.

**NO-GO**

- Raw `snapshotJson` rendering.
- Building the detail view on the ungated raw endpoint.
- Restore / rollback / set-accepted / send from the version view.
- Accept.
- Invoice creation.
- Booking conversion.
- Staff rollout.
- Live bookings.
- Supplier send.
- Full no-Classic launch.

## 10. Standing state

- ERP V2 remains **build-mode**.
- **Classic remains the system of record.**
- Production item-create **OFF**.
- Voucher-send allowlist remains **`ziad@axisdmc.com` only**.
- Supplier sending **disabled**.

---

*Planning only. No code, no data, no flag/env, no production or staging behavior
change.*
