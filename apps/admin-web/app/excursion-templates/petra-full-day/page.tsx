import { notFound } from 'next/navigation';
import { ModuleSwitcher } from '../../components/ModuleSwitcher';
import { SummaryStrip } from '../../components/SummaryStrip';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { adminPageFetchJson } from '../../lib/admin-server';
import { ExcursionTemplateEditor } from '../ExcursionTemplateEditor';
import { ExcursionTemplate, ExcursionTemplateCatalogs } from '../types';

export const dynamic = 'force-dynamic';

async function getPetraFullDayTemplate() {
  return adminPageFetchJson<ExcursionTemplate | null>('/api/excursion-templates/code/PETRA_FULL_DAY', 'Petra Full Day template', {
    cache: 'no-store',
    allow404: true,
  });
}

async function getCatalogs(): Promise<ExcursionTemplateCatalogs> {
  const [routes, transportServiceTypes, activities, services] = await Promise.all([
    adminPageFetchJson<ExcursionTemplateCatalogs['routes']>('/api/routes', 'Petra route catalog', { cache: 'no-store' }),
    adminPageFetchJson<ExcursionTemplateCatalogs['transportServiceTypes']>('/api/transport-service-types', 'Petra transport type catalog', {
      cache: 'no-store',
    }),
    adminPageFetchJson<ExcursionTemplateCatalogs['activities']>('/api/activities', 'Petra activity catalog', { cache: 'no-store' }),
    adminPageFetchJson<ExcursionTemplateCatalogs['services']>('/api/services', 'Petra service catalog', { cache: 'no-store' }),
  ]);
  return { routes, transportServiceTypes, activities, services };
}

export default async function PetraFullDayTemplatePage() {
  const template = await getPetraFullDayTemplate();

  if (!template) {
    notFound();
  }

  const catalogs = await getCatalogs();

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <WorkspaceShell
          eyebrow="Product Catalog"
          title="Petra Full Day"
          description="First composite operational excursion template proof."
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
                { id: 'code', label: 'Code', value: template.code || 'PETRA_FULL_DAY', helper: 'Reusable identifier' },
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
