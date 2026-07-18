# ERP V2 — Quote Builder V2 · Slice 1: Capability Inventory

**Date:** 2026-07-18
**Status:** Read-only inventory. **Build-mode — Classic remains the system of record.** No code, schema,
flag/env, or data change accompanies this report; no staff rollout, no live bookings, no cleanup, no email.

## 1. Executive summary
- **Quote Builder V2 is feature-rich but flag-fragmented.**
- **Many core surfaces are built** (itinerary, pricing preview/apply, passengers/rooming, proposal
  share-link, Mark-as-Sent, Accept/Request-Changes, Booking Creation V2).
- **Several important flows remain Classic-dependent** (guide/meal create, notes/inclusions/exclusions,
  versioning, finance, catalog/rate).
- **Classic remains the system of record.**
- **Staff rollout / live bookings remain NO-GO.**

Each capability is gated by a **fail-closed backend `QUOTE_*` flag plus a mirrored frontend
`NEXT_PUBLIC_QUOTE_BUILDER_V2_*` flag** (dual-gate). Client-facing proposal/PDF output redacts cost/margin;
the internal builder UI does not.

## 2. Capability matrix
Support: ✅ full · ◑ partial · ⛔ none / Classic. "Recalc" = the write path re-prices via
`recalculateQuoteTotals`.

| # | Capability | V2 | Create | Edit/Price | Preview | Apply | Recalc | Backend flag (fail-closed) |
|---|---|---|---|---|---|---|---|---|
| 1 | Itinerary day create/edit/delete | ✅ | ✅ | ✅ meta | — | — | inert | `QUOTE_ITINERARY_EDIT` |
| 2 | Activity item | ✅ | ✅ | ◑ price | ✅ | ✅ | yes | `QUOTE_ITEM_CREATE`; `QUOTE_PRICING_*` |
| 3 | Guide item | ◑ | ⛔ Classic | ◑ price only | ✅ | ✅ | yes | price via `QUOTE_PRICING_*` (no V2 create) |
| 4 | Hotel | ✅ | — | ✅ set-primary + price | ✅ | ✅ | yes | `QUOTE_PRICING_HOTEL_PREVIEW` / `_HOTEL_APPLY` |
| 5 | Transport | ◑ | — | ◑ preview + T-A apply | ✅ | ◑ (OFF) | apply=yes | `QUOTE_PRICING_TRANSPORT_PREVIEW` / `_APPLY` |
| 6 | Entrance / Ticket / Jordan Pass | ◑ | — | ◑ entrance+JP; ticket Classic | ✅ | ✅ | yes | `QUOTE_PRICING_ENTRANCE_PREVIEW` / `_APPLY` |
| 7 | External package | ◑ | — | ◑ resolvable only | ✅ | ◑ (OFF) | yes | `QUOTE_PRICING_EXTERNAL_PACKAGE_PREVIEW` / `_APPLY` |
| 8 | Meal / dining | ◑ | ⛔ Classic | ◑ price only | ✅ | ✅ | yes | generic `QUOTE_PRICING_PREVIEW` / `_APPLY` |
| 9 | Notes / inclusions / exclusions | ⛔ | ⛔ | ⛔ Classic | — | — | — | none |
| 10 | Passenger / rooming fields | ✅ | ✅ | ✅ | — | — | inert | none (role-gated) |
| 11 | Proposal versioning | ⛔ | ⛔ Classic | — | — | — | — | none |
| 12 | Mark-as-Sent | ✅ | — | status only | — | — | inert | none |
| 13 | Public proposal link | ✅ | ✅ enable/disable/copy | — | — | — | — | none (not role-gated in UI) |
| 14 | Accept / Request Changes | ✅ | — | public `/q/[token]` | — | — | — | none (`@Public()`) |
| 15 | Booking Creation V2 | ✅ | ✅ convert | — | — | — | conversion | `QUOTE_BOOKING_CREATE` |
| 16 | Cost / margin visibility | ⚠️ | — | shown in UI | — | — | — | none — UI not role-gated; proposal DTO redacted |
| 17 | Role gating | ✅ | — | admin/operations writes; viewer read | — | — | — | server-resolved |
| 18 | Audit coverage | ✅ | — | create/apply/status/convert audited | — | — | — | `AuditService` |

**Conversion-readiness impact:** Accept requires status === SENT + a resolvable accepted version and
**auto-generates a client invoice**; Booking Creation V2 requires `acceptedVersionId`. Versioning + status
therefore gate the whole conversion chain.

