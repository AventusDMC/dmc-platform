'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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

type BookingQuickActionsProps = {
  bookingId: string;
  finance: {
    clientInvoiceStatus: 'unbilled' | 'invoiced' | 'paid';
    supplierPaymentStatus: 'unpaid' | 'scheduled' | 'paid';
    badge: {
      breakdown: {
        unpaidClient: number;
      };
    };
  };
  operations: {
    badge: {
      breakdown: {
        pendingConfirmations: number;
        reconfirmationDue: number;
      };
    };
  };
  services: BookingQuickActionService[];
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

function buildFutureReconfirmationDueAt() {
  const nextDay = new Date();
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return nextDay.toISOString();
}

export function BookingQuickActions({ bookingId, finance, operations, services }: BookingQuickActionsProps) {
  const router = useRouter();
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [details, setDetails] = useState<QuickActionDetail[]>([]);

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

  const canConfirm = operations.badge.breakdown.pendingConfirmations > 0;
  const canReconfirm = operations.badge.breakdown.reconfirmationDue > 0;
  const canMarkPaid = finance.badge.breakdown.unpaidClient > 0;
  const operationsHref = `/bookings/${bookingId}?tab=operations`;

  function collectDetailLines(result: QuickActionResponse) {
    return [...(result.failures || []), ...(result.skipped || [])].slice(0, 3);
  }

  function formatResultMessage(action: 'confirm' | 'reconfirm' | 'mark_paid', result: QuickActionResponse) {
    if (action === 'mark_paid') {
      if (result.successCount > 0) {
        return 'Marked as paid';
      }

      if (result.skippedCount > 0) {
        return 'Already paid';
      }

      return 'No finance changes applied';
    }

    const actionLabel = action === 'confirm' ? 'Confirmed' : 'Reconfirmed';
    const parts: string[] = [];

    if (result.successCount > 0) {
      parts.push(`${actionLabel} ${result.successCount} service${result.successCount === 1 ? '' : 's'}`);
    }

    if (result.skippedCount > 0) {
      parts.push(`${result.skippedCount} skipped`);
    }

    if (result.failedCount > 0) {
      parts.push(`${result.failedCount} failed`);
    }

    return parts.join(', ') || 'No matching services';
  }

  async function handleAction(action: 'confirm' | 'reconfirm' | 'mark_paid') {
    setPendingAction(action);
    setFeedback('');
    setError('');
    setDetails([]);

    try {
      const response = await fetch(`/api/bookings/${bookingId}/quick-actions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action,
          finance,
          services,
          nextReconfirmationDueAt: action === 'reconfirm' ? buildFutureReconfirmationDueAt() : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not complete booking quick action.'));
      }

      const payload = await readJsonResponseIfPresent<QuickActionResponse>(response);
      const summary = payload || {
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
      };

      setFeedback(formatResultMessage(action, summary));
      setDetails(collectDetailLines(summary));
      if (summary.errors && summary.errors.length > 0) {
        setError(summary.errors.slice(0, 2).join(' | '));
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not complete booking quick action.');
    } finally {
      setPendingAction(null);
    }
  }

  if (!canConfirm && !canReconfirm && !canMarkPaid) {
    return null;
  }

  return (
    <div className="operations-quick-links">
      {canConfirm ? (
        <button
          type="button"
          className="secondary-button"
          disabled={pendingAction !== null}
          onClick={() => handleAction('confirm')}
        >
          {pendingAction === 'confirm' ? 'Confirming...' : 'Confirm'}
        </button>
      ) : null}
      {canReconfirm ? (
        <button
          type="button"
          className="secondary-button"
          disabled={pendingAction !== null}
          onClick={() => handleAction('reconfirm')}
        >
          {pendingAction === 'reconfirm' ? 'Reconfirming...' : 'Reconfirm'}
        </button>
      ) : null}
      {canMarkPaid ? (
        <button
          type="button"
          className="secondary-button"
          disabled={pendingAction !== null}
          onClick={() => handleAction('mark_paid')}
        >
          {pendingAction === 'mark_paid' ? 'Updating...' : 'Mark Paid'}
        </button>
      ) : null}
      {feedback ? <p className="form-helper">{feedback}</p> : null}
      {details.length > 0 ? (
        <div className="audit-log-list">
          {details.map((detail) => (
            <p key={`${detail.serviceId}-${detail.reason}`} className="form-helper">
              <Link href={`${operationsHref}&service=${encodeURIComponent(detail.serviceId)}`}>
                {detail.label} - {detail.reason}
              </Link>
            </p>
          ))}
        </div>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
