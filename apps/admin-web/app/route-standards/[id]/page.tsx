import Link from 'next/link';
import { adminPageFetchJson } from '../../lib/admin-server';
import { AdminBreadcrumbs } from '../../components/AdminBreadcrumbs';
import { RouteStandardEditor } from './RouteStandardEditor';

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
            <p className="admin-muted-copy">
              <code>{standard.routeCode}</code> — canonical operational standard for distance, duration, buffer, and risk flags.
            </p>
          </div>
          <Link href="/route-standards" className="secondary-button">
            ← Back to list
          </Link>
        </div>
      </div>

      <RouteStandardEditor standard={standard} />
    </main>
  );
}
