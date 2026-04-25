import Link from 'next/link';
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

export default async function NewQuotePage() {
  const [companies, contacts] = await Promise.all([getCompanies(), getContacts()]);

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <div className="section-stack">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Sales</p>
              <h1>Create Quote</h1>
              <p className="detail-copy">
                Start a new quote with the core commercial setup, then continue in the full quote builder after creation.
              </p>
            </div>
            <div className="table-action-row">
              <Link href="/quotes" className="secondary-button">
                Back to quotes
              </Link>
            </div>
          </div>

          {companies.length === 0 ? (
            <section className="detail-card">
              <p className="eyebrow">Setup Required</p>
              <h2>Create a company first</h2>
              <p className="detail-copy">A quote needs a client company and contact before it can be created.</p>
              <div className="table-action-row">
                <Link href="/companies" className="primary-button">
                  Open companies
                </Link>
                <Link href="/contacts" className="secondary-button">
                  Open contacts
                </Link>
              </div>
            </section>
          ) : (
            <section className="detail-card">
              <p className="eyebrow">Quote Setup</p>
              <h2>Initial quote details</h2>
              <QuotesForm
                apiBaseUrl="/api"
                companies={companies}
                contacts={contacts}
                submitLabel="Create quote"
              />
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
