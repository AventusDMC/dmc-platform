import Link from 'next/link';
import { AdvancedFiltersPanel } from '../components/AdvancedFiltersPanel';
import { CompactFilterBar } from '../components/CompactFilterBar';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { PageActionBar } from '../components/PageActionBar';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { FinanceBookingsTable } from './FinanceBookingsTable';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from '../lib/admin-server';

const API_BASE_URL = ADMIN_API_BASE_URL;

type FinanceReport = 'all' | 'low-margin' | 'unpaid-clients' | 'unpaid-suppliers';

type Booking = {
  id: string;
  bookingRef: string;
  status: string;
  finance: {
    quotedTotalSell: number;
    quotedTotalCost: number;
    quotedMargin: number;
    quotedMarginPercent: number;
    realizedTotalSell: number;
    realizedTotalCost: number;
    realizedMargin: number;
    realizedMarginPercent: number;
    clientInvoiceStatus: 'unbilled' | 'invoiced' | 'paid';
    supplierPaymentStatus: 'unpaid' | 'scheduled' | 'paid';
    hasLowMargin: boolean;
    hasUnpaidClientBalance: boolean;
    hasUnpaidSupplierObligation: boolean;
    badge: {
      count: number;
      tone: 'error' | 'warning' | 'none';
      breakdown: {
        unpaidClient: number;
        unpaidSupplier: number;
        negativeMargin: number;
        lowMargin: number;
      };
    };
  };
};

type FinancePageProps = {
  searchParams?: Promise<{
    report?: string;
  }>;
};

async function getBookings(): Promise<Booking[]> {
  return adminPageFetchJson<Booking[]>(`${API_BASE_URL}/bookings`, 'Finance bookings', {
    cache: 'no-store',
  });
}

function resolveReport(value?: string): FinanceReport {
  if (value === 'low-margin' || value === 'unpaid-clients' || value === 'unpaid-suppliers') {
    return value;
  }

  return 'all';
}

function buildFinanceHref(report: FinanceReport) {
  return report === 'all' ? '/finance' : `/finance?report=${report}`;
}

function getFinanceTitle(report: FinanceReport) {
  if (report === 'low-margin') return 'Low Margin';
  if (report === 'unpaid-clients') return 'Unpaid Clients';
  if (report === 'unpaid-suppliers') return 'Unpaid Suppliers';
  return 'Overview';
}

function filterBookings(bookings: Booking[], report: FinanceReport) {
  if (report === 'low-margin') {
    return bookings.filter((booking) => booking.finance.hasLowMargin || booking.finance.badge.breakdown.negativeMargin > 0);
  }

  if (report === 'unpaid-clients') {
    return bookings.filter((booking) => booking.finance.hasUnpaidClientBalance);
  }

  if (report === 'unpaid-suppliers') {
    return bookings.filter((booking) => booking.finance.hasUnpaidSupplierObligation);
  }

  return bookings;
}

