import Link from 'next/link';
import { cookies } from 'next/headers';
import { AdvancedFiltersPanel } from '../components/AdvancedFiltersPanel';
import { AdminForbiddenState } from '../components/AdminForbiddenState';
import { CompactFilterBar } from '../components/CompactFilterBar';
import { ModuleSwitcher } from '../components/ModuleSwitcher';
import { PageActionBar } from '../components/PageActionBar';
import { SummaryStrip } from '../components/SummaryStrip';
import { TableSectionShell } from '../components/TableSectionShell';
import { WorkspaceShell } from '../components/WorkspaceShell';
import { WorkspaceSubheader } from '../components/WorkspaceSubheader';
import { FinanceBookingsTable } from './FinanceBookingsTable';
import { ADMIN_API_BASE_URL, adminPageFetchJson, isAdminForbiddenError } from '../lib/admin-server';
import { canAccessFinance, readSessionActor } from '../lib/auth-session';

const API_BASE_URL = ADMIN_API_BASE_URL;

type FinanceReport = 'all' | 'low-margin' | 'unpaid-clients' | 'unpaid-suppliers' | 'overdue-clients' | 'overdue-suppliers';

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
    overdueClientPaymentsCount: number;
    overdueSupplierPaymentsCount: number;
    hasOverdueClientPayments: boolean;
    hasOverdueSupplierPayments: boolean;
    badge: {
      count: number;
      tone: 'error' | 'warning' | 'none';
      breakdown: {
        unpaidClient: number;
        unpaidSupplier: number;
        negativeMargin: number;
        lowMargin: number;
        overdueClient: number;
        overdueSupplier: number;
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
  if (
    value === 'low-margin' ||
    value === 'unpaid-clients' ||
    value === 'unpaid-suppliers' ||
    value === 'overdue-clients' ||
    value === 'overdue-suppliers'
  ) {
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
  if (report === 'overdue-clients') return 'Overdue Client Payments';
  if (report === 'overdue-suppliers') return 'Overdue Supplier Payments';
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

  if (report === 'overdue-clients') {
    return bookings.filter((booking) => booking.finance.hasOverdueClientPayments);
  }

  if (report === 'overdue-suppliers') {
    return bookings.filter((booking) => booking.finance.hasOverdueSupplierPayments);
  }

  return bookings;
}

export default async function FinancePage({ searchParams }: FinancePageProps) {
  const cookieStore = await cookies();
  const session = readSessionActor(cookieStore.get('dmc_session')?.value || '');

  if (!canAccessFinance(session?.role)) {
    return (
      <AdminForbiddenState
        title="Finance access restricted"
        description="Your account does not have permission to view finance reporting for this company."
      />
    );
  }

  try {
    const resolvedSearchParams = searchParams ? await searchParams : undefined;
    const report = resolveReport(resolvedSearchParams?.report);
    const bookings = await getBookings();
    const filteredBookings = filterBookings(bookings, report);

    const lowMarginCount = bookings.filter((booking) => booking.finance.hasLowMargin || booking.finance.badge.breakdown.negativeMargin > 0).length;
    const unpaidClientCount = bookings.filter((booking) => booking.finance.hasUnpaidClientBalance).length;
    const unpaidSupplierCount = bookings.filter((booking) => booking.finance.hasUnpaidSupplierObligation).length;
    const overdueClientCount = bookings.reduce((total, booking) => total + booking.finance.overdueClientPaymentsCount, 0);
    const overdueSupplierCount = bookings.reduce((total, booking) => total + booking.finance.overdueSupplierPaymentsCount, 0);
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
                { id: 'overdue-clients', label: 'Overdue Clients', href: buildFinanceHref('overdue-clients'), helper: 'Late receivables' },
                { id: 'overdue-suppliers', label: 'Overdue Suppliers', href: buildFinanceHref('overdue-suppliers'), helper: 'Late payables' },
                { id: 'reconciliation', label: 'Reconciliation', href: '/finance/reconciliation', helper: 'Proof review queue' },
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
                { id: 'overdue-clients', label: 'Overdue clients', value: String(overdueClientCount), helper: 'Late receivables' },
                { id: 'overdue-suppliers', label: 'Overdue suppliers', value: String(overdueSupplierCount), helper: 'Late payables' },
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
              <Link href={buildFinanceHref('overdue-clients')} className="dashboard-toolbar-link">
                Overdue clients
              </Link>
              <Link href={buildFinanceHref('overdue-suppliers')} className="dashboard-toolbar-link">
                Overdue suppliers
              </Link>
              <Link href="/finance/reconciliation" className="dashboard-toolbar-link">
                Reconciliation
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
                <Link href={buildFinanceHref('overdue-clients')} className="secondary-button">
                  Overdue clients
                </Link>
                <Link href={buildFinanceHref('overdue-suppliers')} className="secondary-button">
                  Overdue suppliers
                </Link>
                <Link href="/finance/reconciliation" className="secondary-button">
                  Reconciliation
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
  } catch (error) {
    if (isAdminForbiddenError(error)) {
      return (
        <AdminForbiddenState
          title="Finance access restricted"
          description="Your account does not have permission to load finance data for this company."
        />
      );
    }

    throw error;
  }
}
