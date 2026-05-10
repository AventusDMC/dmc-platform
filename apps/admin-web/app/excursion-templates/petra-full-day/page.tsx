import { notFound } from 'next/navigation';
import { ModuleSwitcher } from '../../components/ModuleSwitcher';
import { SummaryStrip } from '../../components/SummaryStrip';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { adminPageFetchJson } from '../../lib/admin-server';
import { ExcursionTemplateDetail } from '../ExcursionTemplateDetail';
import { ExcursionTemplate, SuggestedTransportResponse } from '../types';

export const dynamic = 'force-dynamic';

async function getPetraFullDayTemplate() {
  return adminPageFetchJson<ExcursionTemplate | null>('/api/excursion-templates/code/PETRA_FULL_DAY', 'Petra Full Day template', {
    cache: 'no-store',
    allow404: true,
  });
}

async function getSuggestedTransport(id: string) {
  return adminPageFetchJson<SuggestedTransportResponse>(
    `/api/excursion-templates/${encodeURIComponent(id)}/suggested-transport?pax=21`,
    'Petra Full Day suggested transport',
    { cache: 'no-store' },
  ).catch((error) => {
    console.error('[excursion-templates] Petra Full Day suggested transport unavailable', error);
    return null;
  });
}

export default async function PetraFullDayTemplatePage() {
  const template = await getPetraFullDayTemplate();

  if (!template) {
    notFound();
  }

  const suggestedTransport = await getSuggestedTransport(template.id);

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
          <ExcursionTemplateDetail template={template} suggestedTransport={suggestedTransport} />
        </WorkspaceShell>
      </section>
    </main>
  );
}
