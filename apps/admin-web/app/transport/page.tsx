import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { SummaryStrip } from '../components/SummaryStrip';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';
import { RoutesSection } from './RoutesSection';
import { TransportPricingRulesSection } from './TransportPricingRulesSection';
import { VehicleRatesSection } from './VehicleRatesSection';
import { VehiclesSection } from './VehiclesSection';

export const dynamic = 'force-dynamic';

type TransportTab = 'vehicles' | 'routes' | 'pricing-rules' | 'rates';
const API_BASE_URL = '/api';

type TransportPageProps = {
  searchParams?: Promise<{
    tab?: string;
  }>;
};

const TRANSPORT_TABS: Array<{ id: TransportTab; label: string }> = [
  { id: 'vehicles', label: 'Vehicles' },
  { id: 'routes', label: 'Routes' },
  { id: 'pricing-rules', label: 'Pricing Rules' },
  { id: 'rates', label: 'Rates' },
];

async function getVehiclesCount() {
  const vehicles = await adminPageFetchJson<Array<{ id: string }>>(`${API_BASE_URL}/vehicles`, 'Transport vehicles', { cache: 'no-store' });
  return vehicles.length;
}

async function getRoutesCount() {
  const routes = await adminPageFetchJson<Array<{ id: string; isActive?: boolean }>>(`${API_BASE_URL}/routes`, 'Transport routes', { cache: 'no-store' });
  return {
    total: routes.length,
    active: routes.filter((route) => route.isActive !== false).length,
  };
}

async function getTransportSummary() {
  const [vehicles, routesResponse, serviceTypes, pricingRules, vehicleRates] = await Promise.all([
    getVehiclesCount(),
    getRoutesCount(),
    adminPageFetchJson<Array<{ id: string }>>(`${API_BASE_URL}/transport-service-types`, 'Transport service types', { cache: 'no-store' }),
    adminPageFetchJson<Array<{ id: string }>>(`${API_BASE_URL}/transport-pricing/rules`, 'Transport pricing rules', { cache: 'no-store' }),
    adminPageFetchJson<Array<{ id: string }>>(`${API_BASE_URL}/vehicle-rates`, 'Transport vehicle rates', { cache: 'no-store' }),
  ]);

  return {
    vehicles,
    routes: routesResponse,
    serviceTypes: serviceTypes.length,
    pricingRules: pricingRules.length,
    vehicleRates: vehicleRates.length,
  };
}

function resolveActiveTab(tab?: string): TransportTab {
  return TRANSPORT_TABS.some((entry) => entry.id === tab) ? (tab as TransportTab) : 'vehicles';
}

export default async function TransportPage({ searchParams }: TransportPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeTab = resolveActiveTab(resolvedSearchParams?.tab);
  const summary = await getTransportSummary().catch((error) => {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error('[transport] summary unavailable', error);
    return {
      vehicles: 0,
      routes: { total: 0, active: 0 },
      serviceTypes: 0,
      pricingRules: 0,
      vehicleRates: 0,
    };
  });

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <WorkspaceShell
          eyebrow="Products & Pricing"
          title="Transport"
          description="Keep fleet, routing, pricing rules, and published rates inside one transport workspace."
          switcher={
            <ModuleSwitcher
              ariaLabel="Transport modules"
              activeId={activeTab}
              items={TRANSPORT_TABS.map((tab) => ({
                id: tab.id,
                label: tab.label,
                href: `/transport?tab=${tab.id}`,
                helper:
                  tab.id === 'vehicles'
                    ? 'Fleet'
                    : tab.id === 'routes'
                      ? 'Transfer library'
                      : tab.id === 'pricing-rules'
                        ? 'Commercial logic'
                        : 'Published slabs',
              }))}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'vehicles', label: 'Vehicles', value: String(summary.vehicles), helper: 'Fleet records' },
                { id: 'routes', label: 'Routes', value: String(summary.routes.total), helper: `${summary.routes.active} active` },
                { id: 'service-types', label: 'Service types', value: String(summary.serviceTypes), helper: 'Reusable labels' },
                { id: 'pricing-rules', label: 'Pricing rules', value: String(summary.pricingRules), helper: `${summary.vehicleRates} published rates` },
              ]}
            />
          }
        >
          <section className="section-stack">
            {activeTab === 'vehicles' ? <VehiclesSection /> : null}
            {activeTab === 'routes' ? <RoutesSection /> : null}
            {activeTab === 'pricing-rules' ? <TransportPricingRulesSection /> : null}
            {activeTab === 'rates' ? <VehicleRatesSection /> : null}
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
