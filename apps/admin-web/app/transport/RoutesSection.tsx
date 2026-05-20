import { CityOption } from '../lib/cities';
import { PlaceTypeOption } from '../lib/placeTypes';
import { PlaceOption } from '../lib/places';
import { RouteOption } from '../lib/routes';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { TableSectionShell } from '../components/TableSectionShell';
import { RoutesForm } from '../routes/RoutesForm';
import { RoutesTable } from './RoutesTable';

const API_BASE_URL = ADMIN_API_BASE_URL;
const ACTION_API_BASE_URL = '/api';

async function getPlaces(includeIds: string[] = []): Promise<PlaceOption[]> {
  const uniqueIncludeIds = Array.from(new Set(includeIds.filter(Boolean)));
  const includeQuery = uniqueIncludeIds.length > 0 ? `&includeIds=${encodeURIComponent(uniqueIncludeIds.join(','))}` : '';
  return adminPageFetchJson<PlaceOption[]>(`${API_BASE_URL}/places?selector=true${includeQuery}`, 'Transport places', {
    cache: 'no-store',
  });
}

async function getRoutes(showLegacyRoutes = false): Promise<RouteOption[]> {
  const legacyQuery = showLegacyRoutes ? '&includeLegacy=true' : '';
  return adminPageFetchJson<RouteOption[]>(`${API_BASE_URL}/routes?type=TRANSFER_ROUTE${legacyQuery}`, 'Transfer routes', {
    cache: 'no-store',
  });
}

async function getCities(): Promise<CityOption[]> {
  return adminPageFetchJson<CityOption[]>(`${API_BASE_URL}/cities?active=true`, 'Transport active cities', {
    cache: 'no-store',
  });
}

async function getPlaceTypes(): Promise<PlaceTypeOption[]> {
  return adminPageFetchJson<PlaceTypeOption[]>(`${API_BASE_URL}/place-types?active=true`, 'Transport active place types', {
    cache: 'no-store',
  });
}

type RoutesSectionProps = {
  showLegacyRoutes?: boolean;
};

export async function RoutesSection({ showLegacyRoutes = false }: RoutesSectionProps = {}) {
  const [routes, cities, placeTypes] = await Promise.all([getRoutes(showLegacyRoutes), getCities(), getPlaceTypes()]);
  const routePlaceIds = routes.flatMap((route) => [route.fromPlaceId, route.toPlaceId]).filter(Boolean);
  const places = await getPlaces(routePlaceIds);
  const canonicalCount = routes.filter((route) => route.isCanonicalTransferRoute).length;

  return (
    <TableSectionShell
      title="Transfer Routes"
      description="Transfer route records define pure movement from one place to another. Pricing modes such as full day, half day, extra km, waiting time, and supplements belong in supplier rate cards."
      context={
        <div className="table-section-context-stack">
          <p>
            {routes.length} transfer routes in scope - {canonicalCount} canonical. Standardized places keep transfer routes, supplier rates, and quotes aligned.
          </p>
          <a className="secondary-button" href={showLegacyRoutes ? '/transport?tab=routes' : '/transport?tab=routes&showLegacyRoutes=true'}>
            {showLegacyRoutes ? 'Canonical only' : 'Show legacy routes'}
          </a>
        </div>
      }
      createPanel={
        <CollapsibleCreatePanel title="Create transfer route" description="Add reusable transfer routes with saved place pairs." triggerLabelOpen="Add transfer route">
          <RoutesForm apiBaseUrl={ACTION_API_BASE_URL} places={places} cities={cities} placeTypes={placeTypes} />
        </CollapsibleCreatePanel>
      }
      emptyState={routes.length === 0 ? <p className="empty-state">No transfer routes yet.</p> : undefined}
    >
      {routes.length > 0 ? <RoutesTable apiBaseUrl={ACTION_API_BASE_URL} routes={routes} places={places} cities={cities} placeTypes={placeTypes} /> : null}
    </TableSectionShell>
  );
}
