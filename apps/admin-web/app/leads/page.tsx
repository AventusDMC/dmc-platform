import { AdvancedFiltersPanel } from '../components/AdvancedFiltersPanel';
import Link from 'next/link';
import { LeadsForm } from './LeadsForm';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { CompactFilterBar } from '../components/CompactFilterBar';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { PageActionBar } from '../components/PageActionBar';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { LeadsTable } from './LeadsTable';

import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';

const API_BASE_URL = ADMIN_API_BASE_URL;

type Lead = {
  id: string;
  inquiry: string;
  source: string | null;
  status: string;
  createdAt: string;
};

async function getLeads(): Promise<Lead[]> {
  return adminPageFetchJson<Lead[]>(`${API_BASE_URL}/leads`, 'Leads list', {
    cache: 'no-store',
  });
}

export default async function LeadsPage() {
  const leads = await getLeads();
  const newLeads = leads.filter((lead) => lead.status.toLowerCase() === 'new').length;
  const activeLeads = leads.filter((lead) => lead.status.toLowerCase() !== 'closed').length;

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Sales"
          title="Leads"
          description="Manage incoming inquiries from the same polished sales workspace as quotes and intake surfaces."
          switcher={
            <ModuleSwitcher
              ariaLabel="Sales modules"
              activeId="leads"
              items={[
                { id: 'quotes', label: 'Quotes', href: '/quotes', helper: 'Proposal pipeline' },
                { id: 'leads', label: 'Leads', href: '/leads', helper: 'Incoming inquiries' },
                { id: 'quote-blocks', label: 'Quote Blocks', href: '/quote-blocks', helper: 'Reusable content' },
                { id: 'import-itinerary', label: 'Import Itinerary', href: '/import-itinerary', helper: 'Draft intake' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'leads', label: 'Leads', value: String(leads.length), helper: `${activeLeads} active` },
                { id: 'new', label: 'New', value: String(newLeads), helper: 'Needs triage' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Sales"
              title="Lead inbox"
              description="Triage incoming inquiries from a compact list-first surface before they move into quotes."
              actions={
                <Link href="/quotes" className="dashboard-toolbar-link">
                  View quotes
                </Link>
              }
            />

            <PageActionBar title="Lead shortcuts" description="Move quickly between lead intake and proposal creation.">
              <Link href="/quotes" className="dashboard-toolbar-link">
                Quotes
              </Link>
            </PageActionBar>

            <CompactFilterBar
              eyebrow="Sales Controls"
              title="Lead inbox controls"
              description="Keep intake focused while adjacent sales surfaces stay close."
            >
              <div className="operations-filter-row">
                <Link href="/leads" className="secondary-button">
                  Leads
                </Link>
                <Link href="/quotes" className="secondary-button">
                  Quotes
                </Link>
              </div>
              <AdvancedFiltersPanel title="More sales tools" description="Reusable content and intake helpers">
                <div className="operations-filter-row">
                  <Link href="/quote-blocks" className="secondary-button">
                    Quote blocks
                  </Link>
                  <Link href="/import-itinerary" className="secondary-button">
                    Import itinerary
                  </Link>
                </div>
              </AdvancedFiltersPanel>
            </CompactFilterBar>

            <TableSectionShell
              title="Leads"
              description="Manage incoming inquiries without leaving the lead inbox."
              context={<p>{leads.length} leads in scope</p>}
              createPanel={
                <CollapsibleCreatePanel title="Create lead" description="Capture new inquiries while keeping the inbox visible." triggerLabelOpen="Add lead">
                  <LeadsForm apiBaseUrl={API_BASE_URL} />
                </CollapsibleCreatePanel>
              }
              emptyState={leads.length === 0 ? <p className="empty-state">No leads yet.</p> : undefined}
            >
              {leads.length > 0 ? <LeadsTable apiBaseUrl={API_BASE_URL} leads={leads} /> : null}
            </TableSectionShell>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
