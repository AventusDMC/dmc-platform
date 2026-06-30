# Booking Operations V2 — Operations Command Center
## v0 Design Brief (design-first, read-only command-center)

**Date:** 2026-06-29
**Status:** Discovery complete — design-only. No code, no schema, no backend, no PR.
**Author:** Ops/quoting platform audit
**Scope of v0 round 1:** Read-only command center. No supplier emails, no voucher send, no finance mutation, no live edits. Classic stays the system of record and the obvious fallback.

---

## 0. TL;DR

The platform already has a **mature operations backend and a working (but bespoke-CSS) Classic operations grid**. The data model is richer than the current UI exposes — `BookingService` carries a full operational lifecycle (assignment → confirmation → voucher → dispatch → execution → issue), there is an append-only `DispatchEvent` stream, and granular supplier-confirmation / assignment / execution enums.

**Booking Operations V2** is a redesign that:
1. Adds a **cross-booking Operations Command Center** (does not exist today — Classic is per-booking only).
2. Re-skins the per-booking operations workspace in the **Quote Builder V2 visual language** (scoped Tailwind + shadcn, brand `#1F9ACF`).
3. Ships **read-only first** — every mutating affordance is rendered as disabled "Coming later," and a prominent "Open in Classic" fallback is always one click away.

This document is the brief + the literal v0 prompt to paste.

---

## 1. Product Brief (for v0)

### 1.1 Who uses it
Operations / DMC coordinators running confirmed trips in Jordan + UAE. Their day is: chase supplier confirmations, assign guides/drivers/vehicles, set pickup times, finalize rooming and passenger manifests, generate vouchers, and watch today's departures for problems.

### 1.2 The problem
Today operations lives across an 8-tab booking detail page and a separate per-booking operations grid. There is **no single screen that answers "what across all my live trips needs attention right now?"** Coordinators open bookings one by one. The UI is functional but bespoke and dense.

### 1.3 What V2 is (round 1)
A **read-only Operations Command Center**: a calm, scannable, status-first surface that aggregates operational health across all live bookings and lets a coordinator drill into a single booking's operational state — without being able to change anything yet. It is a **viewer and a triage tool**, not (yet) an editor.

### 1.4 Why read-only first
The risky actions in this domain send real outbound email and move money (supplier confirmation emails, voucher delivery, invoice send, payment reminders, mark-paid → client email). We are deliberately shipping the *information architecture and visual system* first, validating it against real bookings, then layering safe edits behind flags later — exactly the pattern Quote Builder V2 followed (read-only Phase A → preview → gated apply).

### 1.5 Non-goals for round 1
- No sending supplier confirmation emails.
- No generating or sending vouchers.
- No creating/editing/sending invoices or payments; no "mark paid."
- No editing passengers, rooming, services, pickup times, or assignments.
- No status transitions (confirm/cancel/complete).
- No replacing Classic — Classic remains default and the fallback for every action.

### 1.6 Success criteria for the design
- A coordinator can answer "where are my risks today?" in <5 seconds from the home screen.
- Every operational state from the data model has a clear, consistent visual treatment.
- The disabled/"Coming later" actions make the *future* workflow legible without implying it works now.
- Visually indistinguishable-in-quality from Quote Builder V2; sits inside the same app chrome.

---

## 2. Current-state audit (grounding facts)

### 2.1 Existing routes (Classic)
| Route | Purpose |
|---|---|
| `/bookings` | List / execution queue (Total, Confirmed/Live, Draft) |
| `/bookings/[id]` | 8-tab detail: Overview, Itinerary, Passengers, Rooming, Services(Operations), Documents, Financials, Audit |
| `/bookings/[id]/operations` | **Per-booking operations grid** — action center + 5 phases + per-service rows |
| `/bookings/[id]/operations/[operationId]/voucher` | Service voucher view/print |
| `/bookings/[id]/voucher`, `/supplier-confirmation` | Document pages |
| `/operations`, `/operations/dispatch` | Operations dashboard + dispatch (backend `GET /operations/dashboard`, `/operations/dispatch`, `/operations/mobile-data`) |
| `/executive/operations`, `/vouchers` | Executive ops view, voucher index |

### 2.2 Existing per-booking operations grid (the thing V2 modernizes)
Already implements, in bespoke CSS:
- **Operational Action Center**: readiness %, 6 action cards (suppliers unassigned, confirmations pending, confirmations rejected, vouchers pending, manifest incomplete, rooming incomplete) with INFO / ACTION REQUIRED / CRITICAL severity.
- **5 phases**: Critical Issues → Needs Assignment → Needs Confirmation → Ready for Voucher → Operationally Ready.
- **Per-service rows**: type pill, supplier, confirmation status, voucher status, readiness badge, reason list, quick actions, details disclosure with type-specific editors (TRANSPORT vehicle/driver, HOTEL, ACTIVITY, GUIDE, TICKET/SERVICE).
- **Passenger manifest card**: complete/incomplete, received/expected.

V2 round 1 = **the same information, restyled and read-only**, plus the new cross-booking layer above it.

