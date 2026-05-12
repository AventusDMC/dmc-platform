import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CollapsibleCreatePanel } from '../../components/CollapsibleCreatePanel';
import { ModuleSwitcher } from '../../components/ModuleSwitcher';
import { SummaryStrip } from '../../components/SummaryStrip';
import { TableSectionShell } from '../../components/TableSectionShell';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';
import { groupPackageComponentsByDay, PACKAGE_CATALOG_MODULES, packageComponentReferenceLabel, packageComponentTypeLabel } from '../package-template-display';
import { PackageComponentRemoveButton } from '../PackageComponentRemoveButton';
import { PackageTemplateComponentForm } from '../PackageTemplateComponentForm';
import type {
  PackageTemplate,
  PackageTemplateHotelContractOption,
  PackageTemplateOption,
  PackageTemplateRouteOption,
  PackageTemplateSupplierServiceOption,
  PackageTemplateTransportServiceTypeOption,
} from '../types';

export const dynamic = 'force-dynamic';

type PackageTemplateDetailPageProps = {
  params: Promise<{ id: string }>;
};

type PackageTemplateCatalogs = {
  excursionTemplates: PackageTemplateOption[];
  activities: PackageTemplateOption[];
  hotelContracts: PackageTemplateHotelContractOption[];
  routes: PackageTemplateRouteOption[];
  transportServiceTypes: PackageTemplateTransportServiceTypeOption[];
  ticketServices: PackageTemplateSupplierServiceOption[];
  serviceRecords: PackageTemplateSupplierServiceOption[];
};

async function getPackageTemplate(id: string) {
  return adminPageFetchJson<PackageTemplate | null>(`/api/package-templates/${encodeURIComponent(id)}`, 'Package template detail', {
    allow404: true,
    cache: 'no-store',
  });
}

async function getCatalogs(): Promise<PackageTemplateCatalogs> {
  const [excursionTemplates, activities, hotelContracts, routes, transportServiceTypes, services] = await Promise.all([
    adminPageFetchJson<PackageTemplateOption[]>('/api/excursion-templates', 'Package excursion template catalog', { cache: 'no-store' }),
    adminPageFetchJson<PackageTemplateOption[]>('/api/activities', 'Package activity catalog', { cache: 'no-store' }),
    adminPageFetchJson<PackageTemplateHotelContractOption[]>('/api/hotel-contracts', 'Package hotel contract catalog', { cache: 'no-store' }),
    adminPageFetchJson<PackageTemplateRouteOption[]>('/api/routes', 'Package route catalog', { cache: 'no-store' }),
    adminPageFetchJson<PackageTemplateTransportServiceTypeOption[]>('/api/transport-service-types', 'Package transport service type catalog', {
      cache: 'no-store',
    }),
    adminPageFetchJson<PackageTemplateSupplierServiceOption[]>('/api/services', 'Package ticketing service catalog', { cache: 'no-store' }),
  ]);

  const ticketServices = services.filter((service) => {
    const category = String(service.category || '').toLowerCase();
    return Boolean(service.entranceFee) || category.includes('ticket') || category.includes('entrance');
  });

  return {
    excursionTemplates,
    activities,
    hotelContracts,
    routes,
    transportServiceTypes,
    ticketServices,
    serviceRecords: services,
  };
}

