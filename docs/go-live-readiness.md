# Go-Live Readiness Checklist

Last reviewed: 2026-04-27

## Database And Migrations

- [x] Prisma migrations are timestamped and ordered through `20260427133000_add_booking_service_vouchers`.
- [x] Production deploy command exists: `npm --workspace @dmc/api run prisma:migrate:deploy`.
- [ ] Run `prisma migrate status` against the production database before release.
- [ ] Confirm a recent production backup exists before applying migrations.

## Seed And Master Data

- [x] `apps/api/prisma/seed.ts` seeds service types, suppliers, transport catalog, quote blocks, hotel/catalog data, demo users, and demo bookings.
- [x] `EXTERNAL_PACKAGE` is seeded as a service type.
- [x] Booking, booking service, voucher types, and voucher statuses are Prisma enums, not seed rows.
- [x] Seed users include `admin@dmc.local`, `operations@dmc.local`, and `finance@dmc.local`; replace demo passwords before production use.

## Environment Variables

- [x] API variables are documented in `apps/api/.env.example`.
- [x] Admin web variables are documented in `apps/admin-web/.env.example`.
- [ ] Production must set a strong `DMC_AUTH_SESSION_SECRET`.
- [ ] Production must set `DATABASE_URL`, `ADMIN_WEB_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`, `API_URL`, and `CORS_ORIGINS`.
- [ ] Set `PUPPETEER_EXECUTABLE_PATH` if the deployment image does not include a usable bundled Chromium.
- [ ] Set SMTP variables before enabling invitation/document/reminder email delivery.

## Exports And Storage

- [x] PDF and Excel exports stream directly from the API response; no persistent server file storage is required for generated documents.
- [x] Static uploads are served from `/uploads`.
- [ ] Production deployments with uploaded assets must use persistent storage or an object-store-backed upload path; ephemeral container storage is not sufficient.
- [ ] Verify the runtime can launch PDF generation for both `pdfkit` documents and proposal-v3 Puppeteer PDFs.

## Security And Access Control

- [x] Passenger manifest Excel export is restricted to `admin` and `operations`.
- [x] Guarantee letters, service vouchers, operations dashboard, and mobile operations data are restricted to `admin` and `operations`.
- [x] Booking/passenger/service/voucher reads and writes are scoped by `clientCompanyId`.
- [x] Mobile operations payload masks passport numbers and excludes pricing.
- [ ] Verify every production user has the intended role before go-live.
- [ ] Rotate or disable seeded/demo credentials before go-live.

## Backups And Recovery

- [ ] Configure automated PostgreSQL backups with point-in-time recovery if available.
- [ ] Document restore procedure and test restore into a non-production database.
- [ ] Take a manual backup immediately before first production migration deploy.

## Logging And Monitoring

- [x] NestJS default request/runtime error logging is enabled.
- [ ] Configure platform log retention and alerting for API 5xx errors, failed migrations, PDF rendering failures, and email delivery failures.
- [ ] Configure uptime checks for API health, admin web, public proposal links, and invoice links.

## Build And QA Gates

- [x] API test suite: `npm --workspace @dmc/api run test`.
- [x] Admin web test suite: `npm --workspace @dmc/admin-web run test`.
- [x] API production build: `npm --workspace @dmc/api run build`.
- [x] Admin web production build: `npm --workspace @dmc/admin-web run build`.
- [x] End-to-end operations regression covers quote-to-booking, passengers, manifest export, service assignment, guarantee letter, vouchers, dashboard, mobile view, quick status update, and client/field data leakage checks.

## Sample Booking Smoke Test

- [ ] In production, create or seed one real sample booking and verify:
- [ ] Accepted quote converts to booking.
- [ ] Booking days match itinerary dates.
- [ ] Passenger manifest validates required fields and exports Excel.
- [ ] Transport, guide, and hotel services can be assigned and confirmed.
- [ ] Guarantee letter PDF generates.
- [ ] Supplier vouchers generate and open.
- [ ] Operations dashboard counts match the sample booking state.
- [ ] `/operations/mobile` shows today services and quick status updates persist.
- [ ] Client-facing proposal/PDF does not expose passport data, supplier internal data, costs, margins, or internal notes.