### 2.3 Styling reality
- Main admin app = **bespoke CSS** (`globals.css` + `globals-02..06`, 27k-line system, fragmented `:root` tokens). No Tailwind, no component library.
- **Quote Builder V2 = the exception and the template to copy**: route-scoped Tailwind + shadcn/ui at `/quotes/[id]/builder-v2`, preflight disabled so it doesn't reset app chrome.
- V2 renders **inside** the existing app sidebar/topbar (it does not draw its own global chrome).

---

## 3. Data model (what the cards/tables bind to)

> Source: `apps/api/prisma/schema.prisma`. Read-only screens consume these; no field is mutated in round 1.

### 3.1 Booking (root)
`id, bookingRef, status, bookingType, quoteId, acceptedVersionId, clientCompanyId, amendmentNumber, startDate, endDate, adults, children, pax, roomCount, nightCount, clientInvoiceStatus, supplierPaymentStatus, statusNote, accessToken`
- `BookingStatus`: **draft | confirmed | in_progress | completed | cancelled**
- `BookingType`: **FIT | GROUP | SERIES**
- `ClientInvoiceStatus`: **unbilled | invoiced | paid**
- `SupplierPaymentStatus`: **unpaid | scheduled | paid**
- Relations: `days[]`, `services[]`, `passengers[]`, `payments[]`, `roomingEntries[]`, `vouchers[]`, `auditLogs[]`, `dispatchEvents[]`, `quote`, `acceptedVersion`, `seriesDeparture?`

### 3.2 BookingService (the operational unit — richest entity)
- Identity: `serviceType` (TRANSPORT|GUIDE|HOTEL|ACTIVITY|SERVICE|TICKET|DINING|EXTERNAL_PACKAGE), `operationType`, `description`, `serviceOrder`, `serviceDate`, `bookingDayId`, `sourceQuoteItemId`
- Lifecycle/status (multiple parallel axes):
  - `operationStatus` (string): PENDING | REQUESTED | CONFIRMED | REJECTED | VOUCHER_SENT | OPERATIONAL_READY | COMPLETED
  - `executionStatus`: READY | DISPATCHED | IN_PROGRESS | COMPLETED | ISSUE | CANCELLED
  - `status` (lifecycle): pending | ready | in_progress | confirmed | cancelled
  - `confirmationStatus`: pending | requested | confirmed
- Supplier confirmation: `supplierConfirmationStatus` (NOT_SENT | REQUESTED | SENT | ACKNOWLEDGED | CONFIRMED | REJECTED | CANCELLED), `supplierConfirmationCode`, `confirmationReference`, `confirmationReceivedAt`, `confirmationDeadline`, `reconfirmationRequired`, `reconfirmationDueAt`, `lastSupplierContactAt`, `supplierRemarks`
- Supplier assignment: `supplierId`, `assignedSupplierId`, `assignmentStatus` (UNASSIGNED | ASSIGNED | REQUESTED | CONFIRMED | REJECTED), `assignedAt`, `assignmentNotes`
- Transport: `vehicleId`, `assignedVehicleId`, `driverId`, `startTime`, `pickupTime`, `pickupLocation`, `meetingPoint`, `dropoffLocation`
- Guide: `guideId`, `assignedGuideId`, `guideConfirmationStatus`, `guideRequiredLanguages[]`, `guideReportingTime`, `guidePhone`
- Hotel/meal: `nights`, `mealPlan` (RO|BB|HB|FB|AI), `restaurantId`, `mealConfirmationStatus`, `mealDietaryRequirements[]`, `specialRequests`
- Execution: `dispatchedAt`, `startedAt`, `completedAt`, `completedBy`, `delayMinutes`
- Issue: `issueReportedAt`, `issueType` (DRIVER_DELAY | SUPPLIER_NO_SHOW | FLIGHT_DELAY | ROOM_PROBLEM | GUEST_MISSING | OVERBOOKING | GUIDE_LATE | OTHER), `issueSeverity` (LOW|MEDIUM|HIGH|CRITICAL), `issueNotes`
- Voucher: `voucherStatus` (NOT_GENERATED | GENERATED | SENT | CANCELLED), `voucherGeneratedAt`
- Pricing (internal — **hide on client-safe views**): `unitCost`, `unitSell`, `totalCost`, `totalSell`, `supplierPayableAmount`, `supplierPayableStatus`
- Participants: `participantCount`, `adultCount`, `childCount`

### 3.3 BookingPassenger
`firstName, lastName, fullName, title, gender, dateOfBirth, nationality, passportNumber, passportIssueDate, passportExpiryDate, arrivalFlight, departureFlight, entryPoint, visaStatus, emergencyContactName/Phone, dietaryNotes, roomingNotes, hotelCategoryVariant, isLead, notes` → `roomingAssignments[]`

### 3.4 Rooming
- `BookingRoomingEntry`: `roomType, occupancy` (single|double|triple|quad|unknown), `sortOrder, notes` → `assignments[]`
- `BookingRoomingAssignment`: join `bookingRoomingEntryId` ↔ `bookingPassengerId`

