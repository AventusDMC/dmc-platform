import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';
import { AdminBreadcrumbs } from '../components/AdminBreadcrumbs';
import { OperationalAreasManager } from './OperationalAreasManager';

export const dynamic = 'force-dynamic';

type OperationalArea = {
  id: string;
  code: string;
  name: string;
  type: string;
  city: string;
  region: string | null;
  country: string;
  isActive: boolean;
  airportRouteFlagDefault: boolean;
  borderCrossingFlagDefault: boolean;
  mountainRoadFlagDefault: boolean;
  overnightRiskDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

async function loadAreas(): Promise<OperationalArea[]> {
  try {
    return await adminPageFetchJson<OperationalArea[]>(
      '/api/operational-areas',
      'Operational areas',
      { cache: 'no-store' },
    );
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error('[operational-areas] list unavailable', error);
    return [];
  }
}

export default async function OperationalAreasPage() {
  const areas = await loadAreas();
  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs items={[{ label: 'Product Catalog' }, { label: 'Operational Areas' }]} />
        <h1>Operational Areas</h1>
        <p className="admin-muted-copy">
          Canonical dictionary of operational movement endpoints — cities, airports, borders,
          tourism sites, camp areas, resort areas, ports, hotel zones. Drives the Route Builder's
          FROM_TO canonical code generator and is consumed by Route Standards, Touring Routes,
          Dispatch, Transfers, and Excursion composition. Codes (AMM, QAIA, PET, …) must be unique.
        </p>
      </div>
      <OperationalAreasManager initialAreas={areas} />
    </main>
  );
}
