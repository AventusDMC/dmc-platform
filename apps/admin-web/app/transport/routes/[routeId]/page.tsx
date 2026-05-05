import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminPageTabs } from '../../../components/AdminPageTabs';
import { SummaryStrip } from '../../../components/SummaryStrip';
import { WorkspaceShell } from '../../../components/WorkspaceShell';
import { adminPageFetchJson } from '../../../lib/admin-server';
import { RouteOption } from '../../../lib/routes';
import { isSuspiciousPricingRoute } from '../../../lib/transport-routes';
import { TransportPricingRulesSection } from '../../TransportPricingRulesSection';
import { VehicleRatesSection } from '../../VehicleRatesSection';
import { VehiclesSection } from '../../VehiclesSection';

export const dynamic = 'force-dynamic';

const API_BASE_URL = '/api';

type RouteWorkspaceTab = 'overview' | 'available-vehicles' | 'pricing-rules' | 'supplier-rate-cards';

type RouteWorkspacePageProps = {
  params: Promise<{
    routeId: string;
  }>;
  searchParams?: Promise<{
    tab?: string;
  }>;
};

const ROUTE_WORKSPACE_TABS: Array<{ id: RouteWorkspaceTab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'available-vehicles', label: 'Available Vehicles' },
  { id: 'pricing-rules', label: 'Pricing Rules' },
  { id: 'supplier-rate-cards', label: 'Supplier Rate Cards' },
];

function resolveActiveTab(tab?: string): RouteWorkspaceTab {
  return ROUTE_WORKSPACE_TABS.some((entry) => entry.id === tab) ? (tab as RouteWorkspaceTab) : 'overview';
}

async function getRoutes(): Promise<RouteOption[]> {
  return adminPageFetchJson<RouteOption[]>(`${API_BASE_URL}/routes`, 'Transport route workspace routes', {
    cache: 'no-store',
  });
}

function formatDistance(value: number | null) {
  return value === null ? '—' : `${value} km`;
}

function formatDuration(value: number | null) {
  return value === null ? '—' : `${value} min`;
}

function formatPlace(route: RouteOption, key: 'fromPlace' | 'toPlace') {
  const place = route[key];
  return place.city ? `${place.name}, ${place.city}` : place.name;
}

export default async function TransportRouteWorkspacePage({ params, searchParams }: RouteWorkspacePageProps) {
  const [{ routeId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const activeTab = resolveActiveTab(resolvedSearchParams?.tab);
  const routes = await getRoutes();
  const route = routes.find((entry) => entry.id === routeId);

  if (!route) {
    notFound();
  }

  const tabs = ROUTE_WORKSPACE_TABS.map((tab) => ({
    id: tab.id,
    label: tab.label,
    href: `/transport/routes/${route.id}?tab=${tab.id}`,
  }));
  const suspiciousPricingRoute = isSuspiciousPricingRoute(route);

  return (
    <main className={`page ${activeTab === 'supplier-rate-cards' ? 'transport-contracts-page' : ''}`}>
      <section className="panel workspace-panel workspace-panel-wide">
        <WorkspaceShell
          eyebrow="Transport Route"
          title={route.name || `${route.fromPlace.name} → ${route.toPlace.name}`}
          description={`${formatPlace(route, 'fromPlace')} | ${formatPlace(route, 'toPlace')}`}
          switcher={<AdminPageTabs ariaLabel="Transport route workspace sections" activeTab={activeTab} tabs={tabs} />}
          summary={
            <SummaryStrip
              items={[
                { id: 'from', label: 'From', value: route.fromPlace.name, helper: route.fromPlace.city || 'Origin' },
                { id: 'to', label: 'To', value: route.toPlace.name, helper: route.toPlace.city || 'Destination' },
                { id: 'type', label: 'Route type', value: route.routeType || '—', helper: route.isActive ? 'Active' : 'Inactive' },
                { id: 'duration', label: 'Duration', value: formatDuration(route.durationMinutes), helper: formatDistance(route.distanceKm) },
              ]}
            />
          }
        >
          <section className="section-stack">
            {activeTab === 'overview' ? (
              <div className="section-stack">
                <section className="detail-card">
                  <div className="workspace-section-head">
                    <div>
                      <p className="eyebrow">Route details</p>
                      <h2>
                        {route.name}
                        {suspiciousPricingRoute ? <span className="page-tab-badge page-tab-badge-warning">Pricing item?</span> : null}
                      </h2>
                      <p className="detail-copy">
                        Routes define movement only. Pricing modes such as full day, half day, extra km, waiting time, and supplements belong in supplier rate cards.
                      </p>
                    </div>
                    <Link href="/transport?tab=routes" className="secondary-button">
                      Back to routes
                    </Link>
                  </div>

                  <div className="quote-preview-total-list">
                    <div>
                      <span>From</span>
                      <strong>{formatPlace(route, 'fromPlace')}</strong>
                    </div>
                    <div>
                      <span>To</span>
                      <strong>{formatPlace(route, 'toPlace')}</strong>
                    </div>
                    <div>
                      <span>Route type</span>
                      <strong>{route.routeType || '—'}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>{route.isActive ? 'Active' : 'Inactive'}</strong>
                    </div>
                    <div>
                      <span>Duration</span>
                      <strong>{formatDuration(route.durationMinutes)}</strong>
                    </div>
                    <div>
                      <span>Distance</span>
                      <strong>{formatDistance(route.distanceKm)}</strong>
                    </div>
                  </div>

                  {route.notes ? <p className="detail-copy">{route.notes}</p> : null}
                </section>
              </div>
            ) : null}

            {activeTab === 'available-vehicles' ? (
              <VehiclesSection
                title="Available Vehicles"
                description="Vehicle availability is not route-specific yet, so this workspace shows the reusable fleet safely."
              />
            ) : null}
            {activeTab === 'pricing-rules' ? (
              <TransportPricingRulesSection
                routeId={route.id}
                title="Pricing Rules"
                description="Pricing rules linked to this route."
              />
            ) : null}
            {activeTab === 'supplier-rate-cards' ? (
              <VehicleRatesSection
                routeId={route.id}
                showServiceTypes={false}
                title="Supplier Rate Cards"
                description="Supplier rate-card lines linked to this route when available; otherwise the saved rate-card library remains visible."
              />
            ) : null}
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
