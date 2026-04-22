'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';

type QuoteInvoice = {
  id: string;
  totalAmount: number;
  currency: string;
  status: 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';
  dueDate: string;
};

type QuoteInvoiceSectionProps = {
  apiBaseUrl: string;
  invoice: QuoteInvoice | null;
};

function formatMoney(amount: number, currency = 'USD') {
  return `${currency} ${amount.toFixed(2)}`;
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(value));
}

function formatInvoiceStatus(status: QuoteInvoice['status']) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function QuoteInvoiceSection({ apiBaseUrl, invoice }: QuoteInvoiceSectionProps) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [pendingAction, setPendingAction] = useState<'paid' | 'cancel' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const canAct = invoice?.status === 'ISSUED';

  async function submitAction(action: 'paid' | 'cancel') {
    if (!invoice || !canAct) {
      return;
    }

    setPendingAction(action);
    setError('');
    setMessage('');

    const confirmed = typeof window === 'undefined'
      ? true
      : window.confirm(
          action === 'paid'
            ? 'Mark this invoice as paid?'
            : 'Cancel this invoice? This action should only be used when the invoice will not be collected.',
        );

    if (!confirmed) {
      setPendingAction(null);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/invoices/${invoice.id}/${action === 'paid' ? 'mark-paid' : 'cancel'}`, {
        method: 'PATCH',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          note: note.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not update invoice.'));
      }

      setMessage(action === 'paid' ? 'Invoice marked as paid.' : 'Invoice cancelled.');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update invoice.');
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <TableSectionShellShim title="Invoice" description="Review invoice summary and run allowed lifecycle actions from the quote workspace.">
      {!invoice ? (
        <p className="empty-state">Invoice will appear after quote acceptance.</p>
      ) : (
        <div className="split-layout">
          <article className="detail-card">
            <p className="eyebrow">Invoice Summary</p>
            <div className="quote-preview-total-list">
              <div>
                <span>Status</span>
                <strong>{formatInvoiceStatus(invoice.status)}</strong>
              </div>
              <div>
                <span>Total amount</span>
                <strong>{formatMoney(invoice.totalAmount, invoice.currency)}</strong>
              </div>
              <div>
                <span>Currency</span>
                <strong>{invoice.currency}</strong>
              </div>
              <div>
                <span>Due date</span>
                <strong>{formatDate(invoice.dueDate)}</strong>
              </div>
            </div>
          </article>

          <article className="detail-card">
            <p className="eyebrow">Invoice Actions</p>
            <div className="section-stack">
              {message ? <p className="quote-client-confirmation">{message}</p> : null}
              {error ? <p className="form-error">{error}</p> : null}
              <label className="form-field">
                <span>Audit note</span>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Optional internal note for the invoice transition."
                  disabled={!canAct || pendingAction !== null}
                />
              </label>
              <div className="table-action-row">
                <button type="button" className="secondary-button" onClick={() => submitAction('paid')} disabled={!canAct || pendingAction !== null}>
                  {pendingAction === 'paid' ? 'Marking...' : 'Mark Paid'}
                </button>
                <button type="button" className="secondary-button" onClick={() => submitAction('cancel')} disabled={!canAct || pendingAction !== null}>
                  {pendingAction === 'cancel' ? 'Cancelling...' : 'Cancel'}
                </button>
                <Link href={`/invoices/${invoice.id}`} className="secondary-button">
                  Open invoice
                </Link>
              </div>
              {!canAct ? <p className="detail-copy">Actions are disabled because this invoice is not in the issued state.</p> : null}
            </div>
          </article>
        </div>
      )}
    </TableSectionShellShim>
  );
}

function TableSectionShellShim({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="workspace-section">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">{title}</p>
          <h2>{title}</h2>
          <p className="detail-copy">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
