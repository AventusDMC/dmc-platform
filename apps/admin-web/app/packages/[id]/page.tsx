import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CollapsibleCreatePanel } from '../../components/CollapsibleCreatePanel';
import { ModuleSwitcher } from '../../components/ModuleSwitcher';
import { SummaryStrip } from '../../components/SummaryStrip';
import { TableSectionShell } from '../../components/TableSectionShell';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { adminPageFetchJson, isNextRedirectError } from '../../lib/admin-server';
import {
  buildPackagePlannerSummary,
  collectPackageTemplateComponents,
  isOperationalPackageService,
  PACKAGE_CATALOG_MODULES,
  packageComponentReferenceLabel,
  packageComponentTypeLabel,
  resolvePackageTemplateDays,
} from '../package-template-display';
import { PackageComponentRemoveButton } from '../PackageComponentRemoveButton';
import { PackageComponentReorderControls } from '../PackageComponentReorderControls';
import { PackageDayPlannerActions } from '../PackageDayPlannerActions';
import { PackageQuoteAssemblyPanel } from '../PackageQuoteAssemblyPanel';
import { PackageTemplateComponentForm } from '../PackageTemplateComponentForm';
import { PackageTemplateDuplicateButton } from '../PackageTemplateDuplicateButton';
import { PackageTemplateDayForm } from '../PackageTemplateDayForm';
import { PackageTemplateMetadataEditor } from '../PackageTemplateMetadataEditor';
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
    serviceRecords: services.filter(isOperationalPackageService),
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
  const packageDays = resolvePackageTemplateDays(template.days, components, template.durationDays);
  const currentComponents = collectPackageTemplateComponents(packageDays, components);
  const packageDurationDays = Math.max(template.durationDays, packageDays.length, ...packageDays.map((day) => day.dayNumber));
  const packageSummary = buildPackagePlannerSummary(packageDays, currentComponents, packageDurationDays);
  const activeComponentCount = currentComponents.filter((component) => component.active).length;
  const optionalComponentCount = currentComponents.filter((component) => component.isOptional).length;
  const orderedDayIds = packageDays.map((day) => day.id);

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
                { id: 'duration', label: 'Duration', value: packageSummary.duration, helper: `${packageSummary.activeDays} active itinerary days` },
                { id: 'cities', label: 'Cities', value: packageSummary.cities, helper: 'From linked hotel contracts' },
                { id: 'excursions', label: 'Excursions', value: packageSummary.excursions, helper: 'Linked templates' },
                { id: 'hotel-nights', label: 'Hotel nights', value: packageSummary.hotelNights, helper: 'Linked hotel days' },
                { id: 'meals', label: 'Included meals', value: packageSummary.includedMeals, helper: 'Inferred from linked services' },
                { id: 'components', label: 'Components', value: String(currentComponents.length), helper: `${activeComponentCount} active, ${optionalComponentCount} optional` },
              ]}
            />
          }
        >
          <section className="section-stack">
            <Link href="/packages" className="back-link">
              Back to package templates
            </Link>

            <section className="detail-grid">
              <PackageTemplateMetadataEditor apiBaseUrl="/api" template={template} />
              <article className="detail-card">
                <h2>Package actions</h2>
                <PackageTemplateDuplicateButton apiBaseUrl="/api" packageTemplateId={template.id} packageName={template.name} navigateToCopy />
              </article>
            </section>

            <PackageQuoteAssemblyPanel apiBaseUrl="/api" packageTemplateId={template.id} />

            <TableSectionShell
              title="Linked itinerary structure"
              description="Package days hold reusable itinerary titles, notes, and linked operational components without duplicating inventory."
              context={<p>{currentComponents.length} linked operational components</p>}
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
                    durationDays={packageDurationDays}
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
                {packageDays.map((day) => (
                  <details key={day.id} className="detail-card" open={day.active || day.components.length > 0}>
                    <summary className="section-header">
                      <span>
                        <span className="eyebrow">Day {day.dayNumber}</span>
                        <strong>{day.title}</strong>
                        {day.description ? <p className="table-cell-copy">{day.description}</p> : null}
                      </span>
                      <span className="table-action-group">
                        <span className={day.active ? 'status-pill status-pill-success' : 'status-pill status-pill-muted'}>{day.active ? 'Active' : 'Inactive'}</span>
                        <PackageDayPlannerActions
                          apiBaseUrl="/api"
                          packageTemplateId={template.id}
                          dayId={day.id}
                          dayNumber={day.dayNumber}
                          orderedDayIds={orderedDayIds}
                        />
                      </span>
                    </summary>
                    <PackageTemplateDayForm apiBaseUrl="/api" packageTemplateId={template.id} day={day} />
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
                            {day.components.map((component) => {
                              const orderedComponentIds = day.components.map((item) => item.id);

                              return (
                                <tr key={component.id} className={!component.active ? 'muted-row' : undefined}>
                                  <td>
                                    <strong>{component.label}</strong>
                                    <p className="table-cell-copy">Position {orderedComponentIds.indexOf(component.id) + 1}</p>
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
                                    <span className="table-action-group">
                                      <PackageComponentReorderControls
                                        apiBaseUrl="/api"
                                        packageTemplateId={template.id}
                                        dayId={day.id}
                                        componentId={component.id}
                                        orderedComponentIds={orderedComponentIds}
                                      />
                                      <PackageComponentRemoveButton
                                        apiBaseUrl="/api"
                                        packageTemplateId={template.id}
                                        componentId={component.id}
                                        label={component.label}
                                      />
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="empty-state ui-empty-state">
                        <strong>No components planned for this day.</strong>
                        <p>Add operational links when this package day needs hotels, transport, excursions, activities, ticketing, or services.</p>
                      </div>
                    )}
                  </details>
                ))}
              </div>
            </TableSectionShell>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
