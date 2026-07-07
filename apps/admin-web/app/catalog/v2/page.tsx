import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { adminPageFetchJson } from '../../lib/admin-server';
import { readSessionActor } from '../../lib/auth-session';
import { AdminForbiddenState } from '../../components/AdminForbiddenState';
import { CatalogV2View, type CatalogV2Summary } from '../../../components/catalog/v2/catalog-v2-view';
import { isCatalogV2Enabled } from './catalog-v2-flag';
import { isCatalogV2Authorized } from './catalog-v2-access';

/**
 * Product Catalog V2 — Slice 2 read-only page.
 *
 * Read-only by construction: GET-only data via /api/catalog/v2/summary, no
 * forms, no mutations, no writes. Gated by NEXT_PUBLIC_CATALOG_V2 (default OFF →
 * notFound). The backend independently fail-closes on CATALOG_V2_ENABLED and
 * enforces role-based pricing redaction, so the page renders whatever the
 * (redacted-or-not) summary returns.
 */
export default async function CatalogV2Page() {
  // 1) Flag gate first — when OFF the route does not exist (no leak).
  if (!isCatalogV2Enabled()) {
    notFound();
  }

  // 2) Internal-first role gate (Slice 3) — the first production debut is limited
  // to admin / operations / super_admin / finance. EXPLICIT allowlist (blocks
  // agent / viewer / agent_admin and unauthenticated). Decided server-side; the
  // backend re-enforces the same gate.
  const role = readSessionActor((await cookies()).get('dmc_session')?.value || '')?.role ?? null;
  if (!isCatalogV2Authorized(role)) {
    return (
      <AdminForbiddenState
        title="Product Catalog V2 access restricted"
        description="The Product Catalog is available to internal operations and finance roles."
      />
    );
  }

  let summary: CatalogV2Summary | null = null;
  let loadError = false;
  try {
    summary = await adminPageFetchJson<CatalogV2Summary>('/api/catalog/v2/summary', 'Product Catalog V2', {
      cache: 'no-store',
    });
  } catch {
    loadError = true;
  }

  return (
    <main className="px-4 py-6 md:px-6">
      <div className="mx-auto w-full max-w-[1200px]">
        {loadError || !summary ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm font-medium text-foreground">Product Catalog is unavailable right now</p>
            <p className="mt-1 text-xs text-muted-foreground">
              The read-only catalog summary could not be loaded. Please try again in a moment.
            </p>
          </div>
        ) : (
          <CatalogV2View summary={summary} />
        )}
      </div>
    </main>
  );
}
