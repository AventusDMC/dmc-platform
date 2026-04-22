'use client';

import Link from 'next/link';
import { CompactFilterBar } from '../components/CompactFilterBar';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { getErrorMessage, readJsonResponseIfPresent } from '../lib/api';

type BookingQuickActionService = {
  id: string;
  label: string;
  status: 'pending' | 'ready' | 'in_progress' | 'confirmed' | 'cancelled';
  confirmationStatus: 'pending' | 'requested' | 'confirmed';
  supplierReference: string | null;
  reconfirmationRequired: boolean;
  reconfirmationDueAt: string | null;
  serviceDate: string | null;
  startTime: string | null;
  pickupTime: string | null;
  pickupLocation: string | null;
  meetingPoint: string | null;
  participantCount: number | null;
  adultCount: number | null;
  childCount: number | null;
};

type QuickActionDetail = {
  serviceId: string;
  label: string;
  reason: string;
};

type QuickActionResponse = {
  successCount: number;
  failedCount: number;
  skippedCount: number;
  errors?: string[];
  failures?: QuickActionDetail[];
  skipped?: QuickActionDetail[];
};

type BookingBulkActionPayload = {
  originalIndex: number;
  bookingId: string;
  bookingLabel: string;
  finance: {
    badge: {
      count: number;
      tone: 'error' | 'warning' | 'none';
      breakdown: {
        unpaidClient: number;
        unpaidSupplier: number;
        negativeMargin: number;
      };
    };
    clientInvoiceStatus: 'unbilled' | 'invoiced' | 'paid';
    supplierPaymentStatus: 'unpaid' | 'scheduled' | 'paid';
  };
  operations: {
    badge: {
      tone: 'error' | 'warning' | 'none';
      breakdown: {
        pendingConfirmations: number;
        reconfirmationDue: number;
      };
    };
  };
  rooming: {
    badge: {
      count: number;
      tone: 'error' | 'warning' | 'none';
    };
  };
  services: BookingQuickActionService[];
};

type AggregateQuickActionDetail = QuickActionDetail & {
  bookingId: string;
  bookingLabel: string;
};

type OperationsBulkActionsContextValue = {
  isSelected: (bookingId: string) => boolean;
  toggleSelected: (bookingId: string) => void;
  isVisible: (bookingId: string) => boolean;
  getOrder: (bookingId: string) => number;
};

const OperationsBulkActionsContext = createContext<OperationsBulkActionsContextValue | null>(null);
type AttentionFilter =
  | 'all'
  | 'reconfirmation_due'
  | 'pending_confirmations'
  | 'financial_risk'
  | 'rooming_issues'
  | 'any_issue'
  | 'error_only'
  | 'warnings_only'
  | 'clean_only';

const ATTENTION_FILTERS: Array<{ id: AttentionFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'reconfirmation_due', label: 'Reconfirmation due' },
  { id: 'pending_confirmations', label: 'Pending confirmations' },
  { id: 'financial_risk', label: 'Financial risk' },
  { id: 'rooming_issues', label: 'Rooming issues' },
  { id: 'any_issue', label: 'Any issue' },
  { id: 'error_only', label: 'Error only' },
  { id: 'warnings_only', label: 'Warnings only' },
  { id: 'clean_only', label: 'Clean only' },
];

const PRIMARY_ATTENTION_FILTERS: AttentionFilter[] = [
  'all',
  'reconfirmation_due',
  'pending_confirmations',
  'financial_risk',
  'rooming_issues',
];

function toAttentionFilterSlug(filter: AttentionFilter) {
  return filter.replace(/_/g, '-');
}

function resolveAttentionFilter(value?: string | null): AttentionFilter {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_');

  return ATTENTION_FILTERS.some((filter) => filter.id === normalized) ? (normalized as AttentionFilter) : 'all';
}

function getAttentionFilterLabel(filter: AttentionFilter) {
  return ATTENTION_FILTERS.find((entry) => entry.id === filter)?.label || 'All';
}

function buildFutureReconfirmationDueAt() {
  const nextDay = new Date();
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay.toISOString();
}

function formatBulkResultMessage(
  action: 'confirm' | 'reconfirm' | 'mark_paid',
  bookingCount: number,
  successCount: number,
  failedCount: number,
  skippedCount: number,
) {
  if (action === 'mark_paid') {
    const parts: string[] = [];

    if (successCount > 0) {
      parts.push(`Marked ${successCount} booking${successCount === 1 ? '' : 's'} as paid`);
    }

    if (skippedCount > 0) {
      parts.push(`${skippedCount} skipped`);
    }

    if (failedCount > 0) {
      parts.push(`${failedCount} failed`);
    }

    return parts.join(', ') || 'No finance changes applied';
  }

  const actionLabel = action === 'confirm' ? 'Confirmed' : 'Reconfirmed';
  const parts = [`${actionLabel} ${successCount} service${successCount === 1 ? '' : 's'} across ${bookingCount} booking${bookingCount === 1 ? '' : 's'}`];

  if (failedCount > 0) {
    parts.push(`${failedCount} failed`);
  }

  if (skippedCount > 0) {
    parts.push(`${skippedCount} skipped`);
  }

  return parts.join(', ');
}

