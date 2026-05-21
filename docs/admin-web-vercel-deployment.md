# Admin Web Vercel Deployment

The admin web app must be deployed as its own Vercel project, separate from the API/Railway deployment.

## Project Settings

- Project name: `dmc-platform-admin-web`
- Framework preset: `Next.js`
- Root directory: `apps/admin-web`
- Build command: `npm run build`
- Output directory: `.next`
- Install command: Vercel default

Do not attach this project to `apps/api/vercel.json`. That file is for the legacy API Vercel deployment and contains an API catch-all route that must not be used by admin-web.

## Environment Variables

Set these in the admin-web Vercel project:

- `API_URL`: Railway/Nest API origin, for server-side page fetches and API proxy routes.
- `NEXT_PUBLIC_API_URL`: Railway/Nest API origin, for existing admin-web proxy route configuration.
- `APP_PUBLIC_URL`: Public admin-web origin, for generated portal/proposal/invoice links.
- `NEXT_PUBLIC_APP_URL`: Public admin-web origin, matching `APP_PUBLIC_URL`.

Example:

```text
API_URL=https://<railway-api-host>
NEXT_PUBLIC_API_URL=https://<railway-api-host>
APP_PUBLIC_URL=https://dmc-platform-admin-web.vercel.app
NEXT_PUBLIC_APP_URL=https://dmc-platform-admin-web.vercel.app
```

## Routing Contract

- `/touring-routes/audit` is a normal Next.js page rendered by admin-web.
- `/api/touring-routes/operational-audit/preview` is an admin-web API proxy route that forwards authenticated requests to the Railway/Nest backend.
- No admin-web Vercel rewrites or catch-all API routes should be added.
- Backend API auth guards remain private and unchanged.
