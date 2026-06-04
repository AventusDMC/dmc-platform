import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';
import { AdminBreadcrumbs } from '../components/AdminBreadcrumbs';
import { PointsOfInterestManager, type PointOfInterest, type PoiLinkOption } from './PointsOfInterestManager';

export const dynamic = 'force-dynamic';

async function loadList<T>(path: string, label: string): Promise<T[]> {
  try {
    return await adminPageFetchJson<T[]>(path, label, { cache: 'no-store' });
  } catch (error) {
    if (isNextRedirectError(error)) throw error;
    console.error(`[points-of-interest] ${label} unavailable`, error);
    return [];
  }
}

type RawCity = { id: string; name: string; country?: string | null };
type RawArea = { id: string; code: string; name: string; type?: string | null };
type RawActivity = { id: string; name: string };

export default async function PointsOfInterestPage() {
  const [pois, cities, areas, activities] = await Promise.all([
    loadList<PointOfInterest>('/api/points-of-interest', 'Points of interest'),
    loadList<RawCity>('/api/cities', 'Cities'),
    loadList<RawArea>('/api/operational-areas', 'Operational areas'),
    loadList<RawActivity>('/api/activities', 'Activities'),
  ]);

  const cityOptions: PoiLinkOption[] = cities.map((city) => ({
    id: city.id,
    label: city.country ? `${city.name} (${city.country})` : city.name,
  }));
  const areaOptions: PoiLinkOption[] = areas.map((area) => ({
    id: area.id,
    label: `${area.code} — ${area.name}${area.type ? ` · ${area.type}` : ''}`,
  }));
  const activityOptions: PoiLinkOption[] = activities.map((activity) => ({ id: activity.id, label: activity.name }));

  return (
    <main className="admin-page-shell">
      <div className="admin-page-heading">
        <AdminBreadcrumbs items={[{ label: 'Product Catalog' }, { label: 'Points of Interest' }]} />
        <h1>Points of Interest</h1>
        <p className="admin-muted-copy">
          Reusable sightseeing-content library. Each point of interest owns client-facing content in
          English, Portuguese, Spanish and Arabic plus sightseeing metadata, and links out to the
          existing City, Operational Area and Activity masters (no duplicated pricing). Itineraries
          will reuse this content instead of re-writing descriptions per quote.
        </p>
      </div>
      <PointsOfInterestManager
        initialPois={pois}
        cityOptions={cityOptions}
        areaOptions={areaOptions}
        activityOptions={activityOptions}
      />
    </main>
  );
}
