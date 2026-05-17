import { notFound } from 'next/navigation';
import { ModuleSwitcher } from '../../components/ModuleSwitcher';
import { SummaryStrip } from '../../components/SummaryStrip';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { adminPageFetchJson } from '../../lib/admin-server';
import { ExcursionTemplateEditor } from '../ExcursionTemplateEditor';
import { ExcursionTemplate, ExcursionTemplateCatalogs } from '../types';

export const dynamic = 'force-dynamic';

type ExcursionTemplatePageProps = {
  params: Promise<{ id: string }>;
};

async function getTemplate(id: string) {
  return adminPageFetchJson<ExcursionTemplate | null>(`/api/excursion-templates/${encodeURIComponent(id)}`, 'Excursion template detail', {
    cache: 'no-store',
    allow404: true,
  });
}

async function getCatalogs(): Promise<ExcursionTemplateCatalogs> {
  const [routes, touringRoutes, transportServiceTypes, activities, services] = await Promise.all([
    adminPageFetchJson<ExcursionTemplateCatalogs['routes']>('/api/routes?type=TRANSFER_ROUTE', 'Excursion template transfer route catalog', { cache: 'no-store' }),
    adminPageFetchJson<ExcursionTemplateCatalogs['touringRoutes']>('/api/touring-routes?active=true&transportType=TOURING_ROUTE&limit=500', 'Excursion touring route catalog', {
      cache: 'no-store',
    }),
    adminPageFetchJson<ExcursionTemplateCatalogs['transportServiceTypes']>('/api/transport-service-types', 'Excursion transport type catalog', {
      cache: 'no-store',
    }),
    adminPageFetchJson<ExcursionTemplateCatalogs['activities']>('/api/activities', 'Excursion activity catalog', { cache: 'no-store' }),
    adminPageFetchJson<ExcursionTemplateCatalogs['services']>('/api/services', 'Excursion service catalog', { cache: 'no-store' }),
  ]);
  return { routes, touringRoutes, transportServiceTypes, activities, services };
}

export default async function ExcursionTemplatePage({ params }: ExcursionTemplatePageProps) {
  const { id } = await params;
  const [template, catalogs] = await Promise.all([getTemplate(id), getCatalogs()]);

  if (!template) {
    notFound();
  }

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <WorkspaceShell
          eyebrow="Product Catalog"
          title={template.name}
          description="Controlled operational editor for a composite excursion template."
          switcher={
            <ModuleSwitcher
              ariaLabel="Catalog modules"
              activeId="excursion-templates"
              items={[
                { id: 'activities', label: 'Activities', href: '/activities', helper: 'Flat experiences' },
                { id: 'excursion-templates', label: 'Excursion Templates', href: '/excursion-templates', helper: 'Composite operations' },
                { id: 'services', label: 'Services', href: '/catalog?tab=services', helper: 'Legacy service records' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'code', label: 'Code', value: template.code || 'None', helper: 'Reusable identifier' },
                { id: 'departure', label: 'Departure', value: template.defaultDepartureCity || 'Pending', helper: 'Default city' },
                { id: 'duration', label: 'Duration', value: template.durationMinutes ? `${Math.round(template.durationMinutes / 60)} hr` : 'Pending', helper: 'Operational estimate' },
                { id: 'components', label: 'Components', value: String(template.components?.length || 0), helper: 'Ordered sequence' },
              ]}
            />
          }
        >
          <ExcursionTemplateEditor template={template} catalogs={catalogs} />
        </WorkspaceShell>
      </section>
    </main>
  );
}
