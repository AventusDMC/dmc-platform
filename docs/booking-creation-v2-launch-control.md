# Booking Creation V2 — Slice 1F: Role / Error / Launch-Control Hardening

**Date:** 2026-07-03
**Status:** Verification + launch-control reference. No flags enabled. No code behavior changed.
**Scope:** the end-to-end V2 "Create booking" path — Quote Builder V2 card → `POST /api/quotes/:id/v2/booking` (admin-web proxy) → backend `POST /quotes/:id/v2/booking` → `QuotesService.convertToBooking`.

This document is the **pre-enablement safety review** and the **exact enable / rollback runbook**. Everything below reflects code already merged and covered by tests; nothing here enables a flag.

---

## 1. Role behavior (end-to-end)

**Backend (authoritative).** `POST /quotes/:quoteId/v2/booking` is decorated `@Roles('admin', 'operations')`. The shared `RolesGuard` (`roleAllows`) grants access when:
- the actor's role is directly listed (`admin` or `operations`), OR
- the actor is `super_admin` (always allowed), OR
- the actor is `agent_admin` and `admin` is in the required set.

**Frontend (affordance gate only).** `page.tsx` shows the Create-booking card only when
`NEXT_PUBLIC_QUOTE_BOOKING_CREATE === 'true'` AND `hasRequiredRole(role, ["admin","operations"])` AND `statusCode ∈ {ACCEPTED, CONFIRMED}`. `hasRequiredRole` applies the same `super_admin`/`agent_admin` rules as the backend guard, so the UI gate mirrors the backend as closely as the FE can.

**Effective access matrix:**

| Role | Backend route | FE card |
|---|---|---|
| `admin` | ✅ | ✅ |
| `operations` | ✅ | ✅ |
| `super_admin` | ✅ (override) | ✅ (override) |
| `agent_admin` | ✅ (≈admin) | ✅ (≈admin) |
| `viewer` | ❌ | ❌ |
| `finance` | ❌ | ❌ |
| `agent` | ❌ | ❌ |

**No `viewer`, no `finance`.** This is intentionally narrower than the Classic `convert-to-booking` endpoint (`admin,viewer,finance`); the V2 route is scoped to the operational audience. Even if the FE gate were bypassed, the backend rejects non-allowed roles with `403`.

**Test coverage:** `quote-booking-v2.service.test.ts` asserts the route metadata is exactly `['admin','operations']`; `builder-v2-create-booking.test.ts` asserts the FE gate uses `hasRequiredRole(role, ["admin","operations"])`.

---

## 2. Error handling (end-to-end)

All backend errors are typed `BadRequestException({ code, message })`. The proxy forwards the backend status + JSON verbatim; the card maps each code to fixed, friendly copy (never echoing raw internals for known codes).

| Code | Cause | HTTP | Card copy |
|---|---|---|---|
| `feature_disabled` | backend `QUOTE_BOOKING_CREATE` OFF | 400 | "Booking creation isn't enabled in this environment yet." |
| `quote_not_convertible` | status not ACCEPTED/CONFIRMED (or CANCELLED) | 400 | "This quote can't be converted yet — it must be Accepted or Confirmed first." |
| `missing_accepted_version` | no `acceptedVersionId` | 400 | "This quote has no accepted version to convert. Accept the quote first." |
| `booking_exists` | duplicate race with no re-findable booking | 400 | "A booking already exists for this quote." |
| `conversion_failed` | unexpected engine error (wrapped) | 400 | "Booking creation failed. Please try again, or use the Classic builder." |
| — (`alreadyExisted: true`) | duplicate resolved idempotently | 200 | "Booking already exists" + **Open booking** |
| network / proxy failure | fetch throws / non-JSON | — | "Couldn't reach the server. Please try again." |
| success | booking created | 200 | "Booking created" + `bookingRef` + **Open in Operations V2** |

**Fail-closed:** with the backend flag OFF, every attempt returns `feature_disabled` and writes nothing — so a mistakenly-enabled FE flag cannot create bookings. The backend flag is the true gate.

**Test coverage:** backend service test covers all five codes + the idempotent duplicate path; FE test asserts the card handles every code + the success/already-exists CTAs + the network fallback.

---

## 3. Audit behavior

Two independent, best-effort audit writes on a successful conversion:
- **Core** `booking.created` (entity `booking`), metadata `{ quoteId, bookingRef }` — emitted by `convertToBooking`.
- **V2 marker** `quote.booking.created` (entity `booking`), metadata `{ quoteId, bookingId, bookingRef, source: 'quote_builder_v2' }` — emitted by the V2 service.