### 3.5 Voucher
`type` (TRANSPORT|EXCURSION|HOTEL|GUIDE|ACTIVITY|EXTERNAL_PACKAGE|TICKET|SERVICE|RESTAURANT), `status` (DRAFT|READY|SENT|ISSUED|CANCELLED|GENERATED), `supplierId, issuedAt, generatedAt, generatedBy, sentAt, snapshotJson, notes` (one per `bookingServiceId`)

### 3.6 Payment (finance)
`type` (CLIENT|SUPPLIER), `amount, currency, status` (PENDING|PAID), `method` (bank|cash|card|bank_transfer|cliq|mb_way|credit_card|custom_manual), `reference, dueDate, paidAt, notes`. Booking-level rollups: `clientInvoiceStatus`, `supplierPaymentStatus`.

### 3.7 History / live event streams
- `BookingAuditLog`: `entityType` (booking|booking_service), `action`, `oldValue, newValue, note, actor, actorUserId, createdAt`
- `DispatchEvent` (append-only): `eventType` (SIMULATION_SCENARIO_APPLIED | ISSUE_RAISED | ISSUE_ESCALATED | ISSUE_RESOLVED | DISPATCHED | STARTED | COMPLETED | CANCELLED | DELAYED | REASSIGNED_SUPPLIER/DRIVER/VEHICLE/GUIDE | NOTE_ADDED), `severity` (INFO|WARNING|CRITICAL), `occurredAt, actor, payload, notes`

### 3.8 Catalog refs (for assignment displays — read-only)
`Supplier` (name, email), `Guide` (fullName, languages[], certifications[], regions[], phone, guideType), `Driver` (fullName, phone, languages[]), `Vehicle`, `Activity`, `Hotel`, `Restaurant`.

---

## 4. Action inventory & risk (drives "what's disabled")

> Source: `apps/api/src/bookings/*`. Round 1 surfaces **SAFE-READ only**; everything else is shown disabled / "Coming later."

### SAFE-READ (allowed to display; no mutation, no email)
- `GET /bookings`, `GET /bookings/:id`
- `GET /bookings/:id/operations-grid`
- `GET /bookings/operations/supplier-confirmations`
- `GET /operations/dashboard`, `/operations/dispatch`, `/operations/mobile-data`
- `GET /bookings/:id/supplier-confirmation/preview` (read-only draft; **does not send**)
- PDF downloads + manifest Excel export (voucher, invoice, guarantee letter, financial docs, passengers/export)

> **Round-1 decision:** even safe PDF *downloads* are presented as disabled "Coming later" so the first screen is purely a viewer with zero outbound artifacts. (They can be flipped on trivially in a later round since they're already safe.)

### LOW-RISK MUTATION (deferred — show disabled)
Passenger CRUD; rooming CRUD + auto-assign; service operational edits (pickup time, meeting point, participant count); supplier **assignment**; confirmation **status** field updates; guide/restaurant assignment; execution lifecycle (dispatch/start/complete/issue); voucher **record** create + status; booking status/amend/cancel; finance status field (`PATCH /finance`); payment create/update.

### HIGH-RISK MUTATION (deferred — show disabled, never wired in round 1)
- `POST /bookings/:id/supplier-confirmation/send` → **sends supplier email** + flips status to REQUESTED
- `POST /bookings/send-document-email` → emails voucher / confirmation PDF
- `POST /bookings/:id/invoice/send`, `POST /invoices/:id/send`, `/send-reminder` → **invoice emails**
- `POST /bookings/:id/payments/reminder` → **payment reminder email**
- `POST /bookings/:id/payments/:paymentId/mark-paid` → **marks paid + emails client**
- `POST /bookings/reconciliation/payment-proofs/confirm | remind` → **batch emails**

**Auth note:** endpoints are role-gated (admin/operations/finance/viewer) and company-scoped; **no feature flags exist on operations endpoints today** (unlike quotes). V2 should introduce its own build-time flags (see §11).

---

## 5. Suggested screens

> All read-only in round 1. Two levels: **fleet (cross-booking)** and **booking (single)**, plus three focused queues.

### Screen 1 — Operations Command Center (home / fleet) ⭐ the "first screen"
The new capability. Answers "what needs attention across all live trips?"
- **KPI stat row** (7 cards): Live trips (in_progress), Arrivals today, Pending supplier confirmations, Unassigned services, Rejected confirmations, Vouchers pending, Open issues. Each card = count + delta/severity tint, clicking scrolls/links to the relevant queue.
- **"Today & next 7 days" rail**: compact day columns; each shows count of services dispatching, arrivals/departures, guide/driver coverage gaps. Read-only.
- **Needs-attention queue**: table of live/upcoming bookings sorted by operational risk. Columns: bookingRef, client, dates, pax, readiness %, top blocker (chips), invoice/payment status. Row → Screen 2.
- **Right sidebar** (mirrors Quote V2 summary sidebar): overall fleet readiness %, blocking-items list, "next required action" card (read-only, points at a booking).

### Screen 2 — Booking Operations Workspace (single booking, read-only)
Modern restyle of the existing operations grid + the relevant detail tabs.
- **Header**: breadcrumb (Operations › {client} › {bookingRef}), title, **status pill**, V2 Beta tag, dates, pax, "Saved/Updated" stamp. Top-right: **"Open in Classic"** (always present) + disabled "Mark as Sent"-equivalents.
- **Sub-tabs** (read-only): **Operations** (default) · Passengers & Rooming · Finance · Documents · Activity.
  - **Operations tab** = the 5-phase board: Critical Issues / Needs Assignment / Needs Confirmation / Ready for Voucher / Operationally Ready. Per-service rows show type icon, description, day, supplier, confirmation badge, voucher badge, execution badge, reason chips. Row actions all disabled ("Assign supplier — Coming later", etc.).
  - **Passengers & Rooming** = read-only manifest table + rooming map (rooms with occupancy validity badges).
  - **Finance** = read-only summary (quoted vs realized, margin, client invoice status, supplier payment status, payment list). No mark-paid / send.
  - **Documents** = list of available documents with disabled download/send ("Coming later").
  - **Activity** = merged `BookingAuditLog` + `DispatchEvent` timeline (this is rich, genuinely read-only, high-value).
- **Right sidebar**: readiness %, blocking items, operational counts (suppliers/confirmations/vouchers/rooming/manifest), Classic deep-link.

### Screen 3 — Supplier Confirmation Tracker (cross-booking queue)
List of services across bookings grouped by `supplierConfirmationStatus` (NOT_SENT → REQUESTED → CONFIRMED, plus REJECTED lane). Filter by supplier, deadline, reconfirmation-due. Shows confirmation deadlines and overdue tints. Read-only; "Request confirmation" disabled.

### Screen 4 — Dispatch / Day View (today's operations)
Timeline of today's (and selectable date's) services: pickup times, meeting points, assigned guide/driver/vehicle, coverage gaps highlighted. Mirrors `GET /operations/dispatch`. Read-only.

