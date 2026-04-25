import Link from 'next/link';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { PageActionBar } from '../components/PageActionBar';
import { SummaryStrip } from '../components/SummaryStrip';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { adminPageFetchJson } from '../lib/admin-server';
import { CitiesCatalogSection } from './CitiesCatalogSection';
import { PlaceTypesCatalogSection } from './PlaceTypesCatalogSection';
import { PlacesCatalogSection } from './PlacesCatalogSection';
import { ServicesCatalogSection } from './ServicesCatalogSection';
import { ServiceTypesCatalogSection } from './ServiceTypesCatalogSection';

type CatalogTab = 'services' | 'service-types' | 'place-types' | 'cities' | 'places';
const API_BASE_URL = '/api';

type CatalogPageProps = {
  searchParams?: Promise<{
    tab?: string;
  }>;
};

const CATALOG_TABS: Array<{ id: CatalogTab; label: string }> = [
  { id: 'services', label: 'Services (Activities)' },
  { id: 'service-types', label: 'Service Types' },
  { id: 'place-types', label: 'Place Types' },
  { id: 'cities', label: 'Cities' },
  { id: 'places', label: 'Places' },
];

async function getCatalogSummary() {
  const [services, serviceTypes, placeTypes, cities, places] = await Promise.all([
    adminPageFetchJson<Array<{ id: string }>>(`${API_BASE_URL}/services`, 'Catalog services', { cache: 'no-store' }),
    adminPageFetchJson<Array<{ id: string; isActive?: boolean }>>(`${API_BASE_URL}/service-types`, 'Catalog service types', { cache: 'no-store' }),
    adminPageFetchJson<Array<{ id: string; isActive?: boolean }>>(`${API_BASE_URL}/place-types`, 'Catalog place types', { cache: 'no-store' }),
    adminPageFetchJson<Array<{ id: string; isActive?: boolean }>>(`${API_BASE_URL}/cities`, 'Catalog cities', { cache: 'no-store' }),
    adminPageFetchJson<Array<{ id: string; isActive?: boolean }>>(`${API_BASE_URL}/places`, 'Catalog places', { cache: 'no-store' }),
  ]);

  return {
    services: services.length,
    serviceTypes: serviceTypes.length,
    activeServiceTypes: serviceTypes.filter((item) => item.isActive !== false).length,
    placeTypes: placeTypes.length,
    cities: cities.length,
    places: places.length,
  };
}

function resolveActiveTab(tab?: string): CatalogTab {
  return CATALOG_TABS.some((entry) => entry.id === tab) ? (tab as CatalogTab) : 'services';
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const activeTab = resolveActiveTab(resolvedSearchParams?.tab);
  const summary = await getCatalogSummary();
  const tabDescriptions: Record<CatalogTab, string> = {
    services: 'Catalog the supplier-managed activities and shared service records used across quoting and operations.',
    'service-types': 'Keep reusable service classifications aligned across products, quotes, and operations.',
    'place-types': 'Maintain shared location labels so places and routes stay consistent across the platform.',
    cities: 'Manage the destination registry that Hotels, Places, and future modules rely on.',
    places: 'Keep a reusable place library for route-building and shared location lookup flows.',
  };

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <WorkspaceShell
          eyebrow="Products & Pricing"
          title="Catalog"
          description="Define the shared product catalog here, then switch to Hotels or Transport for their dedicated pricing workspaces."
          switcher={
            <ModuleSwitcher
              ariaLabel="Catalog modules"
              activeId={activeTab}
              items={CATALOG_TABS.map((tab) => ({
                id: tab.id,
                label: tab.label,
                href: `/catalog?tab=${tab.id}`,
                helper:
                  tab.id === 'services'
                    ? 'Activities'
                    : tab.id === 'service-types'
                      ? 'Classifications'
                      : tab.id === 'place-types'
                        ? 'Location labels'
                        : tab.id === 'cities'
                          ? 'Destinations'
                          : 'Place library',
              }))}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'services', label: 'Services', value: String(summary.services), helper: 'Supplier-managed products' },
                { id: 'service-types', label: 'Service types', value: String(summary.serviceTypes), helper: `${summary.activeServiceTypes} active` },
                { id: 'place-types', label: 'Place types', value: String(summary.placeTypes), helper: 'Shared location labels' },
                { id: 'locations', label: 'Cities / places', value: `${summary.cities} / ${summary.places}`, helper: 'Destination and place registry' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Catalog"
              title={CATALOG_TABS.find((tab) => tab.id === activeTab)?.label || 'Catalog'}
              description={tabDescriptions[activeTab]}
              actions={
                <>
                  <Link href="/catalog?tab=services" className="dashboard-toolbar-link">
                    Activities
                  </Link>
                  <Link href="/catalog?tab=service-types" className="dashboard-toolbar-link">
                    Service types
                  </Link>
                  <Link href="/catalog?tab=places" className="dashboard-toolbar-link">
                    Places
                  </Link>
                </>
              }
            />

            <PageActionBar title="Catalog shortcuts" description="Move quickly between the shared master-data sets that feed Hotels, Transport, and quote workflows.">
              <Link href="/catalog?tab=cities" className="dashboard-toolbar-link">
                Cities
              </Link>
              <Link href="/catalog?tab=place-types" className="dashboard-toolbar-link">
                Place types
              </Link>
              <Link href="/catalog?tab=places" className="dashboard-toolbar-link">
                Places
              </Link>
            </PageActionBar>

            {activeTab === 'services' ? <ServicesCatalogSection /> : null}
            {activeTab === 'service-types' ? <ServiceTypesCatalogSection /> : null}
            {activeTab === 'place-types' ? <PlaceTypesCatalogSection /> : null}
            {activeTab === 'cities' ? <CitiesCatalogSection /> : null}
            {activeTab === 'places' ? <PlacesCatalogSection /> : null}
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
