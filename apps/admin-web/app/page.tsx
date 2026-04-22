import Link from 'next/link';
import { DashboardKpiCard } from './components/DashboardKpiCard';
import { DashboardListItem } from './components/DashboardListItem';
import { DashboardPanel } from './components/DashboardPanel';
import { ADMIN_API_BASE_URL, adminPageFetchJson } from './lib/admin-server';
import {
  buildFinanceTooltip,
  buildOperationsTooltip,
  buildRoomingTooltip,
  getBookingAttentionSeverity,
  getBookingFinanceHref,
  getBookingOperationsHref,
  getBookingRoomingHref,
  type FinanceBadge,
  type OperationsBadge,
  type RoomingBadge,
} from './lib/bookingAttention';

const API_BASE_URL = ADMIN_API_BASE_URL;

type Booking = {
  id: string;
  bookingRef: string;
  snapshotJson: {
    title?: string | null;
    travelStartDate?: string | null;
    nightCount?: number | null;
  };
  clientSnapshotJson: {
    name?: string | null;
  };
  finance: {
    badge: FinanceBadge;
  };
  operations: {
    badge: OperationsBadge;
  };
  rooming: {
    badge: RoomingBadge;
  };
};

async function getBookings(): Promise<Booking[]> {
  return adminPageFetchJson<Booking[]>(`${API_BASE_URL}/bookings`, 'Dashboard bookings', {
    cache: 'no-store',
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return 'Travel date pending';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function formatNightCountLabel(value?: number | null) {
  if (!value || value <= 0) {
    return 'Nights pending';
  }

  return `${value} ${value === 1 ? 'night' : 'nights'}`;
}

function getPrimaryAttentionHref(booking: Booking) {
  if (booking.finance.badge.tone === 'error') {
    return getBookingFinanceHref(booking.id);
  }

  if (booking.operations.badge.tone === 'error') {
    return getBookingOperationsHref(booking.id);
  }

  if (booking.rooming.badge.tone === 'error') {
    return getBookingRoomingHref(booking.id);
  }

  if (booking.operations.badge.count > 0) {
    return getBookingOperationsHref(booking.id);
  }

  if (booking.finance.badge.count > 0) {
    return getBookingFinanceHref(booking.id);
  }

  if (booking.rooming.badge.count > 0) {
    return getBookingRoomingHref(booking.id);
  }

  return `/bookings/${booking.id}`;
}

function buildIssueSummary(booking: Booking) {
  const summary: string[] = [];

  const finance = booking.finance.badge.breakdown;
  if (finance.unpaidClient > 0) summary.push(`${finance.unpaidClient} unpaid client`);
  if (finance.unpaidSupplier > 0) summary.push(`${finance.unpaidSupplier} unpaid supplier`);
  if (finance.negativeMargin > 0) summary.push(`${finance.negativeMargin} negative margin`);
  if (finance.lowMargin > 0) summary.push(`${finance.lowMargin} low margin`);

  const operations = booking.operations.badge.breakdown;
  if (operations.reconfirmationDue > 0) summary.push(`${operations.reconfirmationDue} reconfirmation due`);
  if (operations.pendingConfirmations > 0) summary.push(`${operations.pendingConfirmations} pending confirmations`);
  if (operations.missingExecutionDetails > 0) summary.push(`${operations.missingExecutionDetails} missing execution details`);

  const rooming = booking.rooming.badge.breakdown;
  if (rooming.unassignedPassengers > 0) summary.push(`${rooming.unassignedPassengers} unassigned passengers`);
  if (rooming.unassignedRooms > 0) summary.push(`${rooming.unassignedRooms} incomplete rooms`);
  if (rooming.occupancyIssues > 0) summary.push(`${rooming.occupancyIssues} occupancy issues`);

  return summary;
}

function sortAttentionBookings(left: Booking, right: Booking) {
  const severityRank = {
    error: 2,
    warning: 1,
    none: 0,
  } as const;

  const leftSeverity = getBookingAttentionSeverity(left) || 'none';
  const rightSeverity = getBookingAttentionSeverity(right) || 'none';

  return (
    severityRank[rightSeverity] - severityRank[leftSeverity] ||
    (right.finance.badge.count + right.operations.badge.count + right.rooming.badge.count) -
      (left.finance.badge.count + left.operations.badge.count + left.rooming.badge.count)
  );
}

function AttentionBookingRow({ booking, href }: { booking: Booking; href: string }) {
  const severity = getBookingAttentionSeverity(booking);
  const issueSummary = buildIssueSummary(booking);
  const title = booking.snapshotJson?.title?.trim() || 'Booking';
  const client = booking.clientSnapshotJson?.name?.trim() || 'Client pending';

  return (
    <DashboardListItem
      title={
        <Link href={href} className="dashboard-row-link">
          <strong>{booking.bookingRef || booking.id}</strong>
        </Link>
      }
      meta={
        <>
          <p>{title}</p>
          <p>
            {client} | {formatDate(booking.snapshotJson?.travelStartDate)} | {formatNightCountLabel(booking.snapshotJson?.nightCount)}
          </p>
        </>
      }
      summary={<p>{issueSummary.join(' | ') || 'Attention signal available'}</p>}
      chips={
        <>
          {booking.finance.badge.count > 0 ? (
            <Link href={getBookingFinanceHref(booking.id)} className="dashboard-issue-link" title={buildFinanceTooltip(booking.finance.badge)}>
              Finance ({booking.finance.badge.count})
            </Link>
          ) : null}
          {booking.operations.badge.count > 0 ? (
            <Link
              href={getBookingOperationsHref(booking.id)}
              className="dashboard-issue-link"
              title={buildOperationsTooltip(booking.operations.badge)}
            >
              Operations ({booking.operations.badge.count})
            </Link>
          ) : null}
          {booking.rooming.badge.count > 0 ? (
            <Link href={getBookingRoomingHref(booking.id)} className="dashboard-issue-link" title={buildRoomingTooltip(booking.rooming.badge)}>
              Rooming ({booking.rooming.badge.count})
            </Link>
          ) : null}
        </>
      }
      aside={
        <span
          className={`dashboard-pill${
            severity === 'error' ? ' dashboard-pill-alert' : severity === 'warning' ? ' dashboard-pill-warning' : ''
          }`}
        >
          {severity === 'error' ? 'Error' : 'Warning'}
        </span>
      }
    />
  );
}

function AttentionSection({
  eyebrow,
  title,
  bookings,
  hrefBuilder,
  emptyState,
}: {
  eyebrow: string;
  title: string;
  bookings: Booking[];
  hrefBuilder: (booking: Booking) => string;
  emptyState: string;
}) {
  return (
    <DashboardPanel eyebrow={eyebrow} title={title}>
      {bookings.length === 0 ? (
        <p className="empty-state">{emptyState}</p>
      ) : (
        <div className="dashboard-list">
          {bookings.map((booking) => (
            <AttentionBookingRow key={`${eyebrow}-${booking.id}`} booking={booking} href={hrefBuilder(booking)} />
          ))}
        </div>
      )}
    </DashboardPanel>
  );
}

export default async function HomePage() {
  const bookings = await getBookings();

  const attentionBookings = bookings
    .filter(
      (booking) =>
        booking.finance.badge.tone !== 'none' || booking.operations.badge.tone !== 'none' || booking.rooming.badge.tone !== 'none',
    )
    .sort(sortAttentionBookings);

  const reconfirmationsDue = attentionBookings.filter((booking) => booking.operations.badge.breakdown.reconfirmationDue > 0);
  const pendingConfirmations = attentionBookings.filter((booking) => booking.operations.badge.breakdown.pendingConfirmations > 0);
  const financialRisks = attentionBookings.filter((booking) => booking.finance.badge.tone !== 'none');
  const roomingIssues = attentionBookings.filter((booking) => booking.rooming.badge.tone !== 'none');

  const summary = {
    needsAttention: attentionBookings.length,
    errors: attentionBookings.filter((booking) => getBookingAttentionSeverity(booking) === 'error').length,
    warnings: attentionBookings.filter((booking) => getBookingAttentionSeverity(booking) === 'warning').length,
    reconfirmationsDue: reconfirmationsDue.length,
  };

  return (
    <main className="page">
      <section className="panel dashboard-page">
        <header className="dashboard-hero">
          <div className="dashboard-hero-copy">
            <p className="eyebrow">Dashboard</p>
            <h1 className="section-title">Needs attention control center</h1>
            <p className="detail-copy">Watch the bookings that need operator action now, using the backend-owned finance, operations, and rooming badge signals.</p>
          </div>
          <div className="dashboard-hero-actions">
            <Link href="/operations?groupBy=booking" className="dashboard-toolbar-link">
              Open booking queue
            </Link>
            <Link href="/operations" className="dashboard-toolbar-link">
              Open service queue
            </Link>
          </div>
        </header>

        <section className="dashboard-kpi-grid">
          <DashboardKpiCard
            label="Bookings needing action"
            value={String(summary.needsAttention)}
            description="Finance, operations, or rooming attention signals."
            tone={summary.errors > 0 ? 'alert' : 'default'}
          />
          <DashboardKpiCard
            label="Pending confirmations"
            value={String(pendingConfirmations.length)}
            description="Supplier confirmations still unresolved."
          />
          <DashboardKpiCard
            label="Reconfirmations due"
            value={String(summary.reconfirmationsDue)}
            description="Bookings needing immediate operational follow-up."
            tone={summary.reconfirmationsDue > 0 ? 'alert' : 'default'}
          />
          <DashboardKpiCard
            label="Financial risks"
            value={String(financialRisks.length)}
            description="Bookings with finance attention signals."
          />
          <DashboardKpiCard
            label="Rooming issues"
            value={String(roomingIssues.length)}
            description="Passenger or occupancy cleanup still needed."
          />
          <DashboardKpiCard
            label="Warnings"
            value={String(summary.warnings)}
            description="Non-critical signals still requiring review."
          />
        </section>

        <section className="dashboard-main-grid">
          <div className="dashboard-column">
            <AttentionSection
              eyebrow="Needs Attention"
              title="Bookings needing action"
              bookings={attentionBookings}
              hrefBuilder={getPrimaryAttentionHref}
              emptyState="No active booking attention signals right now."
            />

            <AttentionSection
              eyebrow="Reconfirmations Due"
              title="Immediate operational follow-up"
              bookings={reconfirmationsDue}
              hrefBuilder={(booking) => `/bookings/${booking.id}?tab=operations`}
              emptyState="No bookings currently have overdue reconfirmations."
            />

            <AttentionSection
              eyebrow="Pending Confirmations"
              title="Supplier confirmations still open"
              bookings={pendingConfirmations}
              hrefBuilder={(booking) => `/bookings/${booking.id}?tab=operations`}
              emptyState="No bookings currently have pending confirmations."
            />
          </div>

          <div className="dashboard-column">
            <AttentionSection
              eyebrow="Financial Risks"
              title="Commercial bookings to review"
              bookings={financialRisks}
              hrefBuilder={(booking) => `/bookings/${booking.id}?tab=finance`}
              emptyState="No finance attention signals right now."
            />

            <AttentionSection
              eyebrow="Rooming Issues"
              title="Passenger and rooming cleanup"
              bookings={roomingIssues}
              hrefBuilder={(booking) => `/bookings/${booking.id}?tab=rooming`}
              emptyState="No rooming attention signals right now."
            />
          </div>
        </section>
      </section>
    </main>
  );
}
