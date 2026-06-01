# Master Plan vs. Code Audit — 2026-06-01

Method: 10 read-only auditor agents cross-checked every *claimed-complete* master-plan
item against the actual API modules (`apps/api/src`), admin-web pages
(`apps/admin-web/app`), and Prisma schema (107 models). Every PARTIAL/MISSING finding
was re-checked by an adversarial verifier (which upgraded 8 manifest/voucher findings
the first pass had missed). 123 items audited; ~100 fully implemented.

Status legend: **IMPLEMENTED** (real backend + UI), **BACKEND_ONLY** (API/model, no UI),
**UI_ONLY** (page, no real backend), **PARTIAL** (incomplete), **MISSING** (no code).

---

## Headline finding: the plan's percentages are stale and *understate* the platform

The master plan treats Phases 3–7 (Operational ERP, Dispatch, Finance, Portals) as
mostly future work — Operational ERP "15–20%", Finance "10%", Agent Portal "0–10%",
Client Portal "0%". **The code says otherwise.** Large parts of those phases are already
built and wired end-to-end:

| Master-plan claim | Reality in code | Corrected estimate |
| --- | --- | --- |
| Operational ERP **15–20%** | Bookings (FIT/GROUP/SERIES), passengers, passports, rooming (manual), Excel manifest export, occupancy validation all shipped | **~55–60%** |
| Dispatch & Execution — *"Phase 4, future"* | Transport + guide dispatch, service orders, operational timeline, incident/escalation, resource-conflict detection, dispatch-event log — **all live** | **~90%** |
| Finance **10%** | Full client-invoice lifecycle + PDF + payments, profit/margin/supplier-spend reports & dashboards | **~55%** |
| Agent Portal **0–10%** | Auth, booking tracking, voucher/invoice PDFs, proposals, departure requests, amendment requests — functional | **~65%** |
| Client Portal **0%** | Token-auth read-only traveler portal: itinerary, services, voucher download | **~50%** |

Conversely, **one section is overstated**: see Guided Quote Builder below.

---

## Per-subsystem results

### ✅ Hotels Engine — matches plan (~95%)
20/21 implemented. Pricing resolver (all occupancy bases + HB/BB supplements), contract
lifecycle, health dashboard, confidence engine, correction queue/workspace, re-upload diff,
allotments, promotions, VERIFIED badge — all real.
- **MISSING:** *Preferred hotel ranking* — no `preferred`/`ranking` field on Hotel/HotelContract;
  guided suggestions sort by verified→active→alphabetical only. (Confidence badging is the
  nearest existing analog. `OperationalArea` has a `priority` field that was never replicated to hotels.)

### ✅ Transport Engine — matches plan (~100%)
18/18 implemented. Vehicle types/capacity, rate cards, route standards, transfer + touring
routes & legs, capacity-based pricing, extra-hour/extra-km, vehicle recommendations, guided
transport intelligence. No gaps found.

### ✅ Activities & Experiences — matches plan (~90%)
8/9 implemented. Activity master + rate variants, excursion templates with composite
component architecture (TRANSPORT/TICKET/ACTIVITY/GUIDE/DINING), Petra Full Day + Petra Hiking.
- **PARTIAL:** *Operational metadata* (`moodCategory`, `experienceType`, `operationalIntensity`,
  `religiousSignificance`, `premiumExperienceFlag`) exists in the schema and is **read** by
  guided suggestions, but the CRUD request types and `ActivityForm.tsx` never expose it —
  operators can't edit these fields. Backend-only.

### ⚠️ Guided Quote Builder — **OVERSTATED in plan** (~50% as a *guided* flow)
The plan claims guided live-pricing, multi-day itinerary, and profitability controls are done.
They are done **in the advanced workspace and data model** — but the *guided* builder
(`quotes/new/guided/GuidedQuoteBuilder.tsx`) is a v1 scaffold that collects journey metadata
and hands off at Step 7. Within the guided flow:
- **IMPLEMENTED:** vehicle recommendations + route intelligence; quote persistence (via handoff).
- **PARTIAL:** hotel selection (shows names by city, no room/meal picker, no price);
  experience selection (names + duration, no variant, no price).
- **UI_ONLY:** markup/margin/profit — Step 6 literally reads *"Pricing breakdown will populate
  in v2"*; a test even asserts the guided service *"NEVER touches pricing/margin/profitability."*
- **BACKEND_ONLY:** multi-day itinerary builder — `QuoteItineraryDay`/`...DayItem` + full CRUD
  exist, but day-by-day building happens in the advanced workspace, not the guided builder.

> Not a capability gap — the platform *can* do all of this in the advanced quote workspace.
> It's a labeling gap: the guided builder hasn't absorbed those features yet.

### ✅ Contract Intelligence Layer — matches plan (~100%)
6/6 implemented. Validation engine (supplements/seasons/pricing completeness), prioritized
correction queue, 7-category health dashboard, confidence scoring with audit fields,
re-upload diffing, pricing interpretation preview.