### Screen 5 — Live Issues board (optional 5th)
Cards from `DispatchEvent` ISSUE_* + `BookingService.issue*` fields, grouped by severity (CRITICAL/HIGH/MEDIUM/LOW), each linking to its booking. Read-only.

**Round-1 priority for v0:** build **Screen 1 + Screen 2** fully; stub Screens 3–5 as secondary nav targets with the same components.

---

## 6. Component list (shadcn-based, mirrors Quote V2)

Reuse Quote V2 primitives where possible (`Card`, `Button`, `Progress`, `StatusBadge`, `ContractBadge`, `StatusPill`, summary sidebar shell, step-header).

**New shared components**
- `OpsStatPill` / `OpsStatCard` — KPI card: label, value, icon (lucide), severity tint (info/warning/critical), optional sublabel.
- `ReadinessMeter` — % + `Progress` bar (reuse Quote V2 sidebar treatment).
- `OperationalStatusBadge` — one badge component, variant-mapped over every status axis (see §7 mapping). Variants: neutral / info / pending / warning / success / critical.
- `ServiceTypeIcon` — maps serviceType → lucide icon (Bus, Building2, UserRound/guide, Ticket, Utensils, Package).
- `PhaseColumn` / `PhaseSection` — header (title, count, severity) + list of service rows.
- `ServiceRow` — type icon, description, day chip, supplier, confirmation badge, voucher badge, execution badge, reason chips, **disabled action cluster**.
- `DisabledAction` — button rendered disabled with a "Coming later" tooltip (shared so the pattern is consistent and unmissable).
- `ComingLaterTag` — small inline pill used on tabs/cards that are placeholders.
- `OpenInClassicButton` — outline button with ExternalLink icon, always visible (fallback).
- `ActivityTimeline` — merged audit + dispatch event feed: actor, action, old→new, timestamp, severity dot.
- `ManifestTable` — read-only passenger table (lead star, passport, flight, dietary).
- `RoomingMap` — rooms with occupancy validity badge (Valid / Mismatch / Needs occupancy).
- `FinanceSummaryCard` — quoted vs realized, margin %, invoice/payment status badges (read-only).
- `AttentionQueueTable` — fleet table, risk-sorted, with blocker chips.
- `DayDispatchColumn` — compact day column for the 7-day rail.
- `FleetSidebar` — adapts Quote V2 `QuoteSummarySidebar` to fleet/booking ops counts.
- `BookingOpsHeader` — adapts Quote V2 `QuoteBuilderShell` header (breadcrumb, status pill, V2 Beta tag, Classic + disabled actions).
- `EmptyState` — eyebrow/title/description (reuse pattern).

---

## 7. Status → visual mapping (single source of truth for v0)

Use one badge component with these variants (colors from Quote V2 tokens):

| Variant | Token | Use for |
|---|---|---|
| success (green) | `success` `#16A34A` | CONFIRMED, COMPLETED, paid, Operationally Ready, Valid rooming, voucher ISSUED/SENT |
| warning (amber) | `warning` `#D97706` | REQUESTED/pending, Needs Confirmation, scheduled, reconfirmation-due, manifest incomplete, voucher GENERATED-not-sent |
| critical (red) | `destructive` `#DC2626` | REJECTED, ISSUE, CANCELLED, overdue, Critical Issues, unpaid+overdue |
| info (brand) | `primary` `#1F9ACF` | DISPATCHED, IN_PROGRESS, invoiced, informational |
| neutral (muted) | `muted` | NOT_SENT, UNASSIGNED, draft, NOT_GENERATED, Needs Assignment |

