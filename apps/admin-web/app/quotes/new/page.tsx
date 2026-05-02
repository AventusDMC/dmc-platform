import Link from 'next/link';
import { EmptyState, FormSection } from '../../components/ui';
import { WorkspaceShell } from '../../components/WorkspaceShell';
import { WorkspaceSubheader } from '../../components/WorkspaceSubheader';
import { QuotesForm } from '../QuotesForm';
import { adminPageFetchJson } from '../../lib/admin-server';

type Company = {
  id: string;
  name: string;
};

type Contact = {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
};

type User = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'viewer' | 'operations' | 'finance' | 'agent';
  status: 'active';
};

async function getCompanies(): Promise<Company[]> {
  return adminPageFetchJson<Company[]>('/api/companies', 'New quote companies', {
    cache: 'no-store',
  });
}

async function getContacts(): Promise<Contact[]> {
  return adminPageFetchJson<Contact[]>('/api/contacts', 'New quote contacts', {
    cache: 'no-store',
  });
}

async function getUsers(): Promise<User[]> {
  return adminPageFetchJson<User[]>('/api/users', 'New quote users', {
    cache: 'no-store',
  });
}

export default async function NewQuotePage() {
  const [companies, contacts, users] = await Promise.all([getCompanies(), getContacts(), getUsers()]);
  const agents = users
    .filter((user): user is User & { role: 'agent' } => user.role === 'agent')
    .map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    }));

  return (
    <main className="page">
      <section className="panel workspace-panel app-page-content">
        <WorkspaceShell
          eyebrow="Sales"
          title="Create Quote"
          description="Start with the core commercial setup, then continue in the full quote builder after creation."
          switcher={
            <div className="table-action-row">
              <Link href="/quotes" className="secondary-button">
                Back to quotes
              </Link>
            </div>
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Quote Setup"
              title="Initial quote details"
              description="Use the same quote workspace pattern for setup, review, and builder handoff."
            />

            {companies.length === 0 ? (
              <EmptyState
                title="Create a company first"
                description="A quote needs a client company and contact before it can be created."
                action={
              <div className="table-action-row">
                <Link href="/companies" className="primary-button">
                  Open companies
                </Link>
                <Link href="/contacts" className="secondary-button">
                  Open contacts
                </Link>
              </div>
                }
              />
            ) : (
              <FormSection title="Quote setup" description="Capture the commercial baseline before opening the day-by-day builder.">
              <QuotesForm
                apiBaseUrl="/api"
                companies={companies}
                contacts={contacts}
                agents={agents}
                submitLabel="Create quote"
              />
              </FormSection>
            )}
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
