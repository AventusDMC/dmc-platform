import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { SummaryStrip } from '../components/SummaryStrip';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';
import { RoutesSection } from './RoutesSection';
import { TransportTariffWorkbookSection } from './TransportTariffWorkbookSection';
import { TransportPricingRulesSection } from './TransportPricingRulesSection';
import { TouringRoutesSection } from './TouringRoutesSection';
import { VehicleRatesSection } from './VehicleRatesSection';
import { VehiclesSection } from './VehiclesSection';
import { VehicleTypesSection } from './VehicleTypesSection';

export const dynamic = 'force-dynamic';

type TransportTab = 'routes' | 'touring-routes' | 'vehicles' | 'vehicle-types' | 'pricing-rules' | 'rates' | 'tariff-workbook';
const API_BASE_URL = '/api';

type TransportPageProps = {
  searchParams?: Promise<{
    tab?: string;
    supplierId?: string;
    routeId?: string;
    pricingMode?: string;
    vehicleType?: string;
    validity?: string;
    activeState?: string;
    touringRoutesView?: string;
  }>;
};

const TRANSPORT_TABS: Array<{ id: TransportTab; label: string }> = [
  { id: 'routes', label: 'Transfer Routes' },
  { id: 'touring-routes', label: 'Touring Routes' },
  { id: 'vehicles', label: 'Vehicle Fleet' },
  { id: 'vehicle-types', label: 'Vehicle Types' },
  { id: 'pricing-rules', label: 'Pricing Rules' },
  { id: 'rates', label: 'Supplier Rate Cards' },
  { id: 'tariff-workbook', label: 'Tariff Workbook' },
];

async function getVehiclesCount() {
  const vehicles = await adminPageFetchJson<Array<{ id: string }>>(`${API_BASE_URL}/vehicles`, 'Transport vehicles', { cache: 'no-store' });
  return vehicles.length;
}

async function getRoutesCount() {
  const routes = await adminPageFetchJson<Array<{ id: string; isActive?: boolean }>>(`${API_BASE_URL}/routes?type=TRANSFER_ROUTE`, 'Transfer routes', {
    cache: 'no-store',
  });
  return {
    total: routes.length,
    active: routes.filter((route) => route.isActive !== false).length,
  };
}

async function getTransportSummary() {
  const [vehicles, routesResponse, serviceTypes, touringRoutes, excursionTemplates, pricingRules, vehicleRatesSummary] = await Promise.all([
    getVehiclesCount(),
    getRoutesCount(),
    adminPageFetchJson<Array<{ id: string }>>(`${API_BASE_URL}/transport-service-types`, 'Transport service types', { cache: 'no-store' }),
    adminPageFetchJson<Array<{ id: string }>>(`${API_BASE_URL}/touring-routes`, 'Touring routes', { cache: 'no-store' }),
    adminPageFetchJson<Array<{ id: string }>>(`${API_BASE_URL}/excursion-templates`, 'Excursion templates', { cache: 'no-store' }),
    adminPageFetchJson<Array<{ id: string }>>(`${API_BASE_URL}/transport-pricing/rules`, 'Transport pricing rules', { cache: 'no-store' }),
    adminPageFetchJson<{ rateLines: number }>(`${API_BASE_URL}/vehicle-rates/summary`, 'Transport vehicle rates summary', { cache: 'no-store' }),
  ]);

  return {
    vehicles,
    routes: routesResponse,
    serviceTypes: serviceTypes.length,
    touringRoutes: touringRoutes.length,
    excursionTemplates: excursionTemplates.length,
    pricingRules: pricingRules.length,
    vehicleRates: vehicleRatesSummary.rateLines,
  };
}

function resolveActiveTab(tab?: string): TransportTab {
  return TRANSPORT_TABS.some((entry) => entry.id === tab) ? (tab as TransportTab) : 'routes';
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
      touringRoutes: 0,
      excursionTemplates: 0,
    };
  });

  return (
    <main className={`page ${activeTab === 'rates' || activeTab === 'tariff-workbook' ? 'transport-contracts-page' : ''}`}>
      <section className="panel workspace-panel workspace-panel-wide">
        <WorkspaceShell
          eyebrow="Products & Pricing"
          title="Transport"
          description="Keep fleet, routing, pricing rules, and published rates inside one transport workspace."
          switcher={
            <ModuleSwitcher
              ariaLabel="Transport modules"
              activeId={activeTab}
              items={[
                ...TRANSPORT_TABS.map((tab) => ({
                  id: tab.id,
                  label: tab.label,
                  href: `/transport?tab=${tab.id}`,
                  helper:
                    tab.id === 'routes'
                      ? 'Transfer route library'
                      : tab.id === 'touring-routes'
                        ? 'Touring route workspace'
                      : tab.id === 'vehicles'
                        ? 'Fleet'
                      : tab.id === 'vehicle-types'
                        ? 'Fleet taxonomy'
                      : tab.id === 'pricing-rules'
                        ? 'Commercial logic'
                      : tab.id === 'rates'
                        ? 'Supplier rate cards'
                        : 'Bulk maintenance',
                })),
                { id: 'excursion-templates', label: 'Excursion Templates', href: '/excursion-templates', helper: 'Sellable products' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'vehicles', label: 'Vehicles', value: String(summary.vehicles), helper: 'Fleet records' },
                { id: 'routes', label: 'Transfer Routes', value: String(summary.routes.total), helper: `${summary.routes.active} active` },
                { id: 'touring-routes', label: 'Touring Routes', value: String(summary.touringRoutes), helper: 'Touring route inventory' },
                { id: 'excursion-templates', label: 'Excursion Templates', value: String(summary.excursionTemplates), helper: 'Sellable products' },
                { id: 'service-types', label: 'Service types', value: String(summary.serviceTypes), helper: 'Reusable labels' },
                { id: 'pricing-rules', label: 'Pricing rules', value: String(summary.pricingRules), helper: `${summary.vehicleRates} rate lines` },
              ]}
            />
          }
        >
          <section className="section-stack">
            {activeTab === 'vehicles' ? <VehiclesSection /> : null}
            {activeTab === 'vehicle-types' ? <VehicleTypesSection /> : null}
            {activeTab === 'routes' ? <RoutesSection /> : null}
            {activeTab === 'touring-routes' ? <TouringRoutesSection view={resolvedSearchParams?.touringRoutesView === 'all' ? 'all' : 'golden'} /> : null}
            {activeTab === 'pricing-rules' ? <TransportPricingRulesSection /> : null}
            {activeTab === 'rates' ? <VehicleRatesSection /> : null}
            {activeTab === 'tariff-workbook' ? (
              <TransportTariffWorkbookSection
                filters={{
                  supplierId: resolvedSearchParams?.supplierId,
                  routeId: resolvedSearchParams?.routeId,
                  pricingMode: resolvedSearchParams?.pricingMode,
                  vehicleType: resolvedSearchParams?.vehicleType,
                  validity: resolvedSearchParams?.validity,
                  activeState: resolvedSearchParams?.activeState,
                }}
              />
            ) : null}
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