function matchesAttentionFilter(booking: BookingBulkActionPayload, filter: AttentionFilter) {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'reconfirmation_due') {
    return booking.operations.badge.breakdown.reconfirmationDue > 0;
  }

  if (filter === 'pending_confirmations') {
    return booking.operations.badge.breakdown.pendingConfirmations > 0;
  }

  if (filter === 'financial_risk') {
    return (
      booking.finance.badge.breakdown.unpaidClient > 0 ||
      booking.finance.badge.breakdown.unpaidSupplier > 0 ||
      booking.finance.badge.breakdown.negativeMargin > 0
    );
  }

  if (filter === 'rooming_issues') {
    return booking.rooming.badge.count > 0;
  }

  if (filter === 'any_issue') {
    return (
      booking.finance.badge.tone !== 'none' ||
      booking.operations.badge.tone !== 'none' ||
      booking.rooming.badge.tone !== 'none'
    );
  }

  if (filter === 'warnings_only') {
    return getSeverityRank(booking) === 1;
  }

  if (filter === 'clean_only') {
    return getSeverityRank(booking) === 0;
  }

  return (
    booking.finance.badge.tone === 'error' ||
    booking.operations.badge.tone === 'error' ||
    booking.rooming.badge.tone === 'error'
  );
}

function getSeverityRank(booking: BookingBulkActionPayload) {
  if (
    booking.finance.badge.tone === 'error' ||
    booking.operations.badge.tone === 'error' ||
    booking.rooming.badge.tone === 'error'
  ) {
    return 2;
  }

  if (
    booking.finance.badge.tone === 'warning' ||
    booking.operations.badge.tone === 'warning' ||
    booking.rooming.badge.tone === 'warning'
  ) {
    return 1;
  }

  return 0;
}

function compareVisibleBookings(left: BookingBulkActionPayload, right: BookingBulkActionPayload) {
  return (
    getSeverityRank(right) - getSeverityRank(left) ||
    right.operations.badge.breakdown.reconfirmationDue - left.operations.badge.breakdown.reconfirmationDue ||
    right.operations.badge.breakdown.pendingConfirmations - left.operations.badge.breakdown.pendingConfirmations ||
    right.finance.badge.count - left.finance.badge.count ||
    right.rooming.badge.count - left.rooming.badge.count ||
    left.originalIndex - right.originalIndex
  );
}

function buildUrgencySummary(bookings: BookingBulkActionPayload[]) {
  return bookings.reduce(
    (summary, booking) => {
      const severity = getSeverityRank(booking);

      if (severity === 2) {
        summary.errors += 1;
      } else if (severity === 1) {
        summary.warnings += 1;
      } else {
        summary.clean += 1;
      }

      return summary;
    },
    {
      errors: 0,
      warnings: 0,
      clean: 0,
    },
  );
}