Severity for action cards / issues: INFO → muted/brand, ACTION REQUIRED/WARNING → amber, CRITICAL → red.

---

## 8. Required tables & cards (per screen)

**Command Center**
- Cards: 7× `OpsStatCard`; `FleetSidebar` (readiness, blocking items, next action); 7× `DayDispatchColumn`.
- Table: `AttentionQueueTable` (bookingRef, client, dates, pax, readiness %, blocker chips, invoice/payment badges).

**Booking Workspace**
- Header card (`BookingOpsHeader`).
- Operations: 5× `PhaseSection` each with N `ServiceRow`; passenger manifest card.
- Passengers & Rooming: `ManifestTable` + `RoomingMap`.
- Finance: `FinanceSummaryCard` + read-only payments table.
- Documents: documents list (disabled actions).
- Activity: `ActivityTimeline`.
- Sidebar: `FleetSidebar` (booking-scoped counts).

**Supplier Confirmation Tracker**: grouped queue table (4 lanes) + filter bar.
**Dispatch/Day View**: day picker + timeline rows.
**Issues**: severity-grouped issue cards.

---

## 9. Design style guidance (match Quote Builder V2 exactly)

> Source tokens: `apps/admin-web/app/quotes/[id]/builder-v2/builder-v2.css`. Components: `apps/admin-web/components/quote/v2/*`.