export default async function FinancePage({ searchParams }: FinancePageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const report = resolveReport(resolvedSearchParams?.report);
  const bookings = await getBookings();
  const filteredBookings = filterBookings(bookings, report);

  const lowMarginCount = bookings.filter((booking) => booking.finance.hasLowMargin || booking.finance.badge.breakdown.negativeMargin > 0).length;
  const unpaidClientCount = bookings.filter((booking) => booking.finance.hasUnpaidClientBalance).length;
  const unpaidSupplierCount = bookings.filter((booking) => booking.finance.hasUnpaidSupplierObligation).length;
  const clearCount = bookings.filter((booking) => booking.finance.badge.tone === 'none').length;

  return (
    <main className="page">
      <section className="panel workspace-panel">
        <WorkspaceShell
          eyebrow="Finance"
          title="Finance"
          description="Review profitability, receivables, and payables from a dedicated finance surface backed by the existing booking finance signals."
          switcher={
            <ModuleSwitcher
              ariaLabel="Finance slices"
              activeId={report}
              items={[
                { id: 'all', label: 'Overview', href: buildFinanceHref('all'), helper: 'All finance signals' },
                { id: 'low-margin', label: 'Low Margin', href: buildFinanceHref('low-margin'), helper: 'Profitability risk' },
                { id: 'unpaid-clients', label: 'Unpaid Clients', href: buildFinanceHref('unpaid-clients'), helper: 'Receivables' },
                { id: 'unpaid-suppliers', label: 'Unpaid Suppliers', href: buildFinanceHref('unpaid-suppliers'), helper: 'Payables' },
              ]}
            />
          }
          summary={
            <SummaryStrip
              items={[
                { id: 'bookings', label: 'Bookings', value: String(bookings.length), helper: `${filteredBookings.length} in current slice` },
                { id: 'low-margin', label: 'Low margin', value: String(lowMarginCount), helper: 'Margin pressure' },
                { id: 'unpaid-clients', label: 'Unpaid clients', value: String(unpaidClientCount), helper: 'Open receivables' },
                { id: 'unpaid-suppliers', label: 'Unpaid suppliers', value: String(unpaidSupplierCount), helper: 'Open payables' },
                { id: 'clear', label: 'Clear', value: String(clearCount), helper: 'No finance badge' },
              ]}
            />
          }
        >
          <section className="section-stack">
            <WorkspaceSubheader
              eyebrow="Finance"
              title={`${getFinanceTitle(report)} bookings`}
              description="Keep finance review compact by default, then expand into the booking finance tab only when deeper action is needed."
              actions={
                <>
                  <Link href="/operations?report=low_margin&groupBy=booking" className="dashboard-toolbar-link">
                    Open ops finance slice
                  </Link>
                  <Link href="/" className="dashboard-toolbar-link">
                    Dashboard
                  </Link>
                </>
              }
            />

            <PageActionBar title="Finance shortcuts" description="Move between finance slices and the existing booking finance workspace without changing backend behavior.">
              <Link href={buildFinanceHref('low-margin')} className="dashboard-toolbar-link">
                Low margin
              </Link>
              <Link href={buildFinanceHref('unpaid-clients')} className="dashboard-toolbar-link">
                Unpaid clients
              </Link>
              <Link href={buildFinanceHref('unpaid-suppliers')} className="dashboard-toolbar-link">
                Unpaid suppliers
              </Link>
            </PageActionBar>

            <CompactFilterBar
              eyebrow="Finance Controls"
              title="Finance queue controls"
              description="Keep the booking finance list compact while related finance slices and operational follow-up stay close."
            >
              <div className="operations-filter-row">
                <Link href={buildFinanceHref('all')} className="secondary-button">
                  Overview
                </Link>
                <Link href={buildFinanceHref('low-margin')} className="secondary-button">
                  Low margin
                </Link>
                <Link href={buildFinanceHref('unpaid-clients')} className="secondary-button">
                  Unpaid clients
                </Link>
                <Link href={buildFinanceHref('unpaid-suppliers')} className="secondary-button">
                  Unpaid suppliers
                </Link>
              </div>
              <AdvancedFiltersPanel title="Related finance surfaces" description="Finance-adjacent navigation without changing slices">
                <div className="operations-filter-row">
                  <Link href="/operations?report=low_margin&groupBy=booking" className="secondary-button">
                    Operations finance slice
                  </Link>
                  <Link href="/" className="secondary-button">
                    Dashboard
                  </Link>
                </div>
              </AdvancedFiltersPanel>
            </CompactFilterBar>

            <TableSectionShell
              title="Finance booking list"
              description="Review profitability and payment status from a compact list-first finance surface."
              context={<p>{filteredBookings.length} bookings in scope</p>}
              emptyState={<p className="empty-state">No bookings match this finance slice.</p>}
            >
              {filteredBookings.length > 0 ? <FinanceBookingsTable bookings={filteredBookings} /> : null}
            </TableSectionShell>
          </section>
        </WorkspaceShell>
      </section>
    </main>
  );
}
