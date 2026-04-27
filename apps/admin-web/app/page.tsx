import Link from 'next/link';
import dynamic from 'next/dynamic';
import { cookies } from 'next/headers';
import { AlertsList, type DashboardAlertItem } from './components/AlertsList';
import { AdminForbiddenState } from './components/AdminForbiddenState';
import { DashboardEmptyState } from './components/DashboardEmptyState';
import { DashboardHeader } from './components/DashboardHeader';
import { DashboardSectionCard } from './components/DashboardSectionCard';
import { DashboardStatCard } from './components/DashboardStatCard';
import { PipelineSummaryCard } from './components/PipelineSummaryCard';
import { QuickActionsCard } from './components/QuickActionsCard';
import { RecentBookingsList } from './components/RecentBookingsList';
import { RecentQuotesList } from './components/RecentQuotesList';
import { RevenueTrendCard, type DashboardTrendPoint } from './components/RevenueTrendCard';
import { UpcomingOperationsList } from './components/UpcomingOperationsList';
import { adminPageFetchJson, isAdminForbiddenError } from './lib/admin-server';
import { canAccessFinance, canAccessOperations, readSessionActor } from './lib/auth-session';
import { type FinanceBadge, type OperationsBadge, type RoomingBadge } from './lib/bookingAttention';
import { loadDashboardInvoices } from './lib/dashboard-invoices';

const FinanceDashboardSection = dynamic(
  () => import('./components/FinanceDashboardSection').then((module) => module.FinanceDashboardSection),
  {
    loading: () => <section className="dashboard-section-loading">Loading financial overview...</section>,
  },
);

type QuoteStatus = 'DRAFT' | 'READY' | 'SENT' | 'ACCEPTED' | 'CONFIRMED' | 'REVISION_REQUESTED' | 'EXPIRED' | 'CANCELLED';
type BookingStatus = 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';

type Quote = {
  id: string;
  quoteNumber: string | null;
  title: string;
  status: QuoteStatus;
  totalSell: number;
  adults: number;
  children: number;
  travelStartDate: string | null;
  validUntil: string | null;
  createdAt: string;
  company: {
    name: string;
  };
  invoice: {
    id: string;
    status: InvoiceStatus;
    dueDate: string;
    totalAmount: number;
    currency: string;
  } | null;
};

type BookingService = {
  id: string;
  description: string;
  serviceType: string;
  serviceDate: string | null;
  supplierName: string | null;
  status: 'pending' | 'ready' | 'in_progress' | 'confirmed' | 'cancelled';
  confirmationStatus: 'pending' | 'requested' | 'confirmed';
  reconfirmationRequired?: boolean;
  reconfirmationDueAt?: string | null;
};

type Booking = {
  id: string;
  bookingRef: string;
  status: BookingStatus;
  createdAt: string;
  snapshotJson: {
    title?: string | null;
    travelStartDate?: string | null;
    nightCount?: number | null;
    company?: {
      name?: string | null;
    } | null;
  };
  clientSnapshotJson?: {
    name?: string | null;
  } | null;
  services: BookingService[];
  finance: {
    badge: FinanceBadge;
    clientInvoiceStatus?: string | null;
    overdueClientPaymentsCount?: number;
    overdueSupplierPaymentsCount?: number;
    hasOverdueClientPayments?: boolean;
    hasOverdueSupplierPayments?: boolean;
  };
  operations: {
    badge: OperationsBadge;
  };
  rooming: {
    badge: RoomingBadge;
  };
};

type Invoice = {
  id: string;
  totalAmount: number;
  currency: string;
  status: InvoiceStatus;
  dueDate: string;
  createdAt?: string;
  quote: {
    id: string;
    quoteNumber: string | null;
    title: string;
    clientCompany: {
      name: string;
    };
  };
};