### 🟡 Operational ERP — Booking & Passengers — *understated* (~60%)
8/14 implemented: Booking (FIT/GROUP/SERIES), Series + guaranteed departures (backend; **no admin UI**),
passenger CRUD, passport storage, manual rooming entry + assignment, rooming Excel export,
occupancy detection/validation, lead-passenger flag.
- **BACKEND_ONLY:** special requests (service-level only, not per-passenger); Series departure mgmt (no UI).
- **PARTIAL:** dietary requirements (service/meal-level, not per-passenger).
- **MISSING (genuine gaps):** per-passenger *emergency contacts*; *auto room allocation*;
  *twin matching*; *single-supplement management* at booking level. Rooming is fully manual —
  the system flags occupancy problems but never auto-solves them.

### 🟡 Manifests, Vouchers & Supplier Confirmations — *understated* (~80%)
20/23 implemented (verifiers upgraded 8 of these from the first pass). Arrival/departure/hotel/
guide/vehicle manifest data via Excel export + dispatch board; hotel/transport/guide/activity/
generic-supplier vouchers; full supplier-confirmation lifecycle (NOT_SENT→…→CONFIRMED/REJECTED)
with reconfirmation tracking; ops dashboard arrivals/departures/alerts.
- **PARTIAL:** dedicated *airport-transfer manifest doc* (airport routes are flagged via
  `airportRouteFlag` but there's no separate manifest); *in-house occupancy matrix* (hotel ops
  tracked but no "occupancy by hotel by date" aggregation).
- **MISSING:** *restaurant/dining vouchers* — `VoucherType` enum has no RESTAURANT/DINING value;
  dining tracked as a service but no voucher.

### ✅ Dispatch & Execution — **far ahead of plan** (~90%)
7/7 implemented. The plan files this under "Phase 4, future" but it's live: transport dispatch
(driver/vehicle assign + audit), guide dispatch (allocation + availability + language),
service orders via `BookingService`, operational timeline (dispatchedAt/startedAt/completedAt),
incident tracking + severity escalation + recovery suggestions, resource-conflict detection
(WARNING/BLOCKING/CRITICAL), and an append-only `DispatchEvent` log.

### 🟡 Finance — *understated* (~55%)
1/3 fully implemented (invoicing), 2 partial.
- **IMPLEMENTED:** invoicing — Invoice lifecycle (DRAFT/ISSUED/PAID/CANCELLED), PDF, payments
  (CLIENT + SUPPLIER), credit notes, email/reminders, invoice UI.
- **PARTIAL:** supplier cost control — cost fields exist + heuristic cost-leakage estimates,
  but **no expected-vs-actual variance tracking, cost rules, or anomaly alerts**.
- **PARTIAL:** financial reporting — revenue/profit/margin/supplier-spend/AR-AP all done, but
  **destination profitability is absent** (no geographic/regional P&L; reports group only by
  supplier/month/booking despite `TouringRoute.startCity`/`mainDestinations` existing).
- Note: no separate *supplier invoice* model — supplier amounts are derived from booking costs.

### 🟡 Agent & Client Portals — *understated* (~60%)
**Agent (7/11 impl):** login/auth, booking tracking, voucher PDF, invoice PDF, proposal links,
departure-seat requests, amendment requests.
- **BACKEND_ONLY:** create-quotes — agent portal is read-only; creation lives in admin.
- **MISSING (genuine gaps):** *agent pricing levels*, *commission controls*, *analytics dashboard*
  (no AgentPricing/Commission models exist; `Quote.agentId` has no commission/markup fields).

**Client (3/5 impl):** token-auth read-only portal — itinerary/trip docs, services, voucher download.
- **BACKEND_ONLY:** emergency contacts — built for vouchers but `findPortalBooking()` doesn't return them; no portal UI.
- **PARTIAL:** travel info — passport/flight/visa fields exist on `BookingPassenger` but the
  portal omits per-passenger detail entirely.

---

## The genuine "build-next" gap list (truly MISSING code)

These are the only items with **no meaningful implementation** anywhere:

1. **Auto room allocation + twin matching + single-supplement management** (booking rooming automation)
2. **Per-passenger emergency contacts** (booking layer)
3. **Restaurant/dining vouchers** (`VoucherType` enum + generator)
4. **Agent pricing levels + commission controls + agent analytics** (B2B portal)
5. **Preferred hotel ranking** (recommendation engine input — Phase 2 "Next")
6. **Destination/regional profitability reporting** (finance)
7. **Supplier cost variance tracking** (expected vs. actual)

## Cheap "wiring" wins (backend exists, just needs UI/plumbing)

- Series/guaranteed-departure **admin UI** (backend complete)
- Activity **operational-metadata editor** (fields exist, add to `ActivityForm` + CRUD bodies)
- Surface **emergency contacts** in the traveler portal (`findPortalBooking` already can build them)
- Surface **per-passenger travel info** (flight/visa/passport) in the traveler portal
- Fold guided-builder hotel/experience steps into the **real pricing engine** (or relabel as "intake")
