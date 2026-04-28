'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage, readJsonResponse } from '../../lib/api';
import { getMarginMetrics } from '../../lib/financials';
import { BookingAlertPanel } from './BookingAlertPanel';
import { BookingOperationsStatCard } from './BookingOperationsStatCard';
import { BookingInvoicePdfButton } from './BookingInvoicePdfButton';
import { BookingPaymentsSection, type BookingPaymentDraftRecord, type BookingPaymentRecord } from './BookingPaymentsSection';

type BookingFinancialsTabProps = {
  bookingId: string;
  bookingRef: string;
  portalUrl: string;
  currency: string;
  totalSell: number;
  totalCost: number;
  initialPayments: BookingPaymentRecord[];
  initialInvoiceSentAt: string | null;
  initialInvoiceSentTo: string | null;
  initialReminderSentAt: string | null;
  initialReminderSentTo: string | null;
  initialReminderCount: number;
  initialLastReminderAt: string | null;
  initialNextReminderDueAt: string | null;
  reminderAutomationActive: boolean;
  reminderAutomationStage: 'gentle' | 'firm' | 'urgent';
  paymentProofSubmission: {
    reference: string | null;
    amount: number | null;
    receiptUrl: string | null;
    submittedAt: string | null;
  } | null;
  invoiceRecipientEmail: string | null;
};

type BookingInvoiceSummary = {
  id: string;
  invoiceNumber: string;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
  effectiveStatus: string;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  currency: string;
  dueDate: string;
};

function formatMoney(amount: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function resolveReceiptUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `/api${value.startsWith('/') ? value : `/${value}`}`;
}

