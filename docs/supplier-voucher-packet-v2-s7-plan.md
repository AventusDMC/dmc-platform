# Supplier Voucher Packet V2 — S7 (Send-Preview / Readiness) Plan

**Status:** Planning only. No code, schema, migration, flag, or environment change
accompanies this document.
**Scope:** A **read-only** packet send-preview / readiness view — describe what a supplier
packet email *would* contain and whether it *could* be sent, aggregated across the packet's
services. **No actual send, no email, no send endpoint, no transport call, no status
mutation, no `sentAt`, no audit write, no allowlist change.** Production remains fail-closed;
Classic remains fallback/reference only.
**References:** `docs/supplier-voucher-packet-v2-plan.md`,
`docs/supplier-voucher-packet-v2-s6-plan.md`,
`docs/supplier-voucher-packet-v2-s6-staging-validation.md`.

---

## 0. Decisions locked for S7

1. **Send-configuration gates are blockers (full readiness picture).**
   - `SEND_DISABLED` (backend send off) makes the packet **Not Ready**.
   - `RECIPIENT_NOT_ALLOWLISTED` (supplier email not on the allowlist) makes the packet
     **Not Ready**.

2. **Dedicated frontend flag:** `NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET_SEND_PREVIEW`, **default
   OFF**. The read-only readiness section renders only when this is ON (in addition to the
   existing packet panel flag).

3. **Backend gate:** `OPS_V2_VOUCHER_PACKET_ENABLED`, **default OFF / fail-closed** (checked
   first). The preview *reads* the send flag/allowlist to report config blockers but does not
   require them and never enables sending.

4. **S7 is send-preview / readiness only** — no actual send, no email, no send endpoint, no
   transport call, no status mutation, no `sentAt`, no audit write, no allowlist change.

---

## 1. Current single-service send-preview behavior (grounding)

The existing Phase 2F pattern is the template to mirror:

- **Pure builder** `buildVoucherSendPreview` (`apps/api/src/bookings/voucher-send-preview.ts`)
  is read-only and finance/PII-free. Recipient is the **assigned operational supplier only**
  (`bookingService.assignedSupplierId → Supplier.email`) — never a catalog/source/restaurant
  fallback and never client-supplied. Readiness enum:
  `READY | NO_VOUCHER | VOUCHER_CANCELLED | UNSAFE_STATUS | NO_SUPPLIER | MISSING_EMAIL |
  INVALID_EMAIL`. Emails are parsed via `parseSupplierEmails` (comma/semicolon separated) into
  `email` (valid, joined), `emails` (all), plus `missingEmail` / `invalidEmail` flags.
- **Route** `GET :id/operations/:operationId/voucher/send-preview` (`@Roles admin/operations`)
  returns the pure builder's output; it writes nothing — no audit, no status/`sentAt`, no PDF.
- **The actual send** (Phase 2F-B, `voucher-send.core.ts`) is a separate, gated step whose
  request body is **ignored** (recipient/subject/body/attachment are 100% server-resolved).
  Its ordered gates — `feature_disabled → recipient_allowlist_required →
  transport_not_configured → not_ready → recipient_not_allowed → duplicate_recent →
  pdf_failed → send_failed → audit-after-success` — define the config gates S7's preview will
  *report* (not enforce).
- **Flags/config** (`ops-voucher-send-flags.ts`): `OPS_V2_VOUCHER_SEND_ENABLED` (independent
  send kill-switch, OFF in prod), `parseRecipientAllowlist` from
  `OPS_V2_VOUCHER_SEND_RECIPIENT_ALLOWLIST` (currently `ziad@axisdmc.com`), and
  `isRecipientAllowed` (exact email or `@domain`, case-insensitive).

## 2. Packet send-preview route

`GET /bookings/:id/voucher-packets/:packetId/send-preview` — `@Roles('admin','operations')`,
**gated by `OPS_V2_VOUCHER_PACKET_ENABLED`** (checked first; fail-closed → `403` when off). A
new pure builder `buildVoucherPacketSendPreview` produces the output. The route **reads** the
send flag and allowlist only to *report* config blockers; it does not require them and does
not enable sending. An admin-web GET JSON proxy mirrors the S5 groups proxy (GET-only, no
body, no redirect).

## 3. Aggregate readiness across packet services