type FinanceDashboardSummary = {
  totalRevenue: number;
  totalCollected: number;
  totalOutstanding: number;
  totalOverdue: number;
  supplierPayable: number;
  profit: number;
  margin: number;
  trendLabel: string;
  trends: {
    revenue: {
      direction: 'up' | 'down' | 'flat';
      delta: number;
      changePercent: number;
      unit: 'percent' | 'pp';
    };
    collected: {
      direction: 'up' | 'down' | 'flat';
      delta: number;
      changePercent: number;
      unit: 'percent' | 'pp';
    };
    outstanding: {
      direction: 'up' | 'down' | 'flat';
      delta: number;
      changePercent: number;
      unit: 'percent' | 'pp';
    };
    overdue: {
      direction: 'up' | 'down' | 'flat';
      delta: number;
      changePercent: number;
      unit: 'percent' | 'pp';
    };
    supplierPayable: {
      direction: 'up' | 'down' | 'flat';
      delta: number;
      changePercent: number;
      unit: 'percent' | 'pp';
    };
    profit: {
      direction: 'up' | 'down' | 'flat';
      delta: number;
      changePercent: number;
      unit: 'percent' | 'pp';
    };
    margin: {
      direction: 'up' | 'down' | 'flat';
      delta: number;
      changePercent: number;
      unit: 'percent' | 'pp';
    };
  };
  sparklineSeries?: Partial<{
    revenue: number[];
    collected: number[];
    outstanding: number[];
    overdue: number[];
  }>;
  monthlySeries?: Array<{
    label: string;
    revenue: number;
    collected: number;
  }>;
  overdueBreakdown: {
    client: {
      count: number;
      amount: number;
    };
    supplier: {
      count: number;
      amount: number;
    };
  };
  recentPayments: Array<{
    id: string;
    bookingId: string;
    bookingRef: string;
    bookingTitle: string;
    clientName: string;
    type: 'CLIENT' | 'SUPPLIER';
    amount: number;
    currency: string;
    status: 'PENDING' | 'PAID';
    dueDate: string | null;
    paidAt: string | null;
    overdue: boolean;
    overdueDays: number | null;
  }>;
};

async function getQuotes() {
  return adminPageFetchJson<Quote[]>('/api/quotes', 'Dashboard quotes', {
    cache: 'no-store',
  });
}

async function getBookings() {
  return adminPageFetchJson<Booking[]>('/api/bookings', 'Dashboard bookings', {
    cache: 'no-store',
  });
}

async function getInvoices() {
  return adminPageFetchJson<Invoice[]>('/api/invoices', 'Dashboard invoices', {
    cache: 'no-store',
  });
}

async function getDashboardInvoices() {
  return loadDashboardInvoices(getInvoices);
}

async function getFinanceDashboard() {
  return adminPageFetchJson<FinanceDashboardSummary>('/api/bookings/dashboard/finance', 'Dashboard finance summary', {
    cache: 'no-store',
  });
}

function formatMoney(amount: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return 'Date pending';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function formatShortDate(value: string | null | undefined) {
  if (!value) {
    return 'Pending';
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(value));
}

function formatMonthLabel(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
  }).format(value);
}

function formatQuoteStatus(status: QuoteStatus) {
  return status
    .toLowerCase()
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function formatBookingStatus(status: BookingStatus) {
  return status
    .split('_')
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

function getBookingClient(booking: Booking) {
  return (
    booking.clientSnapshotJson?.name?.trim() ||
    booking.snapshotJson.company?.name?.trim() ||
    'Client pending'
  );
}

function isSameMonth(value: string, date: Date) {
  const current = new Date(value);
  return current.getFullYear() === date.getFullYear() && current.getMonth() === date.getMonth();
}

function buildTrendPoints(bookings: Booking[], invoices: Invoice[]) {
  const now = new Date();
  const points: DashboardTrendPoint[] = [];

  for (let index = 5; index >= 0; index -= 1) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - index, 1);
    const monthKey = `${monthDate.getFullYear()}-${monthDate.getMonth()}`;

    points.push({
      id: monthKey,
      label: formatMonthLabel(monthDate),
      revenue: invoices
        .filter((invoice) => invoice.status !== 'CANCELLED' && isSameMonth(invoice.dueDate, monthDate))
        .reduce((total, invoice) => total + invoice.totalAmount, 0),
      bookings: bookings.filter((booking) => isSameMonth(booking.createdAt, monthDate)).length,
    });
  }

  return points;
}