- **Framework**: route-scoped **Tailwind + shadcn/ui**, Tailwind preflight **disabled** (don't reset app chrome). Render inside the existing app sidebar/topbar — **no full-screen `h-screen` shell, no second global nav**.
- **Brand / tokens** (channel-RGB so opacity modifiers work):
  - `--primary: 31 154 207` (`#1F9ACF`), `--primary-foreground: 255 255 255`
  - `--card: 255 255 255`, `--card-foreground: #111827`
  - `--secondary: #F3F4F6`, `--input: #E5E7EB`, `--ring: #1F9ACF`, `--radius: 0.5rem`
  - Status: `--success #16A34A`, `--warning #D97706`, `--destructive #DC2626`
  - Sidebar (dark chrome): `--sidebar #111827`, `--sidebar-foreground #E5E7EB`, `--sidebar-accent #1F2937`
- **Type**: `font-heading` for titles (semibold, tracking-tight, `text-xl`/`2xl`/`3xl`); body via app font (Inter). Eyebrows = `text-xs font-medium uppercase tracking-wide text-muted-foreground`.
- **Cards**: `Card` with `p-5`, subtle border, rounded `--radius`; section heading `font-heading text-sm font-semibold`.
- **Badges/pills**: `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium` with `bg-{token}/10 text-{token} border-{token}/20`; leading lucide icon or `size-1.5 rounded-full bg-current` dot.
- **Buttons**: shadcn `Button` (`size="sm"`, `variant="outline"` for secondary). Disabled "Coming later" buttons keep full styling but `disabled` + `aria-disabled` + tooltip.
- **Icons**: `lucide-react` (Building2, Bus, Ticket, UserRound, Utensils, Package, AlertTriangle, CheckCircle2, CircleDashed, Clock, Send, Eye, ExternalLink, ArrowRight, ChevronRight).
- **Layout**: 2-column on desktop — main content + sticky right summary sidebar (`space-y-4` cards), like Quote V2.
- **Header pattern**: breadcrumb → title + `V2 Beta` tag + StatusPill + saved stamp; right side actions (Open in Classic + disabled primary).
- **Voice**: calm, operational, status-first. Plenty of whitespace; dense data but never cramped.

---

## 10. Dummy data (paste into v0)

```json
{
  "fleet": {
    "readiness": 72,
    "kpis": [
      { "key": "live", "label": "Live trips", "value": 6, "severity": "info" },
      { "key": "arrivals_today", "label": "Arrivals today", "value": 2, "severity": "info" },
      { "key": "conf_pending", "label": "Confirmations pending", "value": 11, "severity": "warning" },
      { "key": "unassigned", "label": "Unassigned services", "value": 4, "severity": "warning" },
      { "key": "conf_rejected", "label": "Confirmations rejected", "value": 1, "severity": "critical" },
      { "key": "vouchers_pending", "label": "Vouchers pending", "value": 7, "severity": "warning" },
      { "key": "issues_open", "label": "Open issues", "value": 1, "severity": "critical" }
    ],
    "attention": [
      { "bookingRef": "BK-2026-0142", "client": "Anderson Family", "type": "FIT", "start": "2026-07-02", "end": "2026-07-09", "pax": 4, "readiness": 58, "status": "in_progress", "blockers": ["1 confirmation rejected", "2 vouchers pending"], "clientInvoiceStatus": "invoiced", "supplierPaymentStatus": "unpaid" },
      { "bookingRef": "BK-2026-0137", "client": "Meridian Travel (Group)", "type": "GROUP", "start": "2026-07-01", "end": "2026-07-12", "pax": 22, "readiness": 64, "status": "confirmed", "blockers": ["3 suppliers unassigned", "rooming incomplete"], "clientInvoiceStatus": "unbilled", "supplierPaymentStatus": "unpaid" },
      { "bookingRef": "BK-2026-0151", "client": "Okonkwo Honeymoon", "type": "FIT", "start": "2026-07-05", "end": "2026-07-11", "pax": 2, "readiness": 88, "status": "confirmed", "blockers": ["1 guide unconfirmed"], "clientInvoiceStatus": "paid", "supplierPaymentStatus": "scheduled" }
    ],
    "week": [
      { "date": "2026-06-29", "label": "Sun", "dispatching": 3, "arrivals": 1, "departures": 0, "coverageGap": false },
      { "date": "2026-06-30", "label": "Mon", "dispatching": 5, "arrivals": 0, "departures": 1, "coverageGap": true },
      { "date": "2026-07-01", "label": "Tue", "dispatching": 8, "arrivals": 2, "departures": 0, "coverageGap": false },
      { "date": "2026-07-02", "label": "Wed", "dispatching": 6, "arrivals": 1, "departures": 0, "coverageGap": false },
      { "date": "2026-07-03", "label": "Thu", "dispatching": 4, "arrivals": 0, "departures": 2, "coverageGap": false },
      { "date": "2026-07-04", "label": "Fri", "dispatching": 7, "arrivals": 0, "departures": 0, "coverageGap": true },
      { "date": "2026-07-05", "label": "Sat", "dispatching": 5, "arrivals": 1, "departures": 1, "coverageGap": false }
    ]
  },
  "booking": {
    "bookingRef": "BK-2026-0142",
    "client": "Anderson Family",
    "type": "FIT",
    "status": "in_progress",
    "start": "2026-07-02",
    "end": "2026-07-09",
    "adults": 2, "children": 2, "pax": 4, "roomCount": 2, "nightCount": 7,
    "readiness": 58,
    "clientInvoiceStatus": "invoiced",
    "supplierPaymentStatus": "unpaid",
    "phases": {
      "critical": [
        { "id": "s1", "serviceType": "ACTIVITY", "description": "Petra by Night entrance", "day": "Day 3 · Jul 4", "supplier": "Petra Visitor Center", "confirmation": "REJECTED", "voucher": "NOT_GENERATED", "execution": "READY", "reasons": ["Supplier rejected — re-source required"] }
      ],
      "needsAssignment": [
        { "id": "s2", "serviceType": "TRANSPORT", "description": "Amman → Petra transfer (Van)", "day": "Day 3 · Jul 4", "supplier": null, "confirmation": "NOT_SENT", "voucher": "NOT_GENERATED", "execution": "READY", "reasons": ["No supplier assigned"] }
      ],
      "needsConfirmation": [
        { "id": "s3", "serviceType": "GUIDE", "description": "Licensed guide — Petra (EN)", "day": "Day 3 · Jul 4", "supplier": "Almushtari Guides", "confirmation": "REQUESTED", "voucher": "NOT_GENERATED", "execution": "READY", "reasons": ["Awaiting supplier confirmation · due Jun 30"] },
        { "id": "s4", "serviceType": "HOTEL", "description": "Mövenpick Petra · 2 nights · HB", "day": "Day 3 · Jul 4", "supplier": "Mövenpick Resort Petra", "confirmation": "REQUESTED", "voucher": "NOT_GENERATED", "execution": "READY", "reasons": ["Reconfirmation due Jul 1"] }
      ],
      "readyForVoucher": [
        { "id": "s5", "serviceType": "TRANSPORT", "description": "QAIA → Amman arrival transfer (Sedan)", "day": "Day 1 · Jul 2", "supplier": "Alpha Transport", "confirmation": "CONFIRMED", "voucher": "NOT_GENERATED", "execution": "READY", "reasons": ["Confirmed — voucher not yet generated"] }
      ],
      "operationallyReady": [
        { "id": "s6", "serviceType": "ACTIVITY", "description": "Jerash half-day tour", "day": "Day 2 · Jul 3", "supplier": "Jordan Select Tours", "confirmation": "CONFIRMED", "voucher": "ISSUED", "execution": "READY", "reasons": ["All checks passed"] }
      ]
    },
    "manifest": { "expected": 4, "received": 3, "incomplete": 1, "complete": false },
    "passengers": [
      { "fullName": "James Anderson", "title": "Mr", "isLead": true, "nationality": "USA", "passportNumber": "55XXXXXX1", "passportExpiry": "2029-03-10", "arrivalFlight": "RJ 268", "dietary": null },
      { "fullName": "Sarah Anderson", "title": "Mrs", "isLead": false, "nationality": "USA", "passportNumber": "55XXXXXX2", "passportExpiry": "2030-08-22", "arrivalFlight": "RJ 268", "dietary": "Vegetarian" },
      { "fullName": "Mia Anderson", "title": "Ms", "isLead": false, "nationality": "USA", "passportNumber": null, "passportExpiry": null, "arrivalFlight": "RJ 268", "dietary": null },
      { "fullName": "Noah Anderson", "title": "Mstr", "isLead": false, "nationality": "USA", "passportNumber": "55XXXXXX4", "passportExpiry": "2031-01-05", "arrivalFlight": "RJ 268", "dietary": "No nuts" }
    ],
    "rooming": [
      { "roomType": "Deluxe Double", "occupancy": "double", "assigned": ["James Anderson", "Sarah Anderson"], "validity": "Valid" },
      { "roomType": "Twin", "occupancy": "double", "assigned": ["Mia Anderson", "Noah Anderson"], "validity": "Valid" }
    ],
    "finance": { "currency": "USD", "quotedTotal": 8450, "realizedCost": 5980, "margin": 2470, "marginPercent": 29, "clientInvoiceStatus": "invoiced", "supplierPaymentStatus": "unpaid", "payments": [ { "type": "CLIENT", "amount": 4225, "status": "PAID", "method": "bank_transfer", "paidAt": "2026-06-10" }, { "type": "CLIENT", "amount": 4225, "status": "PENDING", "method": "bank_transfer", "dueDate": "2026-06-30" } ] },
    "documents": [
      { "name": "Passenger manifest (Excel)", "available": true },
      { "name": "Guarantee letter", "available": true },
      { "name": "Hotel voucher — Mövenpick Petra", "available": false }
    ],
    "activity": [
      { "ts": "2026-06-28T14:22:00Z", "actor": "ops@dmc", "kind": "audit", "action": "guide_assignment_updated", "detail": "Petra guide → Almushtari Guides", "severity": "info" },
      { "ts": "2026-06-28T11:05:00Z", "actor": "Petra Visitor Center", "kind": "dispatch", "action": "ISSUE_RAISED", "detail": "Petra by Night entrance rejected — capacity", "severity": "critical" },
      { "ts": "2026-06-27T09:40:00Z", "actor": "ops@dmc", "kind": "audit", "action": "supplier_confirmation_sent", "detail": "QAIA arrival transfer → Alpha Transport", "severity": "info" }
    ]
  }
}
```

---

## 11. Implementation notes (for later PRs — not round 1)

- **Route**: ship under a scoped, flagged route mirroring Quote V2, e.g. `/operations/v2` (fleet) + `/bookings/[id]/operations-v2` (booking). Classic stays default.
- **Flags** (build-time `NEXT_PUBLIC_*`, default OFF) — operations endpoints have **no flags today**, so V2 introduces them:
  - `NEXT_PUBLIC_OPS_V2_DEFAULT` — route opt-in.
  - Later, per-capability apply flags echoing backend flags (e.g. `..._OPS_SUPPLIER_ASSIGN`, `..._OPS_CONFIRM`, `..._OPS_VOUCHER`).
- **Data**: round 1 binds to existing **GET** endpoints only — `GET /bookings`, `/bookings/:id`, `/bookings/:id/operations-grid`, `/bookings/operations/supplier-confirmations`, `/operations/dashboard`, `/operations/dispatch`. Cross-booking fleet view may need a small **read-only aggregation endpoint** (or client-side rollup of `GET /bookings` + per-booking grids) — design assumes one new GET (`GET /operations/v2/fleet-summary`) but **no schema change**.
- **Add `/api` proxies** in admin-web for any backend GET the pages call (project rule: missing proxy → HTML 404).
- **Phasing (mirror Quote V2)**: Phase A read-only viewer → Phase B safe low-risk edits behind flags+role (pickup time, assignments, status fields) with optimistic refresh → Phase C gated high-risk actions (supplier email, voucher send, finance) using a **preview + explicit confirm + audit** pattern, à la Quote V2 preview-token apply.
- **High-risk guardrails when eventually enabled**: supplier-confirmation send already has a safe **preview** endpoint (no financials, whitelisted fields) — reuse it as the mandatory pre-send step; require a typed/2-step confirm for any email or mark-paid.
- **Reuse**: lift `components/quote/v2/*` primitives (Card/Button/Progress/StatusBadge/sidebar/shell) into a shared `components/ops/v2/*` so both builders share the system.
- **Watch-outs**: don't render internal cost/sell/payable on any client-shareable surface; `BookingService` has *multiple* parallel status axes (`operationStatus`, `executionStatus`, `status`, `confirmationStatus`) — the operations grid already reconciles them into phase + readiness, so **bind to the grid response, not raw service fields**, to avoid re-deriving phase logic in the UI.
- **Tests**: source-grep tests exist around builder-v2 files; keep the same convention if co-locating ops-v2 under similar paths.

---

## 12. Screenshots / references to capture for v0

Capture these from the running Classic app (or Chrome MCP) to feed v0 as "current state" reference:
1. `/bookings` — list/execution queue (status summary cards).
2. `/bookings/[id]` Overview tab — header, alert panels, summary cards, service timeline.
3. `/bookings/[id]/operations` — **the operations grid**: action center, 5 phases, a per-service row expanded (most important reference).
4. `/bookings/[id]` Passengers tab + Rooming tab — manifest + rooming validity.
5. `/bookings/[id]` Financials tab — quoted/realized, payments, statuses.
6. `/bookings/[id]` Audit tab — timeline.
7. `/operations` and `/operations/dispatch` — existing dashboard/dispatch.
8. **Quote Builder V2** (`/quotes/[id]/builder-v2`) — the **visual target**: header, right summary sidebar, cards, badges, stepper. This is the look to match.
9. One supplier-confirmation **preview** screen (read-only draft) — shows the safe pattern to reuse.

---

## 13. The v0 prompt (paste this)

> Paste the block below into v0. Pair it with the dummy JSON in §10 and the screenshots in §12. Generate Screen 1 and Screen 2 first.

```
Build a read-only "Operations Command Center" (Booking Operations V2) for a destination-management-company (DMC) travel platform. This is a VIEWER and TRIAGE tool — it displays operational status across live trips and lets a coordinator drill into one booking. NOTHING is editable in this version: every action button is rendered DISABLED with a "Coming later" tooltip, and an "Open in Classic" button is always visible as the fallback.

TECH & STYLE
- React + Tailwind CSS + shadcn/ui. Lucide icons.
- It renders INSIDE an existing app shell (a dark left sidebar + top bar already exist) — do NOT add a global nav or a full-screen h-screen layout. Build only the page content.
- Brand primary #1F9ACF. Card background #FFFFFF, page #F9FAFB, text #111827, border #E5E7EB, radius 0.5rem. Headings: semibold, tracking-tight. Eyebrow labels: xs uppercase tracking-wide muted.
- Status colors: success #16A34A (green), warning #D97706 (amber), critical #DC2626 (red), info/brand #1F9ACF, neutral gray.
- Calm, status-first, scannable. Generous whitespace, dense data but never cramped. Pill badges: rounded-full, border, bg-color/10, text-color, xs, with a leading icon or dot.

SHARED COMPONENTS
- StatCard (label, value, lucide icon, severity tint), ReadinessMeter (% + progress bar), StatusBadge (one component, variants neutral/info/pending/warning/success/critical), ServiceTypeIcon (TRANSPORT→Bus, HOTEL→Building2, GUIDE→UserRound, ACTIVITY/TICKET→Ticket, DINING→Utensils, EXTERNAL_PACKAGE→Package), DisabledAction (disabled button + "Coming later" tooltip), OpenInClassicButton (outline + ExternalLink icon), ComingLaterTag.

SCREEN 1 — OPERATIONS COMMAND CENTER (default)
Layout: main column + sticky right sidebar.
- Top: a row of 7 StatCards — Live trips, Arrivals today, Confirmations pending, Unassigned services, Confirmations rejected, Vouchers pending, Open issues. Severity tints per the data.
- "This week" rail: 7 compact day columns (Sun–Sat) each showing counts of services dispatching, arrivals, departures; tint a column amber if it has a coverage gap.
- "Needs attention" table: bookings sorted by risk. Columns: Booking ref, Client, Type badge, Dates, Pax, Readiness % (mini meter), Top blockers (chips), Invoice status badge, Payment status badge. Whole row links to Screen 2.
- Right sidebar (cards): overall fleet readiness % with progress bar; "Blocking items" list (clickable, read-only); a "Next required action" highlighted card (read-only).

SCREEN 2 — BOOKING OPERATIONS WORKSPACE (read-only, single booking)
- Header: breadcrumb "Operations › {client} › {bookingRef}", title, a "V2 Beta" tag, a status pill (in_progress/confirmed/etc.), trip dates, pax. Top-right: "Open in Classic" button + a DISABLED primary action (e.g. "Mark as Sent — Coming later").
- Read-only sub-tabs: Operations (default) · Passengers & Rooming · Finance · Documents · Activity.
- OPERATIONS tab = a 5-section board: "Critical Issues", "Needs Assignment", "Needs Confirmation", "Ready for Voucher", "Operationally Ready". Each section header shows a count and a severity tint. Each service row: ServiceTypeIcon, description, a day chip, supplier name (or "Unassigned"), a confirmation StatusBadge, a voucher StatusBadge, an execution StatusBadge, and reason chips. Row action cluster (Assign supplier / Request confirmation / Generate voucher) all rendered via DisabledAction. Below the board: a "Passenger manifest" card (received/expected, complete/incomplete badge).
- PASSENGERS & ROOMING tab: read-only manifest table (lead star, name, nationality, passport, expiry, flight, dietary) + a rooming list (room type, occupancy, assigned passengers, a validity badge Valid/Mismatch/Needs occupancy).
- FINANCE tab: read-only summary (quoted total, realized cost, margin + %, client invoice status badge, supplier payment status badge) + a read-only payments table. No mark-paid / send buttons (or show them disabled).
- DOCUMENTS tab: list of documents (manifest, guarantee letter, vouchers) each with a DISABLED download/send action.
- ACTIVITY tab: a vertical timeline merging audit logs and dispatch events — actor, action label, detail, timestamp, a severity dot (info/warning/critical).
- Right sidebar: readiness %, operational counts (suppliers pending, confirmations pending, vouchers pending, rooming, manifest), and an "Open in Classic" link.

Use the provided JSON as the data shape. Make empty/placeholder states graceful. Emphasize that this is read-only: the disabled actions and "Open in Classic" must be obvious, not hidden.
```

---

*End of brief. No code, schema, backend, or production data was changed during this discovery.*
