'use client';

import { FormEvent, useState } from 'react';
import { BookingOperationsEmptyState } from './BookingOperationsEmptyState';
import { BookingPaymentStatusBadge } from './BookingPaymentStatusBadge';

export type BookingPaymentType = 'CLIENT' | 'SUPPLIER';
export type BookingPaymentStatus = 'PENDING' | 'PAID';
export type BookingPaymentMethod = 'bank' | 'cash' | 'card';

export type BookingPaymentRecord = {
  id: string;
  bookingId: string;
  type: BookingPaymentType;
  amount: number;
  currency: string;
  status: BookingPaymentStatus;
  method: BookingPaymentMethod;
  reference: string;
  dueDate: string | null;
  paidAt: string | null;
  overdue: boolean;
  overdueDays: number | null;
  notes?: string | null;
};

export type BookingPaymentDraftRecord = Omit<BookingPaymentRecord, 'id' | 'bookingId' | 'overdue' | 'overdueDays'>;

type BookingPaymentsSectionProps = {
  bookingId: string;
  currency: string;
  title: string;
  eyebrow: string;
  type: BookingPaymentType;
  payments: BookingPaymentRecord[];
  onAddPayment: (payment: BookingPaymentDraftRecord) => Promise<void>;
  onMarkPaid: (paymentId: string) => Promise<void>;
};

type PaymentDraft = {
  amount: string;
  method: BookingPaymentMethod;
  reference: string;
  dueDate: string;
};

const DEFAULT_DRAFT: PaymentDraft = {
  amount: '',
  method: 'bank',
  reference: '',
  dueDate: '',
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

function formatMethod(value: BookingPaymentMethod) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function BookingPaymentsSection({
  bookingId,
  currency,
  title,
  eyebrow,
  type,
  payments,
  onAddPayment,
  onMarkPaid,
}: BookingPaymentsSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState<PaymentDraft>(DEFAULT_DRAFT);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const sortedPayments = [...payments].sort((left, right) => {
    if (left.overdue !== right.overdue) {
      return left.overdue ? -1 : 1;
    }

    const leftDue = left.dueDate ? new Date(left.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const rightDue = right.dueDate ? new Date(right.dueDate).getTime() : Number.POSITIVE_INFINITY;
    if (leftDue !== rightDue) {
      return leftDue - rightDue;
    }

    return 0;
  });

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextAmount = Number(draft.amount);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }

    try {
      setIsSubmitting(true);
      setError('');
      await onAddPayment({
        type,
        amount: Number(nextAmount.toFixed(2)),
        currency,
        status: 'PENDING',
        method: draft.method,
        reference: draft.reference.trim() || `${type === 'CLIENT' ? 'Client' : 'Supplier'} payment`,
        dueDate: draft.dueDate || null,
        paidAt: null,
        notes: null,
      });
      setDraft(DEFAULT_DRAFT);
      setShowForm(false);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save payment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article
      id={type === 'CLIENT' ? 'client-payments' : 'supplier-payments'}
      className="workspace-section booking-ops-panel-card booking-payments-section"
    >
      <div className="workspace-section-head booking-payments-section-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <button
          type="button"
          className="secondary-button"
          onClick={() => setShowForm((current) => !current)}
          disabled={isSubmitting}
        >
          Add Payment
        </button>
      </div>

      {showForm ? (
        <form className="booking-payment-create-form" onSubmit={handleSubmit}>
          <input type="hidden" value={bookingId} readOnly />
          <label>
            Amount
            <input
              type="number"
              min="0"
              step="0.01"
              value={draft.amount}
              onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
              placeholder="0.00"
              disabled={isSubmitting}
            />
          </label>
          <label>
            Due date
            <input
              type="date"
              value={draft.dueDate}
              onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))}
              disabled={isSubmitting}
            />
          </label>
          <label>
            Method
            <select
              value={draft.method}
              onChange={(event) => setDraft((current) => ({ ...current, method: event.target.value as BookingPaymentMethod }))}
              disabled={isSubmitting}
            >
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
            </select>
          </label>
          <label>
            Reference
            <input
              type="text"
              value={draft.reference}
              onChange={(event) => setDraft((current) => ({ ...current, reference: event.target.value }))}
              placeholder="Wire ref, receipt, invoice note"
              disabled={isSubmitting}
            />
          </label>
          <div className="booking-payment-create-actions">
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save payment'}
            </button>
            <button type="button" className="secondary-button" onClick={() => setShowForm(false)} disabled={isSubmitting}>
              Cancel
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      ) : null}

      {payments.length === 0 ? (
        <BookingOperationsEmptyState
          eyebrow={eyebrow}
          title={`No ${type === 'CLIENT' ? 'client' : 'supplier'} payments yet`}
          description="Use Add Payment to start tracking incoming or outgoing payment activity for this booking."
        />
      ) : (
        <div className="booking-payment-list">
          {sortedPayments.map((payment) => (
            <article key={payment.id} className={`booking-payment-row${payment.overdue ? ' booking-payment-row-overdue' : ''}`}>
              <div className="booking-payment-row-main">
                <div className="booking-payment-row-top">
                  <div className="booking-payment-row-amount">
                    <span>Amount</span>
                    <strong>{formatMoney(payment.amount, payment.currency)}</strong>
                  </div>
                  <div className="booking-payment-row-badges">
                    <BookingPaymentStatusBadge status={payment.status} overdue={payment.overdue} />
                  </div>
                </div>
                <div className="booking-payment-row-meta">
                  <div>
                    <span>Method</span>
                    <strong>{formatMethod(payment.method)}</strong>
                  </div>
                  <div>
                    <span>Reference</span>
                    <strong>{payment.reference || 'Pending reference'}</strong>
                  </div>
                  <div>
                    <span>{payment.status === 'PAID' ? 'Paid at' : 'Due date'}</span>
                    <strong>
                      {formatDate(payment.status === 'PAID' ? payment.paidAt : payment.dueDate)}
                      {payment.overdue && payment.overdueDays
                        ? ` • ${payment.overdueDays} day${payment.overdueDays === 1 ? '' : 's'} overdue`
                        : ''}
                    </strong>
                  </div>
                </div>
              </div>
              <div className="booking-payment-row-actions">
                {payment.status === 'PENDING' ? (
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={async () => {
                      try {
                        setPendingPaymentId(payment.id);
                        setError('');
                        await onMarkPaid(payment.id);
                      } catch (caughtError) {
                        setError(caughtError instanceof Error ? caughtError.message : 'Could not mark payment as paid.');
                      } finally {
                        setPendingPaymentId((current) => (current === payment.id ? null : current));
                      }
                    }}
                    disabled={pendingPaymentId === payment.id}
                  >
                    {pendingPaymentId === payment.id ? 'Saving...' : 'Mark paid'}
                  </button>
                ) : (
                  <span className="booking-payment-row-complete">Settled</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {!showForm && error ? <p className="form-error">{error}</p> : null}
    </article>
  );
}