export function OperationsBulkActionsProvider({
  bookings,
  initialFilter,
  children,
}: {
  bookings: BookingBulkActionPayload[];
  initialFilter?: string;
  children: ReactNode;
}) {
  if (bookings.length === 0) {
    return <>{children}</>;
  }

  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedBookingIds, setSelectedBookingIds] = useState<string[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [details, setDetails] = useState<AggregateQuickActionDetail[]>([]);
  const [activeFilter, setActiveFilter] = useState<AttentionFilter>(() => resolveAttentionFilter(initialFilter));

  const availableBookingIds = new Set(bookings.map((booking) => booking.bookingId));
  const urgencySummary = buildUrgencySummary(bookings);
  const filterCounts = ATTENTION_FILTERS.reduce<Record<AttentionFilter, number>>((summary, filter) => {
    summary[filter.id] = bookings.filter((booking) => matchesAttentionFilter(booking, filter.id)).length;
    return summary;
  }, {} as Record<AttentionFilter, number>);

  const visibleBookings = bookings.filter((booking) => matchesAttentionFilter(booking, activeFilter)).sort(compareVisibleBookings);
  const visibleBookingIds = visibleBookings.map((booking) => booking.bookingId);
  const visibleBookingIdSet = new Set(visibleBookingIds);
  const visibleOrder = visibleBookings.reduce<Record<string, number>>((summary, booking, index) => {
    summary[booking.bookingId] = index;
    return summary;
  }, {});
  const visibleSelectedCount = selectedBookingIds.filter((bookingId) => visibleBookingIdSet.has(bookingId)).length;
  const hasSelection = selectedBookingIds.length > 0;

  useEffect(() => {
    if (!feedback && !error) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setFeedback('');
      setError('');
      setDetails([]);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [feedback, error]);

  useEffect(() => {
    setSelectedBookingIds((current) => current.filter((bookingId) => availableBookingIds.has(bookingId)));
  }, [bookings]);

  function isSelected(bookingId: string) {
    return selectedBookingIds.includes(bookingId);
  }

  function toggleSelected(bookingId: string) {
    setSelectedBookingIds((current) =>
      current.includes(bookingId) ? current.filter((id) => id !== bookingId) : [...current, bookingId],
    );
  }

  function selectAllVisible() {
    setSelectedBookingIds(visibleBookingIds);
  }

  function clearSelection() {
    setSelectedBookingIds([]);
  }

  function clearHiddenSelection() {
    setSelectedBookingIds((current) => current.filter((bookingId) => visibleBookingIdSet.has(bookingId)));
  }

  function selectVisibleOnly() {
    setSelectedBookingIds(visibleBookingIds);
  }

  function updateFilter(nextFilter: AttentionFilter) {
    setActiveFilter(nextFilter);

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set('filter', toAttentionFilterSlug(nextFilter));
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }

  function isVisible(bookingId: string) {
    return visibleBookingIds.includes(bookingId);
  }

  function getOrder(bookingId: string) {
    return visibleOrder[bookingId] ?? Number.MAX_SAFE_INTEGER;
  }

  async function handleBulkAction(action: 'confirm' | 'reconfirm' | 'mark_paid') {
    const selectedBookings = bookings.filter((booking) => selectedBookingIds.includes(booking.bookingId));

    if (selectedBookings.length === 0) {
      return;
    }

    setPendingAction(action);
    setFeedback('');
    setError('');
    setDetails([]);

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const collectedErrors: string[] = [];
    const collectedDetails: AggregateQuickActionDetail[] = [];

    for (const booking of selectedBookings) {
      try {
        const response = await fetch(`/api/bookings/${booking.bookingId}/quick-actions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action,
            finance: booking.finance,
            services: booking.services,
            nextReconfirmationDueAt: action === 'reconfirm' ? buildFutureReconfirmationDueAt() : undefined,
          }),
        });

        if (!response.ok) {
          throw new Error(await getErrorMessage(response, `Could not complete quick action for ${booking.bookingLabel}.`));
        }

        const payload = await readJsonResponseIfPresent<QuickActionResponse>(response);
        const result = payload || {
          successCount: 0,
          failedCount: 0,
          skippedCount: 0,
        };

        successCount += result.successCount;
        failedCount += result.failedCount;
        skippedCount += result.skippedCount;

        if (result.errors && result.errors.length > 0) {
          collectedErrors.push(...result.errors.slice(0, 2));
        }

        for (const detail of result.failures || []) {
          collectedDetails.push({
            ...detail,
            bookingId: booking.bookingId,
            bookingLabel: booking.bookingLabel,
          });
        }

        for (const detail of result.skipped || []) {
          collectedDetails.push({
            ...detail,
            bookingId: booking.bookingId,
            bookingLabel: booking.bookingLabel,
          });
        }
      } catch (caughtError) {
        failedCount += 1;
        const message =
          caughtError instanceof Error ? caughtError.message : `Could not complete quick action for ${booking.bookingLabel}.`;
        collectedErrors.push(message);
        collectedDetails.push({
          serviceId: booking.bookingId,
          bookingId: booking.bookingId,
          bookingLabel: booking.bookingLabel,
          label: booking.bookingLabel,
          reason: message,
        });
      }
    }

    setFeedback(formatBulkResultMessage(action, selectedBookings.length, successCount, failedCount, skippedCount));
    setDetails(collectedDetails.slice(0, 3));
    if (collectedErrors.length > 0) {
      setError(collectedErrors.slice(0, 2).join(' | '));
    }
    setSelectedBookingIds([]);
    router.refresh();
    setPendingAction(null);
  }

  return (
    <OperationsBulkActionsContext.Provider value={{ isSelected, toggleSelected, isVisible, getOrder }}>
      <div className="operations-bulk-stack">
        <CompactFilterBar
          eyebrow="Queue Filters"
          title={selectedBookingIds.length > 0 ? `${selectedBookingIds.length} selected` : 'Slice the booking queue'}
          description={`${visibleBookingIds.length} booking groups visible under the current attention filter.`}
        >
          <div className="operations-quick-links">
            {ATTENTION_FILTERS.filter((filter) => PRIMARY_ATTENTION_FILTERS.includes(filter.id)).map((filter) => (
              <button
                key={filter.id}
                type="button"
                className={`secondary-button${activeFilter === filter.id ? ' operations-filter-chip-active' : ''}`}
                disabled={pendingAction !== null}
                onClick={() => updateFilter(filter.id)}
              >
                {filter.label} ({filterCounts[filter.id] ?? 0})
              </button>
            ))}
          </div>
          <div className="operations-quick-links">
            <button type="button" className="secondary-button" disabled={pendingAction !== null} onClick={selectAllVisible}>
              Select all visible
            </button>
            <button type="button" className="secondary-button" disabled={pendingAction !== null} onClick={clearSelection}>
              Clear selection
            </button>
            {hasSelection ? (
              <>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={pendingAction !== null}
                  onClick={() => handleBulkAction('confirm')}
                >
                  {pendingAction === 'confirm' ? 'Confirming...' : 'Confirm'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={pendingAction !== null}
                  onClick={() => handleBulkAction('reconfirm')}
                >
                  {pendingAction === 'reconfirm' ? 'Reconfirming...' : 'Reconfirm'}
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={pendingAction !== null}
                  onClick={() => handleBulkAction('mark_paid')}
                >
                  {pendingAction === 'mark_paid' ? 'Updating...' : 'Mark Paid'}
                </button>
              </>
            ) : null}
          </div>
          <p className="detail-copy">
            {selectedBookingIds.length} selected
            {' • '}
            {visibleSelectedCount} visible in this slice
            {selectedBookingIds.length > visibleSelectedCount ? (
              <>
                {' '}
                <button
                  type="button"
                  className="operations-inline-reset"
                  disabled={pendingAction !== null}
                  onClick={clearHiddenSelection}
                >
                  Clear hidden
                </button>
              </>
            ) : null}
            {selectedBookingIds.length > 0 && visibleSelectedCount === 0 && visibleBookingIds.length > 0 ? (
              <>
                {' '}
                <button
                  type="button"
                  className="operations-inline-reset"
                  disabled={pendingAction !== null}
                  onClick={selectVisibleOnly}
                >
                  Select visible only
                </button>
              </>
            ) : null}
          </p>
          <p className="detail-copy">
            Showing: {getAttentionFilterLabel(activeFilter)}
            {activeFilter !== 'all' ? (
              <>
                {' '}
                <button type="button" className="operations-inline-reset" disabled={pendingAction !== null} onClick={() => updateFilter('all')}>
                  Show all
                </button>
              </>
            ) : null}
          </p>
          <div className="operations-quick-links">
            <button
              type="button"
              className={`dashboard-pill dashboard-pill-alert${activeFilter === 'error_only' ? ' operations-summary-pill-active' : ''}`}
              disabled={pendingAction !== null}
              onClick={() => updateFilter('error_only')}
            >
              Errors: {urgencySummary.errors}
            </button>
            <button
              type="button"
              className={`dashboard-pill dashboard-pill-warning${activeFilter === 'warnings_only' ? ' operations-summary-pill-active' : ''}`}
              disabled={pendingAction !== null}
              onClick={() => updateFilter('warnings_only')}
            >
              Warnings: {urgencySummary.warnings}
            </button>
            <button
              type="button"
              className={`dashboard-pill${activeFilter === 'clean_only' ? ' operations-summary-pill-active' : ''}`}
              disabled={pendingAction !== null}
              onClick={() => updateFilter('clean_only')}
            >
              Clean: {urgencySummary.clean}
            </button>
          </div>
          {feedback ? <p className="form-helper">{feedback}</p> : null}
          {details.length > 0 ? (
            <div className="audit-log-list">
              {details.map((detail) => (
                <p key={`${detail.bookingId}-${detail.serviceId}-${detail.reason}`} className="form-helper">
                  <Link href={`/bookings/${detail.bookingId}?tab=operations&service=${encodeURIComponent(detail.serviceId)}`}>
                    {detail.label} - {detail.reason}
                  </Link>
                </p>
              ))}
            </div>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}
        </CompactFilterBar>
        {children}
      </div>
    </OperationsBulkActionsContext.Provider>
  );
}

export function OperationsBulkSelectionCheckbox({
  bookingId,
  label,
}: {
  bookingId: string;
  label: string;
}) {
  const context = useContext(OperationsBulkActionsContext);

  if (!context) {
    return null;
  }

  return (
    <label className="operations-bulk-checkbox">
      <input type="checkbox" checked={context.isSelected(bookingId)} onChange={() => context.toggleSelected(bookingId)} />
      <span>{label}</span>
    </label>
  );
}

export function OperationsBulkGroupVisibility({
  bookingId,
  children,
}: {
  bookingId?: string;
  children: ReactNode;
}) {
  const context = useContext(OperationsBulkActionsContext);

  if (!context || !bookingId) {
    return <>{children}</>;
  }

  return context.isVisible(bookingId) ? <div style={{ order: context.getOrder(bookingId) }}>{children}</div> : null;
}
