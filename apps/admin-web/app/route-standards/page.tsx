import Link from 'next/link';
import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';
import { AdminBreadcrumbs } from '../components/AdminBreadcrumbs';
import { RouteStandardBootstrapPanel } from './RouteStandardBootstrapPanel';
import { RouteStandardImportPanel } from './RouteStandardImportPanel';
import { RouteStandardRefinementPanel } from './RouteStandardRefinementPanel';
import { computeTimingConfidenceLabel } from './route-standard-display';

export const dynamic = 'force-dynamic';

type RouteStandard = {
  id: string;
  routeCode: string;
  routeName: string;
  fromCity: string | null;
  toCity: string | null;
  destinationArea: string | null;
  standardDistanceKm: number | null;
  standardDurationHours: number | null;
  operationalBufferMinutes: number | null;
  longDistanceFlag: boolean;
  overnightRisk: boolean;
  mountainRoadFlag: boolean;
  borderCrossingFlag: boolean;
  airportRouteFlag: boolean;
  notes: string | null;
  isActive: boolean;
  source: string | null;
  // Cleanup Phase v1
  canonicalRouteCode: string | null;
  reviewStatus: string | null;
  suspiciousDurationFlag: boolean;
};

async function loadStandards(): Promise<RouteStandard[]> {
  try {
    return await adminPageFetchJson<RouteStandard[]>('/api/route-standards', 'Route standards', { cache: 'no-store' });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[route-standards] list unavailable', error);
    return [];
  }
}