**Safety guarantees:**
- **Sanitized metadata only** — ids + a booking reference + a source tag. No raw request/response JSON, no PII (no passenger/passport/contact fields), no supplier email address or email body (conversion sends no email at all).
- **Never blocks** — an audit failure is caught and logged (`console.warn`), the conversion still succeeds.

**Test coverage:** `quote-booking-v2.service.test.ts` asserts the marker's metadata keys are exactly `{bookingId, bookingRef, quoteId, source}`, that `source === 'quote_builder_v2'`, that no key matches a PII/secret pattern, and that a throwing audit does not block the conversion.

---

## 4. Launch-control checklist

### Current flag state (both OFF — verified)
| Flag | Where | Default | Effect when OFF |
|---|---|---|---|
| `QUOTE_BOOKING_CREATE` (`quote.bookingCreate`) | Backend API (Railway), **runtime** env | OFF | route returns `feature_disabled`, writes nothing |
| `NEXT_PUBLIC_QUOTE_BOOKING_CREATE` | admin-web (Vercel), **build-time** env | OFF | Create-booking card never renders |

Both are read-only in code (`=== 'true'`); neither is defaulted on.

### Interaction (safe in every combination)
- **Both OFF** (today): no UI, route inert.
- **Backend ON, FE OFF:** route live but no trigger surfaced — safe for API-level validation.
- **FE ON, Backend OFF:** card shows but every attempt returns `feature_disabled` — safe (fails closed).
- **Both ON:** end-to-end path live for admin/operations on ACCEPTED/CONFIRMED quotes.

### Exact enablement steps (staged, recommended order)
1. **Pre-req (per pilot quote):** run the Slice 1B pilot supplier-data checklist (`docs/booking-creation-v2-slice-1b-verification.md` §3) — supplierIds resolve, categories map, accepted version present.
2. **Backend first** (kill-switch stays with the runtime flag): on the Railway **API** service, set `QUOTE_BOOKING_CREATE=true`, then restart/redeploy the API. Verify the route no longer returns `feature_disabled` (e.g. via a controlled test quote).
3. **Frontend second:** on the production Vercel admin-web project, set `NEXT_PUBLIC_QUOTE_BOOKING_CREATE=true`, then **trigger a fresh build/redeploy** (NEXT_PUBLIC_* is inlined at build time — an env change alone does nothing until rebuilt).
4. Confirm the card appears for an admin/operations user on an ACCEPTED/CONFIRMED quote, and that a controlled conversion returns a `bookingRef` + working "Open in Operations V2" link.

### Exact rollback steps
- **Fastest kill (instant, no rebuild):** on Railway API, set `QUOTE_BOOKING_CREATE=false` (or remove it) and restart. Conversion is disabled immediately; any still-visible card returns `feature_disabled`. **This is the primary rollback lever.**
- **Full UI rollback:** on Vercel admin-web, set `NEXT_PUBLIC_QUOTE_BOOKING_CREATE=false` (or remove it) and redeploy (rebuild) to hide the card.
- No database change or migration is involved in either direction; bookings already created are unaffected (roll forward only).

### Supplier email allowlist
- **No change required for this slice.** Conversion creates database rows only — it sends **no** supplier email, so the voucher-send allowlist (`OPS_V2_VOUCHER_SEND_RECIPIENT_ALLOWLIST`) is irrelevant to Create Booking and must **not** be modified here.

---

## 5. Residual risks (carried, not blocking)
- **Unresolved supplier** → booking still created; row arrives `UNASSIGNED` (Ops "Needs Assignment"). Mitigated by the §4 pre-req data check. Not a conversion blocker.
- **Finance read-only snapshot (Slice 1E, pending):** the pricing snapshot is populated and verified (Slice 1B), but the Operations V2 finance surface wiring for the converted booking is the remaining finishing slice. Does not affect conversion safety.

---

## 6. Sign-off summary
- Roles: admin + operations (+ super_admin/agent_admin overrides); no viewer/finance — **verified, tested**.
- Errors: all typed codes + idempotent duplicate + network fallback — **verified, tested**.
- Audit: sanitized, non-blocking, no PII/email — **verified, tested**.
- Flags: both default OFF, fail-closed; enable/rollback runbook above — **documented**.
- No supplier email/allowlist, schema, Classic, passenger/rooming, finance-accounting, or voucher-packet changes in this slice.
