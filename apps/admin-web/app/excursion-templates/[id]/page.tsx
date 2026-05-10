import { notFound } from 'next/navigation';
import { ModuleSwitcher } from '../../components/ModuleSwitcher';
import { SummaryStrip } from '../../components/SummaryStrip';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { adminPageFetchJson } from '../../lib/admin-server';
import { ExcursionTemplateDetail } from '../ExcursionTemplateDetail';
import { ExcursionTemplate, SuggestedTransportResponse } from '../types';

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

async function getSuggestedTransport(id: string) {
  return adminPageFetchJson<SuggestedTransportResponse>(
    `/api/excursion-templates/${encodeURIComponent(id)}/suggested-transport?pax=21`,
    'Excursion suggested transport',
    { cache: 'no-store' },
  ).catch((error) => {
    console.error('[excursion-templates] suggested transport unavailable', error);
    return null;
  });
}

export default async function ExcursionTemplatePage({ params }: ExcursionTemplatePageProps) {
  const { id } = await params;
  const [template, suggestedTransport] = await Promise.all([getTemplate(id), getSuggestedTransport(id)]);

  if (!template) {
    notFound();
  }

  return (
    <main className="page">
      <section className="panel workspace-panel workspace-panel-wide">
        <WorkspaceShell
          eyebrow="Product Catalog"
          title={template.name}
          description="Read-only operational view for a composite excursion template."
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
          <ExcursionTemplateDetail template={template} suggestedTransport={suggestedTransport} />
        </WorkspaceShell>
      </section>
    </main>
  );
}
