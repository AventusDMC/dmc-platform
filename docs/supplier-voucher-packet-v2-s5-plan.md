# Supplier Voucher Packet V2 — S5 (Packet Download UI) Plan

**Date:** 2026-07-06
**Status:** Approved plan (documentation only). No code, schema, migration, flag, or
environment change accompanies this document.
**Goal:** let Ops V2 **download** the S4 packet PDF for **already-generated** packets. **UI /
proxy / download only** — no packet mutation, no status change, no DOWNLOADED tracking, no
audit, no send / send-preview / email. Classic remains fallback/reference only.

## Decisions folded in
1. **Enrich the existing S2 groups endpoint** with `existingPacketId` + `packetStatus`; do
   **not** add a separate packet-list endpoint in S5.
2. **Download-only first** — add a "Download PDF" affordance; do **not** add inline
   View/Preview in S5 (defer to a later slice if needed).
3. **Read-only** — no packet mutation, no status change, no DOWNLOADED tracking, no audit,
   no send, no send-preview, no email, no allowlist change.
4. **Backend-flag-gated exposure** — `existingPacketId` / `packetStatus` are exposed **only
   when `OPS_V2_VOUCHER_PACKET_ENABLED` is ON**; when OFF, no download affordance appears
   (prevents visible-but-403 buttons in production).

---

## 1. Summary
S5 exposes **packet PDF download** in the Ops V2 "Supplier Packets" panel for generated
packets. It bridges the existing panel (which knows `groupingKey`) to the S4 PDF endpoint
(which needs `packetId`) by enriching the groups endpoint, and adds a read-only admin-web
PDF proxy plus a "Download PDF" link.

## 2. Enrich the existing groups endpoint
`GET /api/bookings/:id/voucher-packets/groups` gains, per group, **`existingPacketId`** and
**`packetStatus`** — computed by a **read-only** lookup of `voucher_packets` for the booking,
matched on `groupingKey`. No new endpoint; no separate packet list. **Read-only** (no
mutation). **Backend-flag-gated:** these fields are populated only when
`OPS_V2_VOUCHER_PACKET_ENABLED` is ON; when OFF they are null/absent, so the UI shows no
download. The DTO stays PII-free and finance-free (supplier name, type, counts, status,
packet id only).

## 3. Admin-web PDF proxy
A read-only `app/api/bookings/[id]/voucher-packets/[packetId]/pdf/route.ts` — **GET only** —
forwards `Authorization` (`buildActorHeaders`) and **streams the binary** (`arrayBuffer` →
`NextResponse` with `Content-Type: application/pdf` and the upstream `Content-Disposition`).
It is a binary passthrough (not `forwardProxyJsonResponse`), mirroring the existing
single-service voucher PDF download proxy. No mutation, no redirect.

## 4. Download PDF affordance (generated packets only)
In the panel, for each group that has an `existingPacketId`, render **"Download PDF"** — a
link to the proxy URL (`/api/bookings/:id/voucher-packets/:packetId/pdf`); the attachment
disposition triggers a download. Groups **without** a packet show **no** download link (and
S5 adds **no** Generate button — generation is S3). **No Send, no send-preview, no email.**

## 5. No inline preview in S5
S5 ships **Download-only**. Inline "View / Preview" (open the PDF in a new tab via an inline
`Content-Disposition`) is **deferred** to a later slice.

## 6. Role permissions
`admin` / `operations` (super_admin via coalescing; `agent_admin` / `agent` / `viewer` /
`finance` excluded). The panel already renders only for those roles; the backend PDF and
groups endpoints are `@Roles('admin','operations')`; the proxy forwards the session and the
backend re-enforces role + the fail-closed flag.

## 7. Flag behavior
- **`NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET`** (frontend, default OFF) — gates the panel and the
  download affordance. ON in staging; OFF/absent in production.
