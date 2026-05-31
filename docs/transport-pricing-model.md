# Transport & Tour Pricing Model (AXIS DMC)

Reference for how AXIS sells/costs transport and tours, and how each piece maps to
the platform's data model. Captured 2026-05-31 from the operations team; the
**business rules** here are authoritative — the *system mapping* notes what exists
today vs. what still needs building.

---

## 1. The three transport/tour layers

| Layer | What it is | Examples | System model |
|---|---|---|---|
| **Regular transfer** | Point A → B, one move | Airport→hotel, hotel→airport, Amman→Petra drop-off | `Route` (type `TRANSFER_ROUTE`) priced per vehicle by a `ROUTE_TRANSFER` service type |
| **Touring route** | Multi-stop tour (day or multi-day), vehicle-based | Amman→Jerash→Ajloun→Amman; Amman→Madaba→Nebo→Petra (overnight) | `TouringRoute` + `touringRoutePricings` (per-pax-tier = per-vehicle). Suffixes: **RT**=round trip, **OW**=one-way, **ON**=with overnight |
| **Excursion / Package template** | A *bundle*: transport + entrances + guide + activities, for a day (excursion) or a multi-day sequence (package) | "Jerash & Ajloun Full Day"; "Classic Jordan 8D7N" | `ExcursionTemplate` (1 day, composite) / `PackageTemplate` (multi-day sequence) |

> **Note:** there is no separate "activity route." Activities and entrance tickets
> are **building blocks** (`Activity`, `EntranceFee`) that get added à la carte or
> bundled inside an excursion/package template.

---

## 2. Two transport **cost** modes (how the transport supplier bills us)

The same physical journey is costed two different ways depending on the program shape:

### (a) Per-route
Each leg priced individually. Used for FIT / short programs (e.g. **2 full days + 2 transfers** → charged per route).
- System: `POINT_TO_POINT` / `TRANSFER` / `AIRPORT_TRANSFER` rules on `Route` records.

### (b) Daily package (≥ 3 full days)
A **flat rate per full day** (e.g. **75 JOD/day**), *regardless of where they go*, **plus** arrival + departure transfers charged separately. Minimum **3 full days** to qualify.
- System: **`DAILY FULL DAY`** service type (classification `DAILY_PACKAGE`). The engine
  multiplies `daily rate × number of full days` and **flags a warning if < 3 days**
  ("Supplier minimum 3 full days may apply") — see `quotes.service.ts` (transport branch).
- `FULL_DAY` / `HALF_DAY` exist for single-day disposal.

---

## 3. Transport cost **line types** → system service types

| Cost line | When | Service type (classification) |
|---|---|---|
| Airport transfer (arrival) | arrival day | `AIRPORT_TRANSFER` / `ARR` (ROUTE_TRANSFER) |
| Departure transfer | departure day | `DEP` / `HALF_DAY` (per program) |
| Full day | vehicle out all day on tour | `FULL_DAY`, or `DAILY FULL DAY` when ≥3-day package |
| Half day | short/half-day use | `HALF_DAY` (HALF_DAY) |
| Stationary | vehicle on local standby (e.g. Petra hotel ↔ visitor centre, wait, return) | `STATIONARY` / `STATIONARY_WAITING` (ADD_ON) |
| Free day | no vehicle that day | — (0) |
| Per-hour | hourly disposal | `PER_HOUR` |

---

## 4. Driver overnight (extra add-on)

Driver overnight is **charged separately** (not included in the daily/full-day rate).

| Location | Driver overnight |
|---|---|
| Petra | **Standard** (auto) |
| Wadi Rum | **Standard** (auto) |
| Aqaba | **Standard** (auto) |
| Dead Sea | **Optional** (close to Amman — operator ticks if needed) |
| Amman | **None** (driver is home-based) |

- System: ADD_ON transport service types `PETRA_OVERNIGHT`, `WADI_RUM_OVERNIGHT`,
  `AQABA_OVERNIGHT` (a Dead Sea overnight type can be added, marked optional).