A packet is a single-supplier group (its `groupingKey` embeds `supplierId`), so aggregation is
over the packet's members against one supplier. Ordered readiness precedence:

1. Packet exists and `status === 'GENERATED'` → else `NO_PACKET`.
2. Packet **not stale** (reuse the S6 `isStale` computation: current-group `contentHash` vs
   stored `packet.contentHash`) → else `PACKET_STALE`.
3. PDF available (`GENERATED` + `snapshotJson` present; the S4 PDF renders from the snapshot,
   so no render is needed to check) → else `NO_PDF`.
4. Supplier assigned (`packet.supplierId` present; members still assigned to it) → else
   `NO_SUPPLIER`.
5. Supplier has an email → else `MISSING_EMAIL`.
6. Exactly **one** valid email → else `MULTIPLE_EMAILS` or `INVALID_EMAIL`.
7. Backend send enabled → else `SEND_DISABLED` (**blocker**, per Decision 1).
8. Recipient allowlisted → else `RECIPIENT_NOT_ALLOWLISTED` (**blocker**, per Decision 1).

`READY` only when **all** pass. The response returns `readiness`, `readinessReason`,
`blockingReasons[]`, the resolved `recipient`, `serviceCount`, member labels, and the fixed
note `'Preview only. No email is sent.'` This is deliberately **more comprehensive** than the
single-service preview (which defers config gates to send-time) — S7 surfaces the config gates
as blockers so operators get the full send-readiness picture (Decision 1).

## 4. Supplier recipient — assigned supplier only

Recipient resolves from **`packet.supplierId → Supplier.email`** (the packet's stored
supplier, which the grouping engine guarantees is the single shared assigned supplier). Reuse
`parseSupplierEmails` + `isValidEmail`. **No catalog/source/restaurant fallback.** Because a
packet must have exactly one recipient, `MULTIPLE_EMAILS` is a **blocker** here (stricter than
the single-service preview, which joins multiple addresses).

## 5. No client-supplied recipient

The route takes **no request body** (path params only). Recipient/subject/body/attachment name
are 100% server-resolved from the packet + supplier — the same discipline as Phase 2F-B. Tests
assert the route and proxy send no body.

## 6. Allowlist unchanged

The preview only **reads** `parseRecipientAllowlist()` to compute the
`RECIPIENT_NOT_ALLOWLISTED` blocker. **No allowlist write or enablement.** The allowlist
remains **`ziad@axisdmc.com` only**.

## 7. Preview is read-only

Pure builder + read-only Prisma reads (packet + supplier + member services). Mutation traps in
the service test prove **no create/update/delete, no audit, no status/`sentAt` change, and no
PDF generation**.

## 8. No send occurs

S7 adds **no send endpoint, no email, and no transport call**. It only *describes* readiness.
`OPS_V2_VOUCHER_SEND_ENABLED` is neither required nor toggled.

## 9. UI copy

A **read-only "Send readiness" section** inside each generated packet in the Supplier Packets
panel, gated by `NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET_SEND_PREVIEW` (default OFF; in addition to
the existing packet panel flag):

- Header: **"Send readiness — preview only"**; persistent sub-note: **"Preview only. No email
  is sent."**
- Recipient line: **"Would send to: {supplier name} — {resolved email}"**, or **"No supplier
  email on file."**
- Readiness pill: **Ready to send** (green) or **Not ready** (amber) with the blocker
  reason(s) as chips (see §10 copy).
- **No Send button, no "Send preview email", no inline preview that transmits** — read-only
  text only. Download PDF (S5) and Regenerate (S6) stay as-is.

## 10. Blockers (code → operator copy)

| Condition | Code | Copy |
|---|---|---|
| No supplier email | `MISSING_EMAIL` | "The assigned supplier has no email on file." |
| Multiple supplier emails | `MULTIPLE_EMAILS` | "The supplier has multiple emails — packet send needs a single recipient." |
| Supplier not assigned | `NO_SUPPLIER` | "Assign a supplier to all packet services first." |
| Packet stale | `PACKET_STALE` | "Packet is stale — regenerate before sending." |
| Packet missing PDF | `NO_PDF` | "Generate the packet before it can be sent." |
| Backend send disabled | `SEND_DISABLED` | "Supplier sending is not enabled." |
| Recipient not allowlisted | `RECIPIENT_NOT_ALLOWLISTED` | "Supplier email is not on the send allowlist." |
| Invalid supplier email | `INVALID_EMAIL` | "The supplier email is not a valid address." |