- **`OPS_V2_VOUCHER_PACKET_ENABLED`** (backend, default OFF, fail-closed) — gates the PDF
  endpoint **and** the `existingPacketId` / `packetStatus` enrichment. ON in staging; **unset
  in production**.
- Both must be ON for download to work. Because the backend gate also controls whether
  `existingPacketId` is returned, production (backend OFF) shows **no** download affordance
  even if the frontend flag were toggled — **no visible-but-403 button**.

## 8. Read-only guarantees
- **No packet mutation**, **no status change** (packet stays `GENERATED`), **no DOWNLOADED
  tracking**, **no audit write**.
- The enrichment is a read; the PDF proxy is a binary passthrough of the S4 read-only render.

## 9. Staging validation plan (packet `f32d6acf-17aa-490b-94b7-c4f4bac426a0`)
1. Confirm staging flags ON (frontend `true`; backend `OPS_V2_VOUCHER_PACKET_ENABLED=true`).
2. Render the Ops V2 operations tab for BK-2026-0002 → the **HOTEL group shows "Download
   PDF"** (a generated packet exists); **no Send / send-preview** buttons.
3. Hit the admin-web proxy PDF URL for `f32d6acf-…` → **200**, `application/pdf`, `%PDF`, same
   content as the S4 direct check (Supplier Voucher Packet / TEST Hotel Supplier A /
   BK-2026-0002 / HOTEL / QA Hotel Service; no PII/finance).
4. Confirm **no mutation** — packet stays `GENERATED`; no `downloadedAt` / status / audit
   change.
5. Confirm **prod fail-closed** — backend flag unset → no `existingPacketId`, PDF endpoint
   403s, panel hidden.
6. Allowlist untouched (`ziad@axisdmc.com`); supplier send disabled.

## 10. Tests
- **admin-web render** (`voucher-packets-panel`): group with `existingPacketId` → "Download
  PDF" link with the correct proxy href; **no Send / send-preview / email** controls; group
  without a packet → no download link; flag OFF → panel hidden.
- **Proxy source-grep**: GET-only; targets `…/voucher-packets/:packetId/pdf`; forwards
  `Authorization`; streams `application/pdf`; no redirect / formData / mutation.
- **Backend enrichment**: read-only (no create/update/delete); `@Roles`; backend-flag-gated
  (no packet id when OFF); DTO PII/finance-free.

## 11. Risks
1. **Group↔packet association** relies on a stable `groupingKey`; keep the key format stable.
2. **Binary proxy** must stream bytes with correct headers (the one non-JSON proxy) — mirror
   the single-service voucher PDF proxy.
3. **Visible-but-403** — mitigated by gating `existingPacketId` on the backend flag (§7).
4. **PII/finance** — the enriched DTO stays identity-only.
5. **Prod safety** — no env change in S5; both flags stay off in prod (fail-closed).

## 12. What stays post-launch (out of S5)
- **Send** and **send-preview** (packet email) — separate slice + own flag; backend
  `OPS_V2_VOUCHER_SEND_ENABLED` (currently `false` in prod).
- **Stale detection / regenerate** — compare `contentHash` vs live services; re-snapshot.
- **Delete / discard** — packet removal.
- **Lifecycle status tracking** — `PREVIEWED` / `DOWNLOADED` / `SENT` transitions and audit
  (S5 does none of these).
- **Inline View / Preview** — deferred.

---

**Bottom line:** S5 is a **read-only** admin-web PDF **proxy** + a **"Download PDF"**
affordance on the existing Supplier Packets panel for generated packets, bridged by a
**read-only** `existingPacketId` / `packetStatus` enrichment of the groups endpoint — gated
by `NEXT_PUBLIC_OPS_V2_VOUCHER_PACKET` (UI) and `OPS_V2_VOUCHER_PACKET_ENABLED` (backend,
fail-closed). **No mutation, no status change, no DOWNLOADED tracking, no audit, no send, no
inline preview.** Production remains fail-closed.
