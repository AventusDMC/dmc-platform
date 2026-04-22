import { AdvancedFiltersPanel } from '../components/AdvancedFiltersPanel';
import Link from 'next/link';
import { CompaniesForm } from './CompaniesForm';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { CompactFilterBar } from '../components/CompactFilterBar';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { PageActionBar } from '../components/PageActionBar';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { CompaniesTable } from './CompaniesTable';

import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';

const API_BASE_URL = ADMIN_API_BASE_URL;
type Company = {
  id: string;
  name: string;
  type: string | null;
  website: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  country: string | null;
  city: string | null;
  createdAt: string;
  branding?: {
    displayName: string | null;
    logoUrl: string | null;
  } | null;
  _count: {
    contacts: number;
  };
};

async function getCompanies(): Promise<Company[]> {
  return adminPageFetchJson<Company[]>(`${API_BASE_URL}/companies`, 'Companies list', {
    cache: 'no-store',
  });
}

export default async function CompaniesPage() {
  const companies = await getCompanies();
  const contactCount = companies.reduce((total, company) => total + company._count.contacts, 0);

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Sales Context"
          title="Companies"
          description="Manage partner companies from the same polished list-first sales surface used by quotes and leads."
          switcher={
            <ModuleSwitcher
              ariaLabel="Sales context modules"
              activeId="companies"
              items={[
                { id: 'companies', label: 'Companies', href: '/companies', helper: 'Client organizations' },
                { id: 'contacts', label: 'Contacts', href: '/contacts', helper: 'People and roles' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'companies', label: 'Companies', value: String(companies.length), helper: 'Partner records' },
                { id: 'contacts', label: 'Linked contacts', value: String(contactCount), helper: 'Across all companies' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Sales Context"
              title="Manage partner companies"
              description="Keep company records compact and list-first so quote and contact setup stays aligned."
              actions={
                <Link href="/contacts" className="dashboard-toolbar-link">
                  View contacts
                </Link>
              }
            />

            <PageActionBar title="Company shortcuts" description="Switch between company and contact records without leaving the index surfaces.">
              <Link href="/contacts" className="dashboard-toolbar-link">
                Contacts
              </Link>
            </PageActionBar>

            <CompactFilterBar
              eyebrow="Sales Context"
              title="Context controls"
              description="Keep partner records compact while related sales records stay accessible."
            >
              <div className="operations-filter-row">
                <Link href="/companies" className="secondary-button">
                  Companies
                </Link>
                <Link href="/contacts" className="secondary-button">
                  Contacts
                </Link>
              </div>
              <AdvancedFiltersPanel title="Related sales surfaces" description="Move between context and pipeline records">
                <div className="operations-filter-row">
                  <Link href="/quotes" className="secondary-button">
                    Quotes
                  </Link>
                  <Link href="/leads" className="secondary-button">
                    Leads
                  </Link>
                </div>
              </AdvancedFiltersPanel>
            </CompactFilterBar>

            <TableSectionShell
              title="Companies"
              description="Manage partner companies from a compact list-first surface."
              context={<p>{companies.length} companies in scope</p>}
              createPanel={
                <CollapsibleCreatePanel title="Create company" description="Add company records while keeping the list visible." triggerLabelOpen="Add company">
                  <CompaniesForm apiBaseUrl={API_BASE_URL} />
                </CollapsibleCreatePanel>
              }
              emptyState={companies.length === 0 ? <p className="empty-state">No companies yet.</p> : undefined}
            >
              {companies.length > 0 ? <CompaniesTable apiBaseUrl={API_BASE_URL} companies={companies} /> : null}
            </TableSectionShell>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
