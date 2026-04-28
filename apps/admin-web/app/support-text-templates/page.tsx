import Link from 'next/link';
import { AdvancedFiltersPanel } from '../components/AdvancedFiltersPanel';
import { CompactFilterBar } from '../components/CompactFilterBar';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { PageActionBar } from '../components/PageActionBar';
import { SummaryStrip } from '../components/SummaryStrip';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { SupportTextTemplatesManager } from './SupportTextTemplatesManager';

import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';

const API_BASE_URL = ADMIN_API_BASE_URL;
const ACTION_API_BASE_URL = '/api';

type SupportTextTemplate = {
  id: string;
  title: string;
  templateType: 'inclusions' | 'exclusions' | 'terms_notes';
  content: string;
};

async function getTemplates(): Promise<SupportTextTemplate[]> {
  return adminPageFetchJson<SupportTextTemplate[]>(`${API_BASE_URL}/support-text-templates`, 'Support text templates', {
    cache: 'no-store',
  });
}

export default async function SupportTextTemplatesPage() {
  const templates = await getTemplates();
  const inclusionsCount = templates.filter((template) => template.templateType === 'inclusions').length;
  const exclusionsCount = templates.filter((template) => template.templateType === 'exclusions').length;
  const termsCount = templates.filter((template) => template.templateType === 'terms_notes').length;

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Admin Setup"
          title="Support-text templates"
          description="Maintain reusable quote-support content from the same compact admin setup surface as branding."
          switcher={
            <ModuleSwitcher
              ariaLabel="Admin setup modules"
              activeId="templates"
              items={[
                { id: 'branding', label: 'Branding', href: '/branding', helper: 'Company identity and PDF style' },
                { id: 'templates', label: 'Templates', href: '/support-text-templates', helper: 'Reusable support text' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'templates', label: 'Templates', value: String(templates.length), helper: 'Reusable text blocks' },
                { id: 'inclusions', label: 'Inclusions', value: String(inclusionsCount), helper: 'Included content blocks' },
                { id: 'exclusions', label: 'Exclusions', value: String(exclusionsCount), helper: 'Excluded content blocks' },
                { id: 'terms', label: 'Terms', value: String(termsCount), helper: 'Terms and notes' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Admin Setup"
              title="Reusable quote support text"
              description="Keep template setup compact by default, then expand individual items only when you need to review or edit content."
              actions={
                <Link href="/quotes" className="dashboard-toolbar-link">
                  Back to quotes
                </Link>
              }
            />

            <PageActionBar title="Admin shortcuts" description="Keep support text close to the sales workflow while setup stays clean and list-first.">
              <Link href="/branding" className="dashboard-toolbar-link">
                Branding
              </Link>
              <Link href="/quotes" className="dashboard-toolbar-link">
                Quotes
              </Link>
            </PageActionBar>

            <CompactFilterBar
              eyebrow="Admin Setup"
              title="Template controls"
              description="Keep the template library focused while adjacent setup guidance stays tucked away."
            >
              <div className="operations-filter-row">
                <Link href="/support-text-templates" className="secondary-button">
                  Templates
                </Link>
                <Link href="/branding" className="secondary-button">
                  Branding
                </Link>
              </div>
              <AdvancedFiltersPanel title="Template guidance" description="Where these snippets are reused">
                <div className="operations-filter-row">
                  <span className="detail-copy">Support-text templates populate reusable quote inclusions, exclusions, and terms blocks for sales teams.</span>
                </div>
              </AdvancedFiltersPanel>
            </CompactFilterBar>

            <SupportTextTemplatesManager apiBaseUrl={ACTION_API_BASE_URL} templates={templates} />
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