export default async function PackageTemplateDetailPage({ params }: PackageTemplateDetailPageProps) {
  const { id } = await params;
  let template: PackageTemplate | null = null;
  let catalogs: PackageTemplateCatalogs = {
    excursionTemplates: [],
    activities: [],
    hotelContracts: [],
    routes: [],
    transportServiceTypes: [],
    ticketServices: [],
    serviceRecords: [],
  };
  let catalogLoadError = false;

  try {
    const [templateResult, catalogResult] = await Promise.all([getPackageTemplate(id), getCatalogs()]);
    template = templateResult;
    catalogs = catalogResult;
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error('[packages] package template detail unavailable', error);
    catalogLoadError = true;
    template = await getPackageTemplate(id);
  }

  if (!template) {
    notFound();
  }

  const components = template.components || [];
  const groupedDays = groupPackageComponentsByDay(components, template.durationDays);
  const activeComponentCount = components.filter((component) => component.active).length;
  const optionalComponentCount = components.filter((component) => component.isOptional).length;

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <WorkspaceShell
          eyebrow="Product Catalog"
          title={template.name}
          description="Package template detail links the commercial package structure to operational inventory records."
          switcher={<ModuleSwitcher ariaLabel="Catalog modules" activeId="packages" items={PACKAGE_CATALOG_MODULES} />}
          summary={
            <SummaryStrip
              items={[
                { id: 'duration', label: 'Duration', value: `${template.durationDays} days`, helper: 'Default itinerary structure' },
                { id: 'components', label: 'Components', value: String(components.length), helper: `${activeComponentCount} active links` },
                { id: 'optional', label: 'Optional', value: String(optionalComponentCount), helper: 'Commercially selectable' },
                { id: 'status', label: 'Status', value: template.active ? 'Active' : 'Inactive', helper: 'Template availability' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <Link href="/packages" className="back-link">
              Back to package templates
            </Link>

            <section className="detail-grid">
              <article className="detail-card">
                <h2>Package setup</h2>
                <div className="detail-fields">
                  <p>
                    <strong>Target market:</strong> {template.targetMarket || 'Not set'}
                  </p>
                  <p>
                    <strong>Season:</strong> {template.season || 'Not set'}
                  </p>
                  <p>
                    <strong>Status:</strong> {template.active ? 'Active' : 'Inactive'}
                  </p>
                </div>
                {template.operationalNotes ? <p className="detail-copy">{template.operationalNotes}</p> : null}
              </article>
            </section>

            <TableSectionShell
              title="Linked itinerary structure"
              description="Components reference excursion templates, Activity Masters, hotel contracts, transport routes/pricing modes, and ticketing services."
              context={<p>{components.length} linked operational components</p>}
              createPanel={
                <CollapsibleCreatePanel
                  title="Add operational component"
                  description={
                    catalogLoadError
                      ? 'Catalog references could not be fully loaded right now.'
                      : 'Select an existing operational record and place it on a default itinerary day.'
                  }
                  triggerLabelOpen="Add component"
                >
                  <PackageTemplateComponentForm
                    apiBaseUrl="/api"
                    packageTemplateId={template.id}
                    durationDays={template.durationDays}
                    excursionTemplates={catalogs.excursionTemplates}
                    activities={catalogs.activities}
                    hotelContracts={catalogs.hotelContracts}
                    routes={catalogs.routes}
                    transportServiceTypes={catalogs.transportServiceTypes}
                    ticketServices={catalogs.ticketServices}
                    serviceRecords={catalogs.serviceRecords}
                  />
                </CollapsibleCreatePanel>
              }
            >
              <div className="section-stack">
                {groupedDays.map((day) => (
                  <article key={day.dayNumber} className="detail-card">
                    <h2>Day {day.dayNumber}</h2>
                    {day.components.length > 0 ? (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Component</th>
                              <th>Type</th>
                              <th>Operational reference</th>
                              <th>Flags</th>
                              <th>Notes</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {day.components.map((component) => (
                              <tr key={component.id} className={!component.active ? 'muted-row' : undefined}>
                                <td>
                                  <strong>{component.label}</strong>
                                  <p className="table-cell-copy">Sort {component.sortOrder}</p>
                                </td>
                                <td>{packageComponentTypeLabel(component.componentType)}</td>
                                <td>{packageComponentReferenceLabel(component)}</td>
                                <td>
                                  <span className={component.active ? 'status-pill status-pill-success' : 'status-pill status-pill-muted'}>
                                    {component.active ? 'Active' : 'Inactive'}
                                  </span>
                                  {component.isOptional ? <span className="status-pill status-pill-warning">Optional</span> : null}
                                </td>
                                <td>{component.operationalNotes || 'None'}</td>
                                <td>
                                  <PackageComponentRemoveButton
                                    apiBaseUrl="/api"
                                    packageTemplateId={template.id}
                                    componentId={component.id}
                                    label={component.label}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="empty-state ui-empty-state">
                        <strong>No components planned for this day.</strong>
                        <p>Add operational links when this package day needs hotels, transport, excursions, activities, or ticketing.</p>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </TableSectionShell>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
