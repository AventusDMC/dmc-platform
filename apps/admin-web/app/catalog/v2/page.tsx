import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { adminPageFetchJson } from '../../lib/admin-server';
import { readSessionActor } from '../../lib/auth-session';
import { AdminForbiddenState } from '../../components/AdminForbiddenState';
import { CatalogV2View, type CatalogV2Summary } from '../../../components/catalog/v2/catalog-v2-view';
import { isCatalogV2Enabled } from './catalog-v2-flag';

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

  // 2) Require an authenticated session (any role — the backend redacts pricing).
  const role = readSessionActor((await cookies()).get('dmc_session')?.value || '')?.role ?? null;
  if (!role) {
    return (
      <AdminForbiddenState
        title="Product Catalog V2 access restricted"
        description="Sign in to view the read-only Product Catalog."
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
          <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            The Product Catalog summary is unavailable right now.
          </div>
        ) : (
          <CatalogV2View summary={summary} />
        )}
      </div>
    </main>
  );
}
