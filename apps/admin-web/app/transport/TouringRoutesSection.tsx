import { adminPageFetchJson } from '../lib/admin-server';

type TouringRoute = {
  id: string;
  code: string;
  name: string;
  startCity: string;
  durationDays: number;
  routeDescription?: string | null;
  mainDestinations?: string[] | null;
  includedKm?: number | null;
  includedHours?: number | null;
  active?: boolean;
  stops?: Array<{ id: string; order: number; city: string; location?: string | null; notes?: string | null }>;
  pricings?: Array<{
    id: string;
    pricingBasis: string;
    minPax: number;
    maxPax: number;
    currency: string;
    baseCost: number;
    costPerDay?: number | null;
    extraKmRate?: number | null;
    extraHourRate?: number | null;
    active?: boolean;
    supplier?: { name?: string | null } | null;
    vehicle?: { name?: string | null; vehicleType?: string | null } | null;
  }>;
};

const API_BASE_URL = '/api';

function formatDestinations(route: TouringRoute) {
  const destinations = Array.isArray(route.mainDestinations) ? route.mainDestinations.filter(Boolean) : [];
  if (destinations.length > 0) return destinations.join(' / ');
  const stops = route.stops?.map((stop) => stop.location || stop.city).filter(Boolean) || [];
  return stops.length > 0 ? stops.join(' / ') : route.startCity;
}

function formatPricing(route: TouringRoute) {
  const activePricing = (route.pricings || []).filter((pricing) => pricing.active !== false);
  if (activePricing.length === 0) return 'Pricing pending';
  const first = activePricing[0];
  return `${first.currency} ${Number(first.baseCost || 0).toFixed(2)} ${first.pricingBasis === 'PER_DAY' ? 'per day' : 'per vehicle'}`;
}

export async function TouringRoutesSection() {
  const touringRoutes = await adminPageFetchJson<TouringRoute[]>(`${API_BASE_URL}/touring-routes?limit=200`, 'Touring route catalog', {
    cache: 'no-store',
  });

  return (
    <section className="workspace-section">
      <div className="section-heading-row">
        <div>
          <p className="eyebrow">Touring route inventory</p>
          <h3>Reusable touring routes</h3>
          <p className="detail-copy">Multi-stop and multi-day transport programs that are not stored as fake transfer routes.</p>
        </div>
      </div>

      {touringRoutes.length === 0 ? (
        <p className="empty-state">No touring routes have been created yet. Import detection will classify tour/program rows separately from transfers.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Route</th>
                <th>Start city</th>
                <th>Duration</th>
                <th>Main destinations</th>
                <th>Included</th>
                <th>Pricing</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {touringRoutes.map((route) => (
                <tr key={route.id}>
                  <td>{route.code}</td>
                  <td>
                    <strong>{route.name}</strong>
                    {route.routeDescription ? <div className="table-subcopy">{route.routeDescription}</div> : null}
                  </td>
                  <td>{route.startCity}</td>
                  <td>{route.durationDays} day{route.durationDays === 1 ? '' : 's'}</td>
                  <td>{formatDestinations(route)}</td>
                  <td>
                    {[
                      route.includedKm ? `${route.includedKm} km` : null,
                      route.includedHours ? `${route.includedHours} hours` : null,
                    ].filter(Boolean).join(' / ') || 'Not set'}
                  </td>
                  <td>{formatPricing(route)}</td>
                  <td>
                    <span className="status-badge">{route.active === false ? 'Inactive' : 'Active'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