## 11. Tests

- **Pure builder** (`voucher-packet-send-preview.test.ts`): one case per readiness/blocker
  branch — `READY`, `NO_PACKET`, `PACKET_STALE`, `NO_PDF`, `NO_SUPPLIER`, `MISSING_EMAIL`,
  `MULTIPLE_EMAILS`, `INVALID_EMAIL`, `SEND_DISABLED`, `RECIPIENT_NOT_ALLOWLISTED`; recipient =
  assigned supplier only; finance/PII-free; `blockingReasons` complete; note constant present.
- **Service** (`voucher-packet-send-preview.service.test.ts`, Prisma-mock): flag OFF → `403`,
  nothing read; flag ON → reads packet + supplier + members with **mutation traps proving no
  writes/audit**; recipient never from client; allowlist/send-flag only read.
- **Proxy source-grep**: GET-only, no body/`formData`, no redirect, no `/send`.
- **UI render**: readiness section + recipient line + blocker chips render for a generated
  packet; **no `<button>` / Send / send-preview** controls; preview-only note present; nothing
  renders for ungenerated packets or when the flag is OFF.

## 12. Staging validation

Using packet **f32d6acf-17aa-490b-94b7-c4f4bac426a0** on **BK-2026-0002** (staging, packet
flag ON):

1. `GET …/voucher-packets/{packetId}/send-preview` → `200`.
2. Confirm the recipient resolves from **TEST Hotel Supplier A** (`packet.supplierId →
   Supplier.email`) only; if the supplier has no / a non-allowlisted email, confirm the
   corresponding blocker (`MISSING_EMAIL` or `RECIPIENT_NOT_ALLOWLISTED`) — a valid negative
   that proves the gate.
3. Confirm `blockingReasons`, `readiness`, and the preview-only note.
4. Confirm **read-only** (no audit entry, no status/`sentAt` change, packet stays `GENERATED`,
   no PDF written) and that **no send** occurred.
5. Confirm **production fail-closed** (packet flag unset → `403`) and **allowlist unchanged**
   (`ziad@axisdmc.com`). No production / flag / allowlist change during validation.

## 13. Rollback / fallback

- **Flag OFF** → the route fail-closes (`403`); the readiness section does not render. Nothing
  to roll back at the data level (read-only, no schema/migration).
- **No schema/migration** — S7 adds no columns and no tables; it reads existing packet +
  supplier + service data.
- Single-service vouchers, the S5 download, and the S6 regenerate paths are unaffected.

## 14. Risks

1. **Config-gate reporting scope** — the preview reads `OPS_V2_VOUCHER_SEND_ENABLED` and the
   allowlist; it must only *read* them (never enable/alter). Enforced by mutation traps and
   flag tests.
2. **Recipient ambiguity** — treating multiple supplier emails as a blocker is intentional
   (a packet needs a single recipient); documented so it is not mistaken for a regression vs
   the single-service preview.
3. **Stale coupling** — readiness depends on the S6 `isStale` computation; both must use the
   identical `contentHash` function to avoid drift.
4. **No send by construction** — S7 introduces no send path; the actual packet send remains a
   future slice gated by `OPS_V2_VOUCHER_SEND_ENABLED` + allowlist.
5. **Production safety** — no env/flag/allowlist change; both packet flags stay OFF in prod;
   the preview route is fail-closed.

---

## Summary

S7 adds a **read-only packet send-preview / readiness** view: `GET
/bookings/:id/voucher-packets/:packetId/send-preview` (backend-gated by
`OPS_V2_VOUCHER_PACKET_ENABLED`, fail-closed) backed by a pure
`buildVoucherPacketSendPreview` that aggregates readiness across the packet's services, with
the recipient **server-resolved from `packet.supplierId` / the assigned supplier only** (no
client-supplied recipient). Multiple supplier emails, backend send disabled, and recipient
not allowlisted are all **blockers**; the allowlist remains **`ziad@axisdmc.com` only** and
**no email is sent**. The UI section is gated by a dedicated
`NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET_SEND_PREVIEW` (default OFF). **No send/send-preview
mutation, no audit, no status change, no schema/migration.** Production remains fail-closed;
Classic remains fallback/reference only.