## 3. Flag matrix — staging vs production
| Backend flag | Prod | Staging |
|---|---|---|
| `QUOTE_PRICING_PREVIEW` / `_APPLY` | true / true | true / true |
| `QUOTE_PRICING_HOTEL_PREVIEW` | true | true |
| **`QUOTE_PRICING_HOTEL_APPLY`** | **true** | **OFF** (inconsistent) |
| `QUOTE_PRICING_TRANSPORT_PREVIEW` / `_APPLY` | true / false | true / OFF |
| `QUOTE_PRICING_ENTRANCE_PREVIEW` / `_APPLY` | true / true | true / true |
| `QUOTE_PRICING_EXTERNAL_PACKAGE_PREVIEW` / `_APPLY` | true / false | true / OFF |
| `QUOTE_ITEM_CREATE` | OFF | true |
| `QUOTE_ITINERARY_EDIT` | OFF | true |
| `QUOTE_BOOKING_CREATE` | true | true |
| `OPS_V2_VOUCHER_PACKET_ENABLED` | true | true |
| `OPS_V2_VOUCHER_SEND_ENABLED` | false | true (allowlist-contained) |
| voucher-send allowlist | `ziad@axisdmc.com` | `ziad@axisdmc.com` |

- **ON in production:** pricing preview/apply, hotel preview+apply, entrance preview+apply, external +
  transport preview, booking-create, packet.
- **OFF in production:** item-create, itinerary-edit, transport-apply, external-apply, V2-default,
  voucher-send, proposal-email-send.
- **ON only in staging:** item-create, itinerary-edit, voucher-send.
- **Must stay OFF in production during build-mode:** item-create, itinerary-edit, transport-apply,
  external-apply, V2-default, proposal-email-send.
- **HOTEL_APPLY prod/staging inconsistency:** ON in prod, OFF in staging — prod hotel-apply behavior cannot
  be reproduced on staging.
- Frontend `NEXT_PUBLIC_QUOTE_BUILDER_V2_*` mirror flags are baked per-deploy and CLI-masked; effective
  state pairs with the backend flag (dual-gate). `NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT` = OFF in prod.

## 4. Classic-only paths
- Guide create.
- Meal create.
- Notes / inclusions / exclusions edit.
- Proposal versioning.
- Pax counts / pricing-impacting passenger changes.
- Multi-country grouping.
- Finance (invoice / payment / reconciliation).
- Catalog / supplier / rate edits.
- Ticket variant / pax on entrance.

## 5. Risk list
- **Cost/margin shown in the internal V2 builder UI without enough role-gating** (client-facing proposal /
  PDF is redacted and safe). — HIGH internal / LOW client.
- **Non-deterministic recalc on item create / apply** (both delegate to `recalculateQuoteTotals`; apply is
  guarded by a preview-token delta, create is not). — HIGH.
- **`serviceType` vs `operationType` mapping risk** in the booking-snapshot builder. — Medium.
- **Accept auto-generates an invoice** (finance side effect; public-accept path untested). — Medium.
- **HOTEL_APPLY prod/staging inconsistency.** — Medium.
- **Guide / meal / versioning Classic dependency** (incomplete real workflow). — Medium.
- **Public-link controls not role-gated enough in the UI.** — Low–Medium.
- **Dual-flag confusion** (backend + frontend must both be ON; entrance flag asymmetry). — Low–Medium.

## 6. Missing tests
- Proposal version save.
- Mark-as-Sent status transition.
- Public Accept → invoice path.
- Inclusions / exclusions persistence.
- Cost / margin UI role-gating.
- `serviceType` → `operationType` edge mapping.

## 7. Recommended Slice 2 scope
- **Add-day / add-item hardening** on staging (flags already ON there), with the missing version / status /
  invoice tests.
- **Item-create determinism / delta guard** (mirror the apply path's acknowledged-delta).
- **Add-guide decision** — merge a V2 guide-create route or explicitly scope it out for now.
- **Cost / margin V2 UI role-gating.**
- **HOTEL_APPLY staging / prod reconciliation.**
- All staging-only, synthetic, no send, no production flag change.

## 8. GO / NO-GO
- ✅ **GO** for continued build and staging validation.
- ⛔ **NO-GO** for staff rollout.
- ⛔ **NO-GO** for live bookings.
- ⛔ **NO-GO** for supplier send.
- ⛔ **NO-GO** for full no-Classic launch.

## 9. Safety confirmation
- Read-only inventory only.
- No code.
- No data.
- No flags.
- No production / staging writes.
- No staff / live usage.
- No email / send.
- Voucher-send allowlist remains `ziad@axisdmc.com` only.
- Supplier sending remains disabled.

### Safety confirmations
- Documentation only — no code, schema, flag, environment, or data change accompanies this report.
- No secrets, passwords, DB URLs, credentials, internal hosts, raw deployment URLs, project identifiers,
  scratch links, session tokens, cookies, or internal UUIDs / raw user / supplier / invoice / voucher /
  packet IDs are recorded here — only flag names, route / component names, capability descriptions, and
  the inventory.
