import Link from 'next/link';
import { adminPageFetchJson } from '../../lib/admin-server';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { RouteStandardEditor } from './RouteStandardEditor';
import { CanonicalBuilderSection } from './CanonicalBuilderSection';

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
  createdAt: string;
  updatedAt: string;
  canonicalRouteCode: string | null;
  reviewStatus: string | null;
  suspiciousDurationFlag: boolean;
};

export default async function RouteStandardEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const standard = await adminPageFetchJson<RouteStandard>(`/api/route-standards/${id}`, 'Route standard', { cache: 'no-store' });

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs
          items={[
            { label: 'Product Catalog' },
            { label: 'Route Standards', href: '/route-standards' },
            { label: standard.routeCode },
          ]}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ marginBottom: '0.25rem' }}>{standard.routeName}</h1>
            {/* Canonical first — that's the operational truth. Legacy
                routeCode is shown as a quieter secondary line for
                lookup compatibility (old quote items / vouchers /
                dispatch references still resolve via it). */}
            {standard.canonicalRouteCode ? (
              <>
                <p style={{ margin: '0.1rem 0', fontSize: '0.95rem', color: '#475467' }}>
                  Operational code:{' '}
                  <code
                    style={{
                      background: '#f0f9ff',
                      color: '#0c4a6e',
                      padding: '0.1rem 0.5rem',
                      borderRadius: 6,
                      fontWeight: 700,
                      fontSize: '1rem',
                    }}
                  >
                    {standard.canonicalRouteCode}
                  </code>
                </p>
                <p className="admin-muted-copy" style={{ fontSize: '0.78rem', marginTop: '0.2rem' }}>
                  Legacy code: <code style={{ color: '#98a2b3' }}>{standard.routeCode}</code> — preserved for backward
                  lookup compatibility. Quote items / vouchers / dispatch references that captured this code still resolve.
                </p>
              </>
            ) : (
              <p className="admin-muted-copy">
                <code>{standard.routeCode}</code> — canonical operational standard for distance, duration, buffer, and risk flags.
              </p>
            )}
          </div>
          <Link href="/route-standards" className="secondary-button">
            ← Back to list
          </Link>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '1rem' }}>
        <CanonicalBuilderSection
          standardId={standard.id}
          currentRouteCode={standard.routeCode}
          currentCanonicalRouteCode={standard.canonicalRouteCode}
          currentFromCity={standard.fromCity}
          currentToCity={standard.toCity}
          currentStandardDistanceKm={standard.standardDistanceKm}
          currentStandardDurationHours={standard.standardDurationHours}
          currentOperationalBufferMinutes={standard.operationalBufferMinutes}
          currentNotes={standard.notes}
        />
        <RouteStandardEditor standard={standard} />
      </div>
    </main>
  );
}