export default async function RouteStandardsPage({ searchParams }: { searchParams?: Promise<{ success?: string; error?: string }> }) {
  const resolved = searchParams ? await searchParams : undefined;
  const standards = await loadStandards();
  const activeCount = standards.filter((s) => s.isActive).length;

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs items={[{ label: 'Product Catalog' }, { label: 'Route Standards' }]} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h1>Route Standards</h1>
            <p className="admin-muted-copy">
              Canonical operational reference for route distance, duration, buffers, and risk flags. Keyed by route code (e.g.,
              <code> AMM_PET</code>, <code>AQJ_WRM</code>). Phase 2 will wire the quote engine, dispatch checks, and vouchers to
              read timing from this table — for now it's the single editable source of truth.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <a
              href="/api/route-standards/workbook/export"
              className="secondary-button"
              style={{ textDecoration: 'none' }}
            >
              Export .xlsx
            </a>
          </div>
        </div>
      </div>

      {resolved?.success ? (
        <section className="success-banner" aria-label="Route standard action">
          <p>{resolved.success}</p>
        </section>
      ) : null}
      {resolved?.error ? (
        <section className="warning-banner" aria-label="Route standard action error">
          <p className="form-error">{resolved.error}</p>
        </section>
      ) : null}

      <RouteStandardBootstrapPanel />

      <RouteStandardRefinementPanel />

      <RouteStandardImportPanel />

      <section
        style={{
          background: '#ffffff',
          border: '1px solid #e4e7ec',
          borderRadius: 10,
          padding: '1rem',
          marginBottom: '1rem',
        }}
      >
        <h2 style={{ marginTop: 0 }}>Add route standard</h2>
        <p style={{ color: '#667085', marginTop: 0, fontSize: '0.88rem' }}>
          Each route standard is uniquely identified by its <code>routeCode</code> — use the existing touring-route or
          transfer-route operational code (e.g., <code>AMM_PET</code>). Codes are normalized to UPPER_SNAKE on save.
        </p>
        <form
          method="POST"
          action="/api/route-standards"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Route code *</span>
            <input name="routeCode" required placeholder="AMM_PET" style={{ fontFamily: 'monospace' }} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Route name *</span>
            <input name="routeName" required placeholder="Amman to Petra" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>From city</span>
            <input name="fromCity" placeholder="Amman" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>To city</span>
            <input name="toCity" placeholder="Petra" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Distance (km)</span>
            <input name="standardDistanceKm" type="number" step="0.1" placeholder="235" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Duration (hours)</span>
            <input name="standardDurationHours" type="number" step="0.1" placeholder="3.5" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Buffer (min)</span>
            <input name="operationalBufferMinutes" type="number" step="5" placeholder="30" />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', gridColumn: '1 / -1' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Notes</span>
            <input name="notes" placeholder="Operational notes (e.g., construction zone, restroom stop suggested)" />
          </label>
          <div style={{ gridColumn: '1 / -1' }}>
            <button type="submit" className="primary-button">Add route standard</button>
          </div>
        </form>
      </section>

      <section style={{ background: '#ffffff', border: '1px solid #e4e7ec', borderRadius: 10, padding: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>
          {activeCount} active / {standards.length} total
        </h2>
        {standards.length === 0 ? (
          <p style={{ color: '#667085' }}>
            No route standards yet. Add one above, or import a workbook to seed the catalog in bulk.
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>Code</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>Name</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>From → To</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec', textAlign: 'right' }}>Distance</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec', textAlign: 'right' }}>Duration</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec', textAlign: 'right' }}>Buffer</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>Confidence</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>Active</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}></th>
                </tr>
              </thead>
              <tbody>
                {standards.map((s) => {
                  const confidence = computeTimingConfidenceLabel(s);
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid #f2f4f7' }}>
                      <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>
                        <strong>{s.routeCode}</strong>
                        {/* Cleanup Phase v1 — canonical FROM_TO code chip
                            sits right next to the legacy code so operators
                            can read both. The legacy column is the historical
                            identifier (kept for lookup compatibility); the
                            canonical code is the operational truth. */}
                        {s.canonicalRouteCode && s.canonicalRouteCode !== s.routeCode ? (
                          <span
                            style={{
                              marginLeft: '0.4rem',
                              background: '#fcfaf5',
                              color: '#7a5c2e',
                              border: '1px solid #e2dccc',
                              padding: '0.05rem 0.45rem',
                              borderRadius: 999,
                              fontSize: '0.7rem',
                              fontWeight: 700,
                              fontFamily: 'monospace',
                            }}
                            title="Canonical FROM_TO operational code. Vouchers and dispatch render this; legacy quote items still resolve via the long code."
                          >
                            {s.canonicalRouteCode}
                          </span>
                        ) : null}
                        {s.suspiciousDurationFlag ? (
                          <span
                            style={{
                              marginLeft: '0.4rem',
                              background: '#fbf6ea',
                              color: '#8b5e34',
                              padding: '0.05rem 0.4rem',
                              borderRadius: 999,
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              fontFamily: 'inherit',
                              textTransform: 'uppercase',
                            }}
                            title="Inherited duration looks like an excursion day length rather than realistic transfer time. Refine before dispatch trusts the timing."
                          >
                            Suspicious
                          </span>
                        ) : null}
                        {s.reviewStatus === 'REVIEW_REQUIRED' ? (
                          <span
                            style={{
                              marginLeft: '0.4rem',
                              background: '#fbf2f2',
                              color: '#7a4242',
                              padding: '0.05rem 0.4rem',
                              borderRadius: 999,
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              fontFamily: 'inherit',
                              textTransform: 'uppercase',
                            }}
                          >
                            Review
                          </span>
                        ) : s.reviewStatus === 'VERIFIED' ? (
                          <span
                            style={{
                              marginLeft: '0.4rem',
                              background: '#ecfdf3',
                              color: '#067647',
                              padding: '0.05rem 0.4rem',
                              borderRadius: 999,
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              fontFamily: 'inherit',
                              textTransform: 'uppercase',
                            }}
                          >
                            Verified
                          </span>
                        ) : null}
                        {s.source === 'AUTO_BOOTSTRAP' && s.reviewStatus !== 'REVIEW_REQUIRED' && s.reviewStatus !== 'VERIFIED' && s.reviewStatus !== 'CANONICALIZED' ? (
                          <span
                            style={{
                              marginLeft: '0.4rem',
                              background: '#f5f8f5',
                              color: '#3a5a3a',
                              padding: '0.05rem 0.4rem',
                              borderRadius: 999,
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              fontFamily: 'inherit',
                              textTransform: 'uppercase',
                            }}
                            title="Auto-generated from existing route data. Refine distance/duration/risk flags as needed."
                          >
                            Auto draft
                          </span>
                        ) : s.source === 'IMPORTED' ? (
                          <span
                            style={{
                              marginLeft: '0.4rem',
                              background: '#f0f4f8',
                              color: '#475467',
                              padding: '0.05rem 0.4rem',
                              borderRadius: 999,
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              letterSpacing: '0.04em',
                              fontFamily: 'inherit',
                              textTransform: 'uppercase',
                            }}
                          >
                            Imported
                          </span>
                        ) : null}
                      </td>
                      <td style={{ padding: '0.5rem' }}>{s.routeName}</td>
                      <td style={{ padding: '0.5rem', color: '#475467' }}>
                        {s.fromCity || <em style={{ color: '#98a2b3' }}>—</em>}
                        {s.toCity ? ` → ${s.toCity}` : s.destinationArea ? ` → ${s.destinationArea}` : ''}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {s.standardDistanceKm !== null ? `${s.standardDistanceKm} km` : <em style={{ color: '#98a2b3' }}>—</em>}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {s.standardDurationHours !== null ? `${s.standardDurationHours} h` : <em style={{ color: '#98a2b3' }}>—</em>}
                      </td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {s.operationalBufferMinutes !== null ? `${s.operationalBufferMinutes} min` : <em style={{ color: '#98a2b3' }}>—</em>}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <span
                          style={{
                            background: confidence.bg,
                            color: confidence.text,
                            padding: '0.1rem 0.5rem',
                            borderRadius: 999,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                          title={confidence.detail}
                        >
                          {confidence.label}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <span
                          style={{
                            background: s.isActive ? '#ecfdf3' : '#f2f4f7',
                            color: s.isActive ? '#067647' : '#475467',
                            padding: '0.1rem 0.5rem',
                            borderRadius: 999,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                          }}
                        >
                          {s.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <Link href={`/route-standards/${s.id}`} className="secondary-button" style={{ fontSize: '0.78rem' }}>
                          Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
