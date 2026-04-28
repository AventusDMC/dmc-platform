import { AdvancedFiltersPanel } from '../components/AdvancedFiltersPanel';
import Link from 'next/link';
import { CompactFilterBar } from '../components/CompactFilterBar';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { PageActionBar } from '../components/PageActionBar';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { QuotesTable } from './QuotesTable';

import { adminPageFetchJson, isNextRedirectError } from '../lib/admin-server';

const ACTION_API_BASE_URL = '/api';

export const dynamic = 'force-dynamic';

type QuoteStatus = 'DRAFT' | 'READY' | 'SENT' | 'ACCEPTED' | 'CONFIRMED' | 'REVISION_REQUESTED' | 'EXPIRED' | 'CANCELLED';

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

type Quote = {
  id: string;
  quoteNumber: string | null;
  bookingType: 'FIT' | 'GROUP' | 'SERIES';
  title: string;
  description: string | null;
  quoteCurrency: 'USD' | 'JOD' | 'EUR';
  pricingMode: 'SLAB' | 'FIXED';
  pricingType: 'simple' | 'group';
  fixedPricePerPerson: number;
  pricingSlabs: Array<{
    id: string;
    minPax: number;
    maxPax: number | null;
    price: number;
    actualPax?: number;
    focPax?: number;
    payingPax?: number;
    totalCost?: number;
    totalSell?: number;
    pricePerPayingPax?: number;
    pricePerActualPax?: number | null;
    notes?: string | null;
  }>;
  focType: 'none' | 'ratio' | 'fixed';
  focRatio: number | null;
  focCount: number | null;
  focRoomType: 'single' | 'double' | null;
  resolvedFocCount: number;
  resolvedFocRoomType: 'single' | 'double' | null;
  totalPrice: number;
  totalCost: number;
  totalSell: number;
  pricePerPax: number;
  singleSupplement: number | null;
  adults: number;
  children: number;
  roomCount: number;
  nightCount: number;
  status: QuoteStatus;
  travelStartDate: string | null;
  validUntil: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  invoice: {
    id: string;
    status: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
    dueDate: string;
    totalAmount: number;
    currency: string;
  } | null;
  booking?: {
    id: string;
  } | null;
  company: Company;
  brandCompany?: Company;
  contact: Contact;
};

function isQuoteExpired(quote: Pick<Quote, 'status' | 'validUntil'>) {
  if (quote.status === 'EXPIRED') {
    return true;
  }

  if (!quote.validUntil || quote.status === 'ACCEPTED' || quote.status === 'CONFIRMED' || quote.status === 'CANCELLED') {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return new Date(quote.validUntil).getTime() < today.getTime();
}

async function getQuotes(): Promise<Quote[]> {
  return adminPageFetchJson<Quote[]>('/api/quotes', 'Quotes', {
    cache: 'no-store',
  });
}

async function getCompanies(): Promise<Company[]> {
  return adminPageFetchJson<Company[]>('/api/companies', 'Companies', {
    cache: 'no-store',
  });
}

export default async function QuotesPage() {
  let quotes: Quote[] = [];
  let companies: Company[] = [];
  let loadError = false;

  try {
    [quotes, companies] = await Promise.all([
      getQuotes(),
      getCompanies(),
    ]);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }

    console.error('[quotes] list unavailable', error);
    loadError = true;
  }

  const activeQuotes = quotes.filter((quote) => !isQuoteExpired(quote)).length;
  const readyOrSent = quotes.filter((quote) => quote.status === 'READY' || quote.status === 'SENT').length;
  const accepted = quotes.filter((quote) => quote.status === 'ACCEPTED' || quote.status === 'CONFIRMED').length;

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Sales"
          title="Quotes"
          description="Create and review quotes from a cleaner sales workspace without changing the underlying commercial flow."
          switcher={
            <ModuleSwitcher
              ariaLabel="Sales modules"
              activeId="quotes"
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
                { id: 'quotes', label: 'Quotes', value: String(quotes.length), helper: `${activeQuotes} active` },
                { id: 'ready', label: 'Ready / sent', value: String(readyOrSent), helper: 'Review and dispatch' },
                { id: 'accepted', label: 'Accepted', value: String(accepted), helper: 'Converted or pending booking' },
                { id: 'companies', label: 'Companies', value: String(companies.length), helper: 'Client accounts in scope' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Sales"
              title="Quotes list"
              description="Use this page as a fast list-and-filter workspace, then open the quote detail page for editing and review."
              actions={
                <>
                  <Link href="/quotes/new" className="primary-button">
                    Create Quote
                  </Link>
                  <Link href="/leads" className="dashboard-toolbar-link">
                    View leads
                  </Link>
                  <Link href="/quote-blocks" className="dashboard-toolbar-link">
                    Quote blocks
                  </Link>
                </>
              }
            />

            <PageActionBar title="Sales shortcuts" description="Jump quickly across the sales setup and intake surfaces without leaving the workspace.">
              <Link href="/leads" className="dashboard-toolbar-link">
                Leads
              </Link>
              <Link href="/import-itinerary" className="dashboard-toolbar-link">
                Import itinerary
              </Link>
            </PageActionBar>

            <CompactFilterBar
              eyebrow="List Actions"
              title="Quote workspace shortcuts"
              description="Keep the page focused on finding quotes quickly while related sales tools stay one click away."
            >
              <div className="operations-filter-row">
                <Link href="/quotes/new" className="secondary-button">
                  Create quote
                </Link>
                <Link href="/leads" className="secondary-button">
                  Leads
                </Link>
                <Link href="/companies" className="secondary-button">
                  Companies
                </Link>
                <Link href="/contacts" className="secondary-button">
                  Contacts
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
              title="Quotes"
              description="Review quotes from a clean list-first surface, then open a quote to work on details."
              context={<p>{quotes.length} quotes in scope</p>}
              emptyState={
                quotes.length === 0 ? (
                  <p className="empty-state">{loadError ? 'Quotes are temporarily unavailable.' : 'No quotes yet.'}</p>
                ) : undefined
              }
            >
              {quotes.length > 0 ? <QuotesTable apiBaseUrl={ACTION_API_BASE_URL} quotes={quotes} companies={companies} /> : null}
            </TableSectionShell>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
