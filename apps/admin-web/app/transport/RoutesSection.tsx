import { CityOption } from '../lib/cities';
import { PlaceTypeOption } from '../lib/placeTypes';
import { PlaceOption } from '../lib/places';
import { RouteOption } from '../lib/routes';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { TableSectionShell } from '../components/TableSectionShell';
import { RoutesForm } from '../routes/RoutesForm';
import { RoutesCatalogBrowser } from './RoutesCatalogBrowser';

const API_BASE_URL = ADMIN_API_BASE_URL;

async function getPlaces(): Promise<PlaceOption[]> {
  return adminPageFetchJson<PlaceOption[]>(`${API_BASE_URL}/places`, 'Transport places', {
    cache: 'no-store',
  });
}

async function getRoutes(): Promise<RouteOption[]> {
  return adminPageFetchJson<RouteOption[]>(`${API_BASE_URL}/routes`, 'Transport routes', {
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

export async function RoutesSection() {
  const [places, routes, cities, placeTypes] = await Promise.all([getPlaces(), getRoutes(), getCities(), getPlaceTypes()]);

  return (
    <TableSectionShell
      title="Route Library"
      description="Central route records let transport pricing and quote workflows reuse the same transfer definitions instead of repeating from and to combinations by hand."
      context={<p>{routes.length} routes in scope</p>}
      createPanel={
        <CollapsibleCreatePanel title="Create route" description="Add reusable transport routes with saved place pairs." triggerLabelOpen="Add route">
          <RoutesForm apiBaseUrl={API_BASE_URL} places={places} cities={cities} placeTypes={placeTypes} />
        </CollapsibleCreatePanel>
      }
      emptyState={routes.length === 0 ? <p className="empty-state">No routes yet.</p> : undefined}
    >
      {routes.length > 0 ? <RoutesCatalogBrowser routes={routes} /> : null}
    </TableSectionShell>
  );
}
