import { ContactsForm } from './ContactsForm';
import { AdvancedFiltersPanel } from '../components/AdvancedFiltersPanel';
import Link from 'next/link';
import { CollapsibleCreatePanel } from '../components/CollapsibleCreatePanel';
import { CompactFilterBar } from '../components/CompactFilterBar';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { PageActionBar } from '../components/PageActionBar';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { ContactsTable } from './ContactsTable';

import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';

const API_BASE_URL = ADMIN_API_BASE_URL;
const ACTION_API_BASE_URL = '/api';

type Company = {
  id: string;
  name: string;
};

type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  company: Company;
};

async function getContacts(): Promise<Contact[]> {
  return adminPageFetchJson<Contact[]>(`${API_BASE_URL}/contacts`, 'Contacts list', {
    cache: 'no-store',
  });
}

async function getCompanies(): Promise<Company[]> {
  return adminPageFetchJson<Company[]>(`${API_BASE_URL}/companies`, 'Contacts companies', {
    cache: 'no-store',
  });
}

export default async function ContactsPage() {
  const [contacts, companies] = await Promise.all([getContacts(), getCompanies()]);

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Sales Context"
          title="Contacts"
          description="Manage company contacts from the same polished sales context surface as companies and quote setup."
          switcher={
            <ModuleSwitcher
              ariaLabel="Sales context modules"
              activeId="contacts"
              items={[
                { id: 'companies', label: 'Companies', href: '/companies', helper: 'Client organizations' },
                { id: 'contacts', label: 'Contacts', href: '/contacts', helper: 'People and roles' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'contacts', label: 'Contacts', value: String(contacts.length), helper: 'People in scope' },
                { id: 'companies', label: 'Companies', value: String(companies.length), helper: 'Linked organizations' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Sales Context"
              title="Manage company contacts"
              description="Keep contacts list-first and compact so quote setup stays fast."
              actions={
                <Link href="/companies" className="dashboard-toolbar-link">
                  View companies
                </Link>
              }
            />

            <PageActionBar title="Contact shortcuts" description="Switch between company and contact records without leaving the index surfaces.">
              <Link href="/companies" className="dashboard-toolbar-link">
                Companies
              </Link>
            </PageActionBar>

            <CompactFilterBar
              eyebrow="Sales Context"
              title="Context controls"
              description="Keep people records list-first while the broader sales context stays close."
            >
              <div className="operations-filter-row">
                <Link href="/contacts" className="secondary-button">
                  Contacts
                </Link>
                <Link href="/companies" className="secondary-button">
                  Companies
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
              title="Contacts"
              description="Manage company contacts from a compact list-first surface."
              context={<p>{contacts.length} contacts in scope</p>}
              createPanel={
                <CollapsibleCreatePanel title="Create contact" description="Add contact records while keeping the list visible." triggerLabelOpen="Add contact">
                  <ContactsForm apiBaseUrl={ACTION_API_BASE_URL} companies={companies} />
                </CollapsibleCreatePanel>
              }
              emptyState={contacts.length === 0 ? <p className="empty-state">No contacts yet.</p> : undefined}
            >
              {contacts.length > 0 ? <ContactsTable apiBaseUrl={ACTION_API_BASE_URL} contacts={contacts} companies={companies} /> : null}
            </TableSectionShell>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
