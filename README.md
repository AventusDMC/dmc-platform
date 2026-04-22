# DMC Platform

Initial monorepo scaffold for a DMC travel platform with:

- `apps/api`: NestJS backend
- `apps/admin-web`: Next.js frontend
- PostgreSQL via Docker
- Prisma ORM in the API

## Requirements

- Node.js 20+
- npm 10+
- Docker Desktop

## Project Structure

- `apps/api` - NestJS backend with Prisma
- `apps/admin-web` - Next.js admin frontend
- `docker-compose.yml` - PostgreSQL service

## Setup

1. Copy API environment variables:

   ```bash
   cp apps/api/.env.example apps/api/.env
   ```

2. Start PostgreSQL:

   ```bash
   docker compose up -d
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Apply the initial Prisma migration:

   ```bash
   npm --workspace @dmc/api run prisma:migrate
   ```

5. Start the API:

   ```bash
   npm run dev:api
   ```

6. Start the admin app:

   ```bash
   npm run dev:admin
   ```

7. Load the demo dataset:

   ```bash
   npm run seed:demo
   ```

## Database

PostgreSQL runs on:

- Host: `localhost`
- Port: `5432`
- Database: `dmc_platform`
- User: `postgres`
- Password: `postgres`

## Prisma Models

The initial schema includes:

- `User`
- `Role`
- `Company`
- `Contact`
- `Lead`

## Booking Conversion Flow

Accepted quotes can be converted into bookings as a stable operational record.

- System boundary:
  - quote = commercial layer
  - booking = operational layer
- Purpose: preserve the accepted commercial state as an operational booking, even if the live quote is edited later.
- Source of truth: booking creation must read from `acceptedVersion.snapshotJson`, not mutable live quote data.
- Conversion rules:
  - only quotes with status `ACCEPTED` can show the `Create booking` action
  - booking creation uses the accepted quote version linked by `acceptedVersionId`
  - after success, the user is redirected to the booking page with a confirmation state
- Idempotency:
  - only one booking can be created per accepted quote version
  - enforced by a unique constraint on `acceptedVersionId`
- Duplicate protection:
  - booking creation is blocked if a booking already exists for the quote or accepted version
- Immutability:
  - once created, a booking must not depend on live quote data
  - all booking-facing data must come from the persisted snapshot
- Booking Services:
  - booking services are derived from the accepted quote snapshot, not live quote items
  - booking services are created from accepted quote items during conversion
  - each booking service represents an operational unit such as a hotel, transfer, or activity
  - booking services separate operational description and commercial detail:
    - description is used for operational display
    - notes preserve additional commercial or pricing context when present
  - booking services can be assigned to a supplier:
    - supplierId links to the supplier entity (future expansion)
    - supplierName is stored as a snapshot for display
  - booking services track supplier confirmation:
    - confirmationStatus represents communication state with supplier (pending, requested, confirmed)
    - confirmationNumber stores supplier confirmation reference when available
    - confirmationNotes store additional confirmation details
  - services are ordered by itinerary day when available, and otherwise preserve the original accepted quote order
  - once created, booking services do not depend on quote data and updates happen within the booking context only
  - initial status is `pending`
  - services will later be used for supplier assignment and confirmations
- Persisted booking snapshot:
  - `quoteId`
  - `acceptedVersionId`
  - `status`
  - full `snapshotJson`
  - client, brand, and contact snapshots
  - itinerary snapshot
  - pricing snapshot
  - `adults`, `children`, `roomCount`, `nightCount`
- UI behavior:
  - the quote detail page only exposes `Create booking` when the quote is `ACCEPTED`
  - the booking page reads from the persisted booking snapshot rather than current quote company or contact data
- Current limitation:
  - before production use, apply the booking snapshot Prisma migration to the target database

## Useful Commands

```bash
npm run db:up
npm run db:down
npm run dev:api
npm run dev:admin
npm run seed:demo
npm run seed:demo:reset
```

## Demo Seed Data

The Prisma seed entry point is [apps/api/prisma/seed.ts](/C:/Users/pc/dmc-platform/apps/api/prisma/seed.ts). It now seeds both the base catalog/master data and a repeatable demo dataset for end-to-end local testing.

Run it with:

```bash
npm run seed:demo
```

To clear the demo scenario data without recreating it:

```bash
npm run seed:demo:reset
```

What gets seeded:

- Demo FIT quote in `SENT` with public sharing enabled
- Demo FIT quote in `ACCEPTED` with public sharing, issued invoice, linked booking, passengers, rooming, and mixed service lifecycle states
- Demo GROUP quote with slab pricing, scenarios, itinerary-linked services, and a saved version
- Demo FIT quote in `REVISION_REQUESTED` with `clientChangeRequestMessage`
- Base hotel/catalog data with cities, hotels, contracts, room categories, hotel rates, meal plans, supplements, cancellation rules, child policies, occupancy rules, and allotment examples

Notes:

- Demo records use a `Demo ...` naming convention so the scenario reset mode only removes demo scenario records and demo companies/contacts.
- The seed is idempotent for catalog data and safely resettable for demo scenario data.
- Seeded local users remain:
  - `admin@dmc.local` / `admin123`
  - `sales@dmc.local` / `sales123`
  - `operations@dmc.local` / `ops123`
  - `finance@dmc.local` / `finance123`