export function BookingFinancialsTab({
  bookingId,
  bookingRef,
  portalUrl,
  currency,
  totalSell,
  totalCost,
  initialPayments,
  initialInvoiceSentAt,
  initialInvoiceSentTo,
  initialReminderSentAt,
  initialReminderSentTo,
  initialReminderCount,
  initialLastReminderAt,
  initialNextReminderDueAt,
  reminderAutomationActive,
  reminderAutomationStage,
  paymentProofSubmission,
  invoiceRecipientEmail,
}: BookingFinancialsTabProps) {
  const router = useRouter();
  const [payments, setPayments] = useState<BookingPaymentRecord[]>(initialPayments);
  const [invoice, setInvoice] = useState<BookingInvoiceSummary | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);

  useEffect(() => {
    setPayments(initialPayments);
  }, [initialPayments]);

  const clientPayments = useMemo(
    () => payments.filter((payment) => payment.type === 'CLIENT'),
    [payments],
  );
  const supplierPayments = useMemo(
    () => payments.filter((payment) => payment.type === 'SUPPLIER'),
    [payments],
  );

  const clientPaid = clientPayments
    .filter((payment) => payment.status === 'PAID')
    .reduce((total, payment) => total + payment.amount, 0);
  const supplierPaid = supplierPayments
    .filter((payment) => payment.status === 'PAID')
    .reduce((total, payment) => total + payment.amount, 0);

  const clientOutstanding = Math.max(totalSell - clientPaid, 0);
  const supplierOutstanding = Math.max(totalCost - supplierPaid, 0);
  const margin = getMarginMetrics(totalSell, totalCost);
  const overdueClientPayments = clientPayments.filter((payment) => payment.overdue);
  const overdueSupplierPayments = supplierPayments.filter((payment) => payment.overdue);
  const paymentProofReceiptUrl = resolveReceiptUrl(paymentProofSubmission?.receiptUrl);
  const financeWatchlistItems = [
    clientOutstanding > 0
      ? {
          id: 'client-outstanding',
          message: `${formatMoney(clientOutstanding, currency)} is still due from the client. Review open receivables and confirm the payment plan.`,
          actionLabel: 'View payments',
          href: '#client-payments',
        }
      : null,
    supplierOutstanding > 0
      ? {
          id: 'supplier-outstanding',
          message: `${formatMoney(supplierOutstanding, currency)} is still due to suppliers. Prioritize the next outbound settlement.`,
          actionLabel: 'View payments',
          href: '#supplier-payments',
        }
      : null,
    overdueClientPayments.length > 0
      ? {
          id: 'client-overdue',
          message: `${overdueClientPayments.length} client payment${overdueClientPayments.length === 1 ? '' : 's'} ${overdueClientPayments.length === 1 ? 'is' : 'are'} overdue and need immediate follow-up.`,
          actionLabel: 'View overdue',
          href: '#client-payments',
        }
      : null,
    overdueSupplierPayments.length > 0
      ? {
          id: 'supplier-overdue',
          message: `${overdueSupplierPayments.length} supplier payment${overdueSupplierPayments.length === 1 ? '' : 's'} ${overdueSupplierPayments.length === 1 ? 'is' : 'are'} overdue and need settlement review.`,
          actionLabel: 'View overdue',
          href: '#supplier-payments',
        }
      : null,
    clientOutstanding > 0
      ? {
          id: 'invoice-action',
          message: 'Invoice paperwork is ready for action. Share or download the latest client invoice from this workspace.',
          actionLabel: 'Prepare invoice',
          href: '#financial-actions',
        }
      : null,
  ].filter(Boolean) as Array<{ id: string; message: string; actionLabel?: string; href?: string }>;

  async function handleAddPayment(nextPayment: BookingPaymentDraftRecord) {
    const response = await fetch(`/api/bookings/${bookingId}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(nextPayment),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Could not save payment.'));
    }

    const createdPayment = await readJsonResponse<BookingPaymentRecord>(response, 'Create booking payment');
    setPayments((current) => [createdPayment, ...current.filter((payment) => payment.id !== createdPayment.id)]);
    router.refresh();
  }

  async function handleMarkPaid(paymentId: string) {
    const response = await fetch(`/api/bookings/${bookingId}/payments/${paymentId}/mark-paid`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response, 'Could not mark payment as paid.'));
    }

    const updatedPayment = await readJsonResponse<BookingPaymentRecord>(response, 'Mark booking payment paid');
    setPayments((current) => current.map((payment) => (payment.id === updatedPayment.id ? updatedPayment : payment)));
    router.refresh();
  }

  async function handleGenerateInvoice() {
    setIsGeneratingInvoice(true);
    setInvoiceError(null);

    try {
      const response = await fetch(`/api/bookings/${bookingId}/invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not generate invoice.'));
      }

      const generatedInvoice = await readJsonResponse<BookingInvoiceSummary>(response, 'Generate booking invoice');
      setInvoice(generatedInvoice);
      router.refresh();
    } catch (caughtError) {
      setInvoiceError(caughtError instanceof Error ? caughtError.message : 'Could not generate invoice.');
    } finally {
      setIsGeneratingInvoice(false);
    }
  }

  return (
    <section className="section-stack">
      <div id="financial-actions" className="booking-financial-actions-bar">
        <BookingInvoicePdfButton
          bookingId={bookingId}
          bookingRef={bookingRef}
          portalUrl={portalUrl}
          initialSentAt={initialInvoiceSentAt}
          initialSentTo={initialInvoiceSentTo}
          initialReminderSentAt={initialReminderSentAt}
          initialReminderSentTo={initialReminderSentTo}
          initialReminderCount={initialReminderCount}
          initialLastReminderAt={initialLastReminderAt}
          initialNextReminderDueAt={initialNextReminderDueAt}
          reminderAutomationActive={reminderAutomationActive}
          reminderAutomationStage={reminderAutomationStage}
          recipientEmail={invoiceRecipientEmail}
          clientOutstanding={clientOutstanding}
          overdueClientAmount={overdueClientPayments.reduce((total, payment) => total + payment.amount, 0)}
        />
        <div className="booking-payment-proof-card">
          <p className="eyebrow">Finance / Invoices</p>
          <div className="booking-payment-proof-card-grid">
            <div>
              <span>Invoice status</span>
              <strong>{invoice ? formatStatus(invoice.effectiveStatus || invoice.status) : clientOutstanding > 0 ? 'Unbilled' : 'Paid'}</strong>
            </div>
            <div>
              <span>Total</span>
              <strong>{formatMoney(invoice?.totalAmount ?? totalSell, invoice?.currency ?? currency)}</strong>
            </div>
            <div>
              <span>Paid</span>
              <strong>{formatMoney(invoice?.paidAmount ?? clientPaid, invoice?.currency ?? currency)}</strong>
            </div>
            <div>
              <span>Balance due</span>
              <strong>{formatMoney(invoice?.balanceDue ?? clientOutstanding, invoice?.currency ?? currency)}</strong>
            </div>
          </div>
          {invoice ? (
            <p className="detail-copy">
              Invoice <a href={`/invoices/${invoice.id}`}>{invoice.invoiceNumber}</a> is due {formatDateTime(invoice.dueDate)}.
            </p>
          ) : (
            <p className="detail-copy">Generate a persisted client invoice from the latest booking amendment.</p>
          )}
          {invoiceError ? <p className="form-error">{invoiceError}</p> : null}
          <button type="button" className="secondary-button" onClick={handleGenerateInvoice} disabled={isGeneratingInvoice}>
            {isGeneratingInvoice ? 'Generating...' : invoice ? 'Regenerate invoice' : 'Generate invoice'}
          </button>
        </div>
        {paymentProofSubmission ? (
          <div className="booking-payment-proof-card">
            <p className="eyebrow">Client Payment Proof</p>
            <p className="detail-copy">
              Submitted {paymentProofSubmission.submittedAt ? formatDateTime(paymentProofSubmission.submittedAt) : 'recently'}.
            </p>
            {paymentProofSubmission.reference ? (
              <p className="detail-copy">
                Reference: <strong>{paymentProofSubmission.reference}</strong>
              </p>
            ) : null}
            {paymentProofSubmission.amount !== null ? (
              <p className="detail-copy">
                Submitted amount: <strong>{formatMoney(paymentProofSubmission.amount, currency)}</strong>
              </p>
            ) : null}
            {paymentProofReceiptUrl ? (
              <p className="detail-copy">
                Receipt: <a href={paymentProofReceiptUrl} target="_blank" rel="noreferrer">View uploaded receipt</a>
              </p>
            ) : null}
            <p className="detail-copy">Use the client payment row below to confirm the payment once finance has reconciled it.</p>
          </div>
        ) : null}
      </div>

      <section className="booking-financial-summary">
        <div className="booking-financial-summary-primary">
          <BookingOperationsStatCard
            className="booking-financial-card-primary booking-financial-card-profit"
            label="Gross Profit"
            value={formatMoney(margin.grossProfit, currency)}
            helper={`Internal / Admin only | Margin ${formatPercent(margin.marginPercent)}`}
            tone={margin.margin <= 0 ? 'accent' : 'default'}
          />
          <BookingOperationsStatCard
            className="booking-financial-card-primary booking-financial-card-outstanding"
            label="Client Outstanding"
            value={formatMoney(clientOutstanding, currency)}
            helper="Amount due from client"
            tone={clientOutstanding > 0 ? 'accent' : 'default'}
          />
          <BookingOperationsStatCard
            className="booking-financial-card-primary booking-financial-card-outstanding"
            label="Supplier Outstanding"
            value={formatMoney(supplierOutstanding, currency)}
            helper="Amount due to suppliers"
            tone={supplierOutstanding > 0 ? 'accent' : 'default'}
          />
        </div>

        <div className="booking-financial-summary-secondary">
          <BookingOperationsStatCard
            className="booking-financial-card-secondary"
            label="Total Sell"
            value={formatMoney(totalSell, currency)}
            helper="Booked revenue"
          />
          <BookingOperationsStatCard
            className="booking-financial-card-secondary"
            label="Total Cost"
            value={formatMoney(totalCost, currency)}
            helper="Booked cost"
          />
          <BookingOperationsStatCard
            className="booking-financial-card-secondary"
            label="Client Paid"
            value={formatMoney(clientPaid, currency)}
            helper="Received and settled"
          />
          <BookingOperationsStatCard
            className="booking-financial-card-secondary"
            label="Supplier Paid"
            value={formatMoney(supplierPaid, currency)}
            helper="Released and settled"
          />
        </div>
      </section>

      <BookingAlertPanel
        eyebrow="Finance Watchlist"
        title="Next actions"
        tone={financeWatchlistItems.length > 0 ? 'danger' : 'neutral'}
        items={financeWatchlistItems}
        emptyLabel="No urgent finance actions are currently open."
      />

      <section className="booking-financial-payments-grid">
        <BookingPaymentsSection
          bookingId={bookingId}
          currency={currency}
          eyebrow="Incoming"
          title="Client Payments"
          type="CLIENT"
          payments={clientPayments}
          onAddPayment={handleAddPayment}
          onMarkPaid={handleMarkPaid}
        />
        <BookingPaymentsSection
          bookingId={bookingId}
          currency={currency}
          eyebrow="Outgoing"
          title="Supplier Payments"
          type="SUPPLIER"
          payments={supplierPayments}
          onAddPayment={handleAddPayment}
          onMarkPaid={handleMarkPaid}
        />
      </section>
    </section>
  );
}