- Mechanically an overnight is a **transport add-on** on a transfer/touring line:
  `transportAddOns: [{ rateId, quantity = nights }]`, matched to the line's **vehicle +
  currency** (`calculateTransportAddOnsForQuoteItem`). Quantity = number of nights the
  driver sleeps out at that stop.

---

## 5. Guides

- **Local guide** — per site, joins for that day only (FIT default: e.g. Petra, Jerash).
- **Escort guide** — accompanies the **whole trip** (full guided tour); gets the same
  overnight pattern as the driver.
- System: Guide item carries **type** (`local` / `escort`), **duration**
  (`half_day` / `full_day`), and an **overnight** toggle that adds the overnight
  supplement (`GUIDE_RATES[type][duration] + overnight supplement`).

---

## 6. Pax tiers = vehicle sizes

Package per-person prices change with group size because the **pax tier selects the
vehicle**, and the daily/route cost is per-vehicle:

| Pax | Vehicle |
|---|---|
| 1–2 | Car / Sedan |
| 3–6 | Mini Van |
| 7–9 | Van (12-seater) |
| 10–14 | Small Bus |
| 15–30 | Medium Bus |
| 30+ | Large Bus |

Touring-route and daily rates are stored per these tiers.

---

## 7. Worked example — Classic Jordan 8D7N (Dion Tours tariff)

Itinerary: D1 Arrival·Amman / D2 Amman·Jerash·Amman (FD) / D3 Amman·Madaba·Nebo·Shoubak·Petra (FD) /
D4 Petra visit / D5 Petra·Wadi Rum (FD) / D6 Wadi Rum·Dead Sea (FD) / D7 Dead Sea (free) / D8 Departure.

**Transport cost build-up:**

| Day | Line | Type |
|---|---|---|
| 1 | Airport transfer (arrival) | `AIRPORT_TRANSFER` |
| 2 | Full day | `DAILY FULL DAY` |
| 3 | Full day | `DAILY FULL DAY` |
| 4 | Stationary (Petra local) | `STATIONARY` |
| 5 | Full day | `DAILY FULL DAY` |
| 6 | Full day | `DAILY FULL DAY` |
| 7 | Free day | — |
| 8 | Half day (departure) | `HALF_DAY` |

= **1 airport transfer · 4 FD · 1 stationary · 1 half day · 1 free day**
**+ driver overnights:** Petra ×2, Wadi Rum ×1 (standard); Dead Sea ×2 (optional).

Cost (per chosen vehicle): `4 × FD-rate + airport-transfer + half-day + stationary + 3 overnights`.
**Sell** = cost + margin, published as the per-person tariff by **pax tier × hotel category (3★/4★/5★)**.

---

## 8. Gaps / TODO

1. ~~**Auto-builder is per-route only.**~~ **DONE (2026-06-01).** `QuoteAutoItineraryBuilder`
   now has a **"Use daily-package transport" toggle**. When on, it keeps the arrival +
   departure airport transfers and bills each middle day as a flat **`DAILY_FULL_DAY`**
   line (rate × dayCount via the engine), and auto-attaches **driver overnights**
   (standard Petra/Wadi Rum/Aqaba; Dead Sea via a nested opt-in). Pricing resolves the
   Almushtari 75 JOD/day card for FIT vehicles (≤9 pax) and falls back to Alpha Bus
   coaches for larger groups. STILL not auto-assembled: **stationary days**, **free-day
   detection** (all middle days default to full days; operator removes), and **guides**
   (local vs escort + escort overnights).
2. ~~**Rates to load.**~~ **DONE.** `DAILY_FULL_DAY` (Almushtari 75/90/100/110 JOD +
   Alpha Bus coaches), and driver-overnight rates for Petra/Wadi Rum/Aqaba/Dead Sea
   (15 JOD/vehicle). Still optional: half-day-departure variant, larger-vehicle daily rates.
3. **Published-tariff (rate-card) mode** — optionally store a finished package as a
   per-person rate card by pax tier × category (vs. always building up from components),
   for selling fixed products to agents.

---

*Maintained by the AXIS engineering notes. Update the business rules here when the
transport supplier model changes; the auto-builder/package work keys off this doc.*
