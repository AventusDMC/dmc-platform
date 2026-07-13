# Product Catalog V2 — Slice 5 (NO_ACTIVE_SERVICES Hotel-Contract Modeling Fix) Validation Report

**Date:** 2026-07-13
**Environment:** Staging and Production API (Product Catalog V2 read model).
**Verdict:** ✅ PASS — the NO_ACTIVE_SERVICES modeling artifact is corrected in production; read-only;
no data change; no rollback needed.
**Scope of change:** Documentation only. No code, schema, flag, or environment change accompanies this
report.

Slice 5 makes the Product Catalog V2 supplier "operational activity" check count a supplier's own
active (non-expired) hotel contracts (via the existing `Hotel.supplierId` / `resolvedSupplierId` FK),
so hotel suppliers whose inventory lives in hotel contracts are no longer falsely flagged
NO_ACTIVE_SERVICES. Read-only aggregator/builder fix; no schema change, no writes, no pricing logic.

---

## 1. Merge commit
`a721fe2baa8412fcfb44cb55c86fbaf1b6308747` — PR #694
(`fix: count active hotel contracts in Catalog V2 supplier activity`), merged with checks green.
Three api-only files (loader + pure builder + builder test).

## 2. Deploy status
- **Staging API:** deployed — **SUCCESS**. The new `activeHotelContractCount` field is present and the
  linkage logic runs. Staging has its own smaller dataset, so the production count figures below are
  production-specific.
- **Production API:** deployed — **SUCCESS**. Validated behaviorally (new field present + counts moved
  exactly as predicted).

## 3. Flags unchanged
- Staging `CATALOG_V2_ENABLED = true`.
- Production `CATALOG_V2_ENABLED = true`.
- Production `NEXT_PUBLIC_CATALOG_V2 = true` (the catalog UI renders in production).
No flag was changed.

## 4. Production warningCounts (exactly as expected)

| Code | Before | After |
|---|---|---|
| NO_ACTIVE_SERVICES | 14 | 6 |
| MISSING_EMAIL | 6 | 6 |
| MULTIPLE_EMAILS | 0 | 0 |
| MISSING_RATES | 6 | 6 |
| EXPIRED_CONTRACT | 0 | 0 |
| EXPIRING_SOON | 0 | 0 |
| UNVERIFIED_HOTEL_CONTRACT | 8 | 8 |
| CURRENCY_MISMATCH | 4 | 4 |
| MISSING_BASE_CITY | 1 | 1 |
| **Total** | **39** | **31** |

NO_ACTIVE_SERVICES **14 → 6**, total **39 → 31**, all other counts unchanged — exactly as expected.

## 5. `activeHotelContractCount` works
The read-only `activeHotelContractCount` field is present per supplier and accurate — e.g. Corp Amman
Hotel = 1, RateHawk Inventory = 3, General Transport = 0, Sun City Camp Wadi Rum = 0.

## 6. Hotel false-positive validation (production)
The fix links by the real `Hotel.supplierId` / `resolvedSupplierId` FK (not by name). Exactly **8
suppliers cleared** NO_ACTIVE_SERVICES; the set matches the prediction except for two honest,
FK-driven differences (net count identical):

- **Cleared (active hotel contracts ≥ 1):** Corp Amman Hotel, Olive Hotel Amman, Amman Rotana Hotel,
  Dead Sea Spa Hotel, Crowne Plaza Jordan Dead Sea Resort & Spa, Holiday Inn Resort Dead Sea,
  Old Village Resort — plus **RateHawk Inventory**.
- **RateHawk Inventory cleared** because it has **3 FK-linked active hotel contracts**. This is a
  legitimate clear through FK linkage — RateHawk was **not** incorrectly hidden; it genuinely has
  active inventory.
- **Sun City Camp Wadi Rum stayed flagged** (activeHotelContractCount = 0) because the flagged Sun
  City supplier row is **not** FK-linked to the Sun City hotel contract (the contract's owning hotel
  resolves to a different/duplicate supplier row). This is **not** a Slice 5 defect — the fix
  correctly links by FK; Sun City likely needs a later duplicate/mislinked supplier data cleanup.

## 7. Still-flagged validation (production) — the 6
Correctly flagged (activeHotelContractCount = 0, operationallyActive = false): **General Transport**
(transport stub), **Mövenpick Hotels & Resorts – Jordan**, **Olive Branch Hotel Jerash**,
**Grand Hyatt Amman**, **DoubleTree by Hilton Aqaba** (all un-contracted hotels), and **Sun City Camp
Wadi Rum** (per §6).

## 8. UI renders in production
The `/catalog/v2` page renders normally in production (read-only summary + suppliers). No UI change
was needed — the response addition is additive.

## 9. Read-only / no-write confirmation
The change is a read-only aggregator recomputation; all validation requests were GETs. No
`create / update / delete / upsert` in the change; **no audit rows created; no supplier / service /
rate / contract / currency rows created, updated, or deleted.** This is a read-model correction, not a
data change.

## 10. Supplier packet / send / allowlist unchanged
No packet / send / allowlist code was touched. The voucher-send **allowlist remains
`ziad@axisdmc.com` only**, supplier sending remains **disabled**, and no packet flags changed.

## 11. Final production status
Slice 5 is **live and validated in production**: the NO_ACTIVE_SERVICES modeling artifact is corrected
(14 → 6, total 39 → 31, all other counts unchanged), driven by the real hotel↔supplier FK. Two honest
FK-driven differences from the name-based prediction — **RateHawk correctly cleared** (3 real active
hotel contracts) and **Sun City correctly stayed flagged** (mislinked/duplicate supplier, a data
follow-up, not a defect). Product Catalog V2 remains live internal-only. No flags, data, or
supplier-send behavior changed.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change.
- Read-only inspection used a session secret pulled into a temporary file that was deleted
  immediately; no secrets, hosts, URLs, project identifiers, session tokens, supplier IDs, or
  connection details are recorded here.
