# DMC Admin Stability Checklist

Run this checklist before every deploy that touches `apps/admin-web`.

## Required Commands

```bash
npm --workspace @dmc/admin-web run test
npm --workspace @dmc/admin-web run build
```

Both commands must pass before deploy.

## Auth And Session

- `/login`: valid admin credentials land in `/admin/dashboard`.
- Expired session on `/quotes` redirects to `/login?reason=session-expired&next=%2Fquotes`.
- Expired session on `/bookings` redirects to `/login?reason=session-expired&next=%2Fbookings`.
- Expired session on `/finance` redirects to `/login?reason=session-expired&next=%2Ffinance`.
- Logged-in admin can open `/activities` without being redirected to login.
- Public invoice route `/invoice/[token]` remains accessible without admin login.

## Dashboard And Navigation

- `/admin/dashboard` loads without crashing.
- Dashboard quick actions resolve:
  - New Quote: `/quotes/new`
  - Quotes: `/quotes`
  - Bookings: `/bookings`
  - Finance: `/finance`
  - Reports: `/admin/reports`
- Breadcrumb `Dashboard` links to `/admin/dashboard`.
- No visible admin link points to legacy `/dashboard` except the redirect alias itself.
- Sidebar remains visible and usable on protected admin pages.

## Core Routes

Open each route as a logged-in admin and confirm it renders a page, not login, dashboard, or a 500:

- `/admin/dashboard`
- `/admin/reports`
- `/quotes`
- `/quotes/new`
- `/bookings`
- `/operations`
- `/operations/mobile`
- `/finance`
- `/finance/reconciliation`
- `/invoices`
- `/companies`
- `/contacts`
- `/leads`
- `/quote-blocks`
- `/import-itinerary`
- `/users`
- `/branding`

## Product Catalog Routes

Confirm each Product Catalog nav item opens the matching route:

- Hotels: `/hotels`
- Activities: `/activities`
- Transport: `/transport`
- Routes: `/routes`
- Services: `/catalog?tab=services`
- Suppliers: `/suppliers`
- Transport Pricing: `/transport-pricing`

Also confirm `/activities/new` and an existing `/activities/[id]` load without actor-company filtering issues.

## Proxy And API Safety

- Browser network tab for quote delete uses `DELETE /api/quotes/[id]`, not a Railway/backend URL.
- Browser network tab for quote cancel uses `POST /api/quotes/[id]/cancel`, not a Railway/backend URL.
- Browser network tab for invoice actions uses `/api/invoices/...`.
- Browser network tab for catalog actions uses `/api/...`.
- A 401 API response shows an error or redirects through the login flow with `next`; it must not silently push to `/admin/dashboard`.

## Fetch Failure Behavior

Temporarily stop or block the API, then confirm these pages render an empty/error state instead of a 500:

- `/admin/dashboard`
- `/admin/reports`
- `/quotes`
- `/bookings`
- `/activities`
- `/hotels`
- `/transport`
- `/suppliers`
- `/finance`
- `/invoices`

Expected examples:

- `/invoices`: shows `Invoices are temporarily unavailable.`
- `/finance`: shows `Finance bookings are temporarily unavailable.`
- `/quotes`: shows `Quotes are temporarily unavailable.`
- `/bookings`: shows `Bookings are temporarily unavailable.`

## Finance Flow

- `/invoices` loads with invoices or an empty state.
- `/invoices/[id]` opens an existing invoice.
- Invoice PDF download uses `/api/invoices/[id]/pdf`.
- Send invoice uses `/api/invoices/[id]/send`.
- Send reminder uses `/api/invoices/[id]/send-reminder`.
- `/finance/reconciliation` loads summary, payment proofs, and empty states safely.
- `/admin/reports` finance summary, overdue invoices, supplier payables, and CSV export buttons render.

## Quote Flow Smoke Test

Use a draft quote and verify:

- Create quote from `/quotes/new`.
- Open `/quotes/[id]`.
- Generate draft itinerary creates `nights + 1` days.
- Existing Day 1 does not block generation.
- Generate and price itinerary still works.
- Base Program expands after itinerary generation.
- Add Hotel from a day attaches to that day.
- Add Transport from a day attaches to that day.
- Add Activity from a day attaches to that day.
- Adding a day service does not create duplicate days.
- No `Day 1 already exists` message appears.
- Pricing updates after service add/edit.
- Proposal preview opens.
- Convert to booking opens `/bookings/[id]?created=1`.

## Delete And Cancel Flow

- Delete quote from quote list stays in the quotes flow and returns to `/quotes`.
- Delete quote from quote detail stays in the quotes flow and returns to `/quotes`.
- Cancel quote from quote detail stays in the quotes flow and returns to `/quotes`.
- Unauthorized delete/cancel shows an error; it must not silently redirect to `/admin/dashboard`.

## Booking Flow

- `/bookings` loads list or empty state.
- `/bookings/[id]` opens an existing booking.
- Booking status update uses `/api/bookings/[id]/status`.
- Booking day service add/edit uses `/api/bookings/[id]/days/[dayId]/services`.
- Voucher PDF uses `/api/bookings/[id]/voucher/pdf`.
- Supplier confirmation PDF uses `/api/bookings/[id]/supplier-confirmation/pdf`.

## Release Gate

Do not deploy if any of these are true:

- Test or build command fails.
- Any protected route redirects a logged-in user to login.
- Any expired-session route loses the original `next` path.
- Any frontend action calls a Railway/backend URL directly.
- Any audited page 500s when its API fetch fails.
- Any navigation link points to a missing route or legacy `/dashboard`.
