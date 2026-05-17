import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ModuleSwitcher } from '../../../components/ModuleSwitcher';
import { SummaryStrip } from '../../../components/SummaryStrip';
import { WorkspaceShell } from '../../../components/WorkspaceShell';
import { adminPageFetchJson } from '../../../lib/admin-server';
import { TouringRouteEditor } from './TouringRouteEditor';
import type { TouringRouteCatalogs, TouringRouteDetail } from '../types';

export const dynamic = 'force-dynamic';

type TouringRoutePageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ mode?: string }>;
};

async function getRoute(id: string) {
  return adminPageFetchJson<TouringRouteDetail | null>(`/api/touring-routes/${encodeURIComponent(id)}`, 'Touring route detail', {
    cache: 'no-store',
    allow404: true,
  });
}

async function getCatalogs(): Promise<TouringRouteCatalogs> {
  const [suppliers, vehicles, transportServiceTypes] = await Promise.all([
    adminPageFetchJson<TouringRouteCatalogs['suppliers']>('/api/suppliers?type=transport', 'Transport supplier catalog', { cache: 'no-store' }),
    adminPageFetchJson<TouringRouteCatalogs['vehicles']>('/api/vehicles', 'Vehicle catalog', { cache: 'no-store' }),
    adminPageFetchJson<TouringRouteCatalogs['transportServiceTypes']>('/api/transport-service-types', 'Transport service type catalog', {
      cache: 'no-store',
    }),
  ]);
  return { suppliers, vehicles, transportServiceTypes };
}

function formatDestinations(route: TouringRouteDetail) {
  const destinations = Array.isArray(route.mainDestinations) ? route.mainDestinations.filter(Boolean) : [];
  return destinations.length > 0 ? destinations.join(' / ') : 'Destinations pending';
}

function countSupplierMappings(route: TouringRouteDetail) {
  const pricings = route.pricings || [];
  return `${pricings.filter((pricing) => pricing.supplierId || pricing.supplier?.id).length}/${pricings.length}`;
}

function formatValidity(pricing: NonNullable<TouringRouteDetail['pricings']>[number]) {
  return `${pricing.validFrom ? String(pricing.validFrom).slice(0, 10) : 'Open'} - ${pricing.validTo ? String(pricing.validTo).slice(0, 10) : 'Open'}`;
}

export default async function TouringRouteDetailPage({ params, searchParams }: TouringRoutePageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const [route, catalogs] = await Promise.all([getRoute(id), getCatalogs()]);

  if (!route) {
    notFound();
  }

  const activePricing = (route.pricings || []).filter((pricing) => pricing.active !== false);
  const warnings = [
    (route.stops || []).length === 0 ? 'No stops are defined.' : '',
    activePricing.length === 0 ? 'No active vehicle pricing rows.' : '',
    activePricing.some((pricing) => !(pricing.supplierId || pricing.supplier?.id)) ? 'One or more active pricing rows has no supplier mapping.' : '',
    route.durationDays > 1 && !(route.stops || []).some((stop) => /overnight/i.test(stop.notes || '')) ? 'Multi-day route has no overnight marker.' : '',
  ].filter(Boolean);

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <WorkspaceShell
          eyebrow="Touring Routes"
          title={route.name}
          description="Operational circuit inventory for touring programs. This is separate from point-to-point transfer routes."
          switcher={
            <ModuleSwitcher
              ariaLabel="Transport modules"
              activeId="touring-routes"
              items={[
                { id: 'routes', label: 'Transfer Routes', href: '/transport?tab=routes', helper: 'Transfer route library' },
                { id: 'touring-routes', label: 'Touring Routes', href: '/transport?tab=touring-routes', helper: 'Operational tours' },
                { id: 'rates', label: 'Supplier Rate Cards', href: '/transport?tab=rates', helper: 'Supplier contracts' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'code', label: 'Code', value: route.code, helper: route.active === false ? 'Archived' : 'Active' },
                { id: 'origin', label: 'Origin', value: route.startCity || 'Pending', helper: 'Start city' },
                { id: 'duration', label: 'Duration', value: `${route.durationDays} day${route.durationDays === 1 ? '' : 's'}`, helper: 'Operational length' },
                { id: 'stops', label: 'Stops', value: String(route.stops?.length || 0), helper: formatDestinations(route) },
                { id: 'pricing', label: 'Pricing rows', value: String(route.pricings?.length || 0), helper: `${countSupplierMappings(route)} suppliers mapped` },
              ]}
            />
          }
        >
          <section className="section-stack">
            <div className="button-row">
              <Link className="secondary-button" href="/transport?tab=touring-routes">
                Back to Touring Routes
              </Link>
              <Link className="button" href={`/transport/touring-routes/${encodeURIComponent(route.id)}?mode=edit#edit`}>
                Edit
              </Link>
            </div>

            <section className="workspace-section">
              <h3>Route detail</h3>
              <div className="summary-strip">
                <article><span>Origin / start city</span><strong>{route.startCity}</strong></article>
                <article><span>Main destinations</span><strong>{formatDestinations(route)}</strong></article>
                <article><span>Included</span><strong>{[route.includedKm ? `${route.includedKm} km` : null, route.includedHours ? `${route.includedHours} hours` : null].filter(Boolean).join(' / ') || 'Not set'}</strong></article>
                <article><span>Status</span><strong>{route.active === false ? 'Archived' : 'Active'}</strong></article>
              </div>
              {route.routeDescription ? <p className="detail-copy">{route.routeDescription}</p> : null}
            </section>

            <section className="workspace-section">
              <h3>Stops</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Order</th><th>City</th><th>Stop</th><th>Overnight</th><th>Notes</th></tr></thead>
                  <tbody>
                    {(route.stops || []).map((stop) => (
                      <tr key={stop.id}>
                        <td>{stop.order}</td>
                        <td>{stop.city}</td>
                        <td>{stop.location || stop.city}</td>
                        <td>{/overnight/i.test(stop.notes || '') ? 'Yes' : 'No'}</td>
                        <td>{stop.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="workspace-section">
              <h3>Vehicle pricing</h3>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Supplier</th><th>Vehicle</th><th>Basis</th><th>Pax</th><th>Cost</th><th>Validity</th><th>Status</th></tr></thead>
                  <tbody>
                    {(route.pricings || []).map((pricing) => (
                      <tr key={pricing.id}>
                        <td>{pricing.supplier?.name || 'Supplier mapping pending'}</td>
                        <td>{pricing.vehicle?.name || 'Vehicle pending'}</td>
                        <td>{pricing.pricingBasis}</td>
                        <td>{pricing.minPax}-{pricing.maxPax}</td>
                        <td>{pricing.currency} {Number(pricing.baseCost || 0).toFixed(2)}</td>
                        <td>{formatValidity(pricing)}</td>
                        <td><span className="status-badge">{pricing.active === false ? 'Inactive' : 'Active'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="workspace-section">
              <h3>Operational warnings</h3>
              {warnings.length > 0 ? warnings.map((warning) => <p className="form-helper" key={warning}>{warning}</p>) : <p className="form-success">No operational warnings detected.</p>}
            </section>

            {resolvedSearchParams.mode === 'edit' ? <TouringRouteEditor route={route} catalogs={catalogs} /> : null}
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
