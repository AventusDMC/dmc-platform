# Production Smoke Test

Use this after a production deploy or before handing the environment to manual QA.

## Environment

Set these variables before running the smoke scripts:

```bash
SMOKE_API_URL=https://your-api.example.com
SMOKE_WEB_URL=https://your-admin.example.com
SMOKE_EMAIL=admin@example.com
SMOKE_PASSWORD=your-password
SMOKE_QUOTE_NUMBER=Q-2026-0005
```

`SMOKE_QUOTE_NUMBER` is optional and defaults to `Q-2026-0005`.

## Commands

Run API smoke:

```bash
npm run smoke:api
```

Run admin-web and SSR smoke:

```bash
npm run smoke:web
```

Run both:

```bash
npm run smoke
```

## What The Scripts Check

### API smoke

- login succeeds
- `/auth/me` returns `id`, `email`, `role`, and `companyId`
- `/quotes` returns 200 and contains the demo quote
- `/quotes/:id` returns 200
- `/quotes/:id/itinerary` returns 200
- `/quotes/:id/versions` returns 200, or logs a warning if it returns 403
- `/bookings` returns 200
- `/invoices` returns 200
- `/users` returns 200

### Admin-web smoke

- `/api/auth/login` sets `dmc_session`
- `/api/quotes` forwards auth
- `/api/quotes/:id` forwards auth
- `PATCH /api/quotes/:id` forwards auth
- `/api/quotes/:id/itinerary` forwards auth
- `/api/quotes/:id/versions` is checked and logged if it returns 403
- quote currency update persists through the proxy, then is restored
- `/quotes` renders without an application error page
- `/quotes/:id` renders without an application error page
- `/dashboard` renders without an application error page

## Manual Checklist

1. Run `npm run smoke`.
2. Open `/quotes/:id` for `Q-2026-0005`.
3. Verify quote totals and sidebar totals use the same `quoteCurrency`.
4. Verify itinerary loads or shows the empty-state instead of crashing.
5. Verify versions tab loads, or shows the unavailable/empty state instead of crashing.
6. Verify quote edit actions still work after login.
7. Verify dashboard, quotes list, bookings, invoices, and users pages all load under the same session.

## Notes

- The scripts do not seed data, run migrations, or modify credentials.
- The web smoke test temporarily changes `quoteCurrency` and restores it before exit.
- A `403` from `/quotes/:id/versions` is treated as a warning only if the quote page still renders successfully.