function getUpcomingOperations(bookings: Booking[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return bookings
    .flatMap((booking) =>
      booking.services
        .filter((service) => service.status !== 'cancelled' && service.serviceDate)
        .map((service) => ({
          id: service.id,
          href: `/bookings/${booking.id}?tab=services#service-${service.id}`,
          serviceName: service.description || service.serviceType,
          bookingRef: booking.bookingRef || booking.id,
          dateValue: service.serviceDate as string,
          dateLabel: formatDate(service.serviceDate),
          supplierLabel: service.supplierName || 'Supplier pending',
          statusLabel: service.confirmationStatus === 'confirmed' ? 'Confirmed' : 'Pending',
          warningLabel:
            service.reconfirmationRequired && service.reconfirmationDueAt
              ? `Reconfirm ${formatShortDate(service.reconfirmationDueAt)}`
              : undefined,
        })),
    )
    .filter((service) => new Date(service.dateValue).getTime() >= today.getTime())
    .sort((left, right) => new Date(left.dateValue).getTime() - new Date(right.dateValue).getTime())
    .slice(0, 6);
}

function getAlerts(
  bookings: Booking[],
  invoices: Invoice[],
  access: {
    finance: boolean;
    operations: boolean;
  },
): DashboardAlertItem[] {
  const overdueReconfirmations = bookings.reduce(
    (total, booking) => total + booking.operations.badge.breakdown.reconfirmationDue,
    0,
  );
  const pendingConfirmations = bookings.reduce(
    (total, booking) => total + booking.operations.badge.breakdown.pendingConfirmations,
    0,
  );
  const missingExecutionDetails = bookings.reduce(
    (total, booking) => total + booking.operations.badge.breakdown.missingExecutionDetails,
    0,
  );
  const financialRiskBookings = bookings.filter((booking) => booking.finance.badge.count > 0).length;
  const overdueClientPayments = bookings.reduce((total, booking) => total + (booking.finance.overdueClientPaymentsCount || 0), 0);
  const overdueSupplierPayments = bookings.reduce((total, booking) => total + (booking.finance.overdueSupplierPaymentsCount || 0), 0);
  const roomingIssueBookings = bookings.filter((booking) => booking.rooming.badge.count > 0).length;
  const outstandingInvoices = invoices.filter((invoice) => invoice.status === 'ISSUED').length;

  const alerts: DashboardAlertItem[] = [];

  if (access.operations && overdueReconfirmations > 0) {
    alerts.push({
      id: 'reconfirmations',
      title: `${overdueReconfirmations} reconfirmations due`,
      detail: 'Supplier follow-up is overdue and should be handled from the operations queue.',
      severity: 'critical',
      href: '/operations?report=pending_confirmations',
    });
  }

  if (access.operations && pendingConfirmations > 0) {
    alerts.push({
      id: 'confirmations',
      title: `${pendingConfirmations} services awaiting confirmation`,
      detail: 'Supplier responses are still outstanding on active bookings.',
      severity: 'warning',
      href: '/operations?report=pending_confirmations',
    });
  }

  if (access.operations && missingExecutionDetails > 0) {
    alerts.push({
      id: 'execution',
      title: `${missingExecutionDetails} services missing execution details`,
      detail: 'Pickup, meeting point, or dated activity details still need cleanup.',
      severity: 'warning',
      href: '/operations?report=unresolved_issues',
    });
  }

  if (access.finance && overdueClientPayments > 0) {
    alerts.push({
      id: 'overdue-client-payments',
      title: `${overdueClientPayments} overdue client payments`,
      detail: 'Receivables are past due and need finance follow-up.',
      severity: 'critical',
      href: '/finance?report=overdue-clients',
    });
  }

  if (access.finance && overdueSupplierPayments > 0) {
    alerts.push({
      id: 'overdue-supplier-payments',
      title: `${overdueSupplierPayments} overdue supplier payments`,
      detail: 'Payables are past due and need settlement review.',
      severity: 'warning',
      href: '/finance?report=overdue-suppliers',
    });
  }

  if (access.finance && (financialRiskBookings > 0 || outstandingInvoices > 0)) {
    alerts.push({
      id: 'finance',
      title: outstandingInvoices > 0 ? `${outstandingInvoices} outstanding invoices` : `${financialRiskBookings} finance risks`,
      detail: `${financialRiskBookings} bookings also carry finance attention signals.`,
      severity: outstandingInvoices > 0 ? 'warning' : 'info',
      href: '/finance',
    });
  }

  if (access.operations && roomingIssueBookings > 0) {
    alerts.push({
      id: 'rooming',
      title: `${roomingIssueBookings} bookings with rooming issues`,
      detail: 'Passenger allocations or occupancy setup still need review.',
      severity: 'info',
      href: '/operations?groupBy=booking',
    });
  }

  return alerts;
}

export default async function HomePage() {
  try {
    const cookieStore = await cookies();
    const session = readSessionActor(cookieStore.get('dmc_session')?.value || '');
    const financeAccess = canAccessFinance(session?.role);
    const operationsAccess = canAccessOperations(session?.role);

    const [quotes, bookings, invoiceResult, financeDashboard] = await Promise.all([
      getQuotes(),
      getBookings(),
      getDashboardInvoices(),
      financeAccess ? getFinanceDashboard() : Promise.resolve(null),
    ]);

    const invoices = invoiceResult.invoices;
    const invoicesUnavailable = invoiceResult.unavailable;
    const now = new Date();
    const activeTrips = bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'in_progress').length;
    const pendingConfirmations = bookings.reduce((total, booking) => total + booking.operations.badge.breakdown.pendingConfirmations, 0);
    const quotesAwaitingResponse = quotes.filter((quote) => quote.status === 'READY' || quote.status === 'SENT' || quote.status === 'REVISION_REQUESTED').length;
    const outstandingInvoices = invoices.filter((invoice) => invoice.status === 'ISSUED');
    const outstandingInvoiceValue = outstandingInvoices.reduce((total, invoice) => total + invoice.totalAmount, 0);

  // TODO: replace this due-date proxy with a paid-at/issued-at revenue source when the backend exposes one.
    const revenueThisMonth = invoices
      .filter((invoice) => invoice.status !== 'CANCELLED' && isSameMonth(invoice.dueDate, now))
      .reduce((total, invoice) => total + invoice.totalAmount, 0);

    const recentQuotes = quotes.slice(0, 5).map((quote) => ({
      id: quote.id,
      href: `/quotes/${quote.id}`,
      title: quote.title,
      reference: quote.quoteNumber || 'Reference pending',
      company: quote.company.name,
      travelLabel: formatDate(quote.travelStartDate),
      statusLabel: formatQuoteStatus(quote.status),
      amountLabel: formatMoney(quote.totalSell || 0),
    }));

    const recentBookings = bookings.slice(0, 5).map((booking) => ({
      id: booking.id,
      href: `/bookings/${booking.id}`,
      title: booking.snapshotJson.title?.trim() || booking.bookingRef || 'Booking',
      reference: booking.bookingRef || booking.id,
      client: getBookingClient(booking),
      travelLabel: formatDate(booking.snapshotJson.travelStartDate),
      statusLabel: formatBookingStatus(booking.status),
      statusTone:
        booking.status === 'in_progress' || booking.status === 'confirmed'
          ? ('accent' as const)
          : booking.status === 'cancelled'
            ? ('warning' as const)
            : ('neutral' as const),
    }));

    const trendPoints = buildTrendPoints(bookings, invoices);
    const alerts = getAlerts(bookings, invoices, { finance: financeAccess, operations: operationsAccess });
    const upcomingOperations = operationsAccess ? getUpcomingOperations(bookings) : [];
    const draftQuotes = quotes.filter((quote) => quote.status === 'DRAFT').length;
    const sentQuotes = quotes.filter((quote) => quote.status === 'SENT').length;
    const acceptedQuotes = quotes.filter((quote) => quote.status === 'ACCEPTED' || quote.status === 'CONFIRMED').length;
    const draftBookings = bookings.filter((booking) => booking.status === 'draft').length;
    const liveBookings = bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'in_progress').length;
    const completedBookings = bookings.filter((booking) => booking.status === 'completed').length;

    return (
    <main className="page">
      <section className="panel executive-dashboard-page">
        <div className="executive-dashboard-shell">
          <DashboardHeader
            title="Business control center"
            subtitle="Track commercial momentum, live operational risk, and the next actions your team should take."
            actions={
              <>
                <Link href="/quotes/new" className="primary-button">
                  New Quote
                </Link>
                <Link href="/quotes" className="dashboard-toolbar-link">
                  New Booking
                </Link>
                {financeAccess ? (
                  <Link href="/finance" className="dashboard-toolbar-link">
                    Finance Summary
                  </Link>
                ) : null}
              </>
            }
          />

          <section className="executive-dashboard-stat-grid">
            {financeAccess ? (
              <DashboardStatCard
                label="Revenue This Month"
                value={formatMoney(revenueThisMonth)}
                helper="Invoice volume this month"
                tone="accent"
              />
            ) : null}
            <DashboardStatCard
              label="Bookings"
              value={String(bookings.length)}
              helper={`${liveBookings} active in delivery`}
            />
            <DashboardStatCard
              label="Active Trips"
              value={String(activeTrips)}
              helper="Confirmed or live execution"
            />
            {operationsAccess ? (
              <DashboardStatCard
                label="Pending Confirmations"
                value={String(pendingConfirmations)}
                helper="Services still waiting on suppliers"
                tone={pendingConfirmations > 0 ? 'warning' : 'neutral'}
              />
            ) : null}
            <DashboardStatCard
              label="Quotes Awaiting Response"
              value={String(quotesAwaitingResponse)}
              helper="Ready, sent, or revision requested"
            />
            {financeAccess ? (
              <DashboardStatCard
                label="Outstanding Invoices"
                value={String(outstandingInvoices.length)}
                helper={formatMoney(outstandingInvoiceValue)}
                tone={outstandingInvoices.length > 0 ? 'danger' : 'neutral'}
              />
            ) : null}
          </section>

          <section className="executive-dashboard-main-grid">
            <div className="executive-dashboard-main-column">
              {financeAccess && invoicesUnavailable ? (
                <DashboardSectionCard
                  eyebrow="Invoices"
                  title="Invoice data unavailable"
                  description="The rest of the dashboard is still available while invoice data is temporarily unavailable."
                  action={
                    <Link href="/invoices" className="dashboard-section-link">
                      Open invoices
                    </Link>
                  }
                >
                  <DashboardEmptyState
                    title="Invoice queue unavailable"
                    description="Quotes, bookings, operations, and finance cards are still shown with invoice totals treated as empty for this load."
                  />
                </DashboardSectionCard>
              ) : null}
              {financeDashboard ? <FinanceDashboardSection summary={financeDashboard} /> : null}
              <RecentQuotesList quotes={recentQuotes} />
              <RecentBookingsList bookings={recentBookings} />
              <RevenueTrendCard
                points={trendPoints}
                revenueLabel={formatMoney(trendPoints.reduce((total, point) => total + point.revenue, 0))}
                bookingsLabel={String(trendPoints.reduce((total, point) => total + point.bookings, 0))}
              />
              {operationsAccess ? <UpcomingOperationsList items={upcomingOperations} /> : null}
            </div>

            <aside className="executive-dashboard-sidebar">
              <AlertsList alerts={alerts} />
              <PipelineSummaryCard
                salesRows={[
                  { id: 'quotes-draft', label: 'Draft quotes', value: String(draftQuotes), helper: 'Early-stage proposals' },
                  { id: 'quotes-awaiting', label: 'Awaiting response', value: String(quotesAwaitingResponse), helper: 'Needs follow-up' },
                  { id: 'quotes-sent', label: 'Sent quotes', value: String(sentQuotes), helper: 'With clients now' },
                  { id: 'quotes-accepted', label: 'Accepted / confirmed', value: String(acceptedQuotes), helper: 'Converted pipeline' },
                ]}
                deliveryRows={[
                  { id: 'bookings-draft', label: 'Draft bookings', value: String(draftBookings), helper: 'Freshly converted' },
                  { id: 'bookings-live', label: 'Live bookings', value: String(liveBookings), helper: 'Confirmed or in progress' },
                  { id: 'bookings-complete', label: 'Completed', value: String(completedBookings), helper: 'Closed delivery' },
                  ...(operationsAccess
                    ? [
                        {
                          id: 'ops-upcoming',
                          label: 'Upcoming services',
                          value: String(upcomingOperations.length),
                          helper: 'Next operational horizon',
                        },
                      ]
                    : []),
                ]}
              />
              <QuickActionsCard
                actions={[
                  { id: 'action-quote', label: 'Create quote', helper: 'Start a new proposal', href: '/quotes/new', primary: true },
                  ...(operationsAccess
                    ? [{ id: 'action-bookings', label: 'Open bookings', helper: 'Review live delivery', href: '/bookings' }]
                    : []),
                  ...(financeAccess
                    ? [
                        {
                          id: 'action-send-invoices',
                          label: 'Send invoices',
                          helper: 'Follow up on client billing',
                          href: '/finance?report=unpaid-clients',
                        },
                        {
                          id: 'action-send-reminders',
                          label: 'Send reminders',
                          helper: 'Chase overdue receivables',
                          href: '/finance?report=overdue-clients',
                        },
                      ]
                    : []),
                  ...(operationsAccess
                    ? [
                        {
                          id: 'action-confirmations',
                          label: 'Pending confirmations',
                          helper: 'Chase supplier responses',
                          href: '/operations?report=pending_confirmations',
                        },
                      ]
                    : []),
                  { id: 'action-invoices', label: 'Invoice queue', helper: 'Review settlement status', href: '/invoices' },
                ]}
              />
            </aside>
          </section>
        </div>
      </section>
    </main>
    );
  } catch (error) {
    if (isAdminForbiddenError(error)) {
      return (
        <AdminForbiddenState
          title="Dashboard access restricted"
          description="Your account can sign in, but it does not have permission to load this dashboard data."
        />
      );
    }

    throw error;
  }
}
