'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';

type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID' | 'CANCELLED';

type InvoiceStatusFormProps = {
  apiBaseUrl: string;
  invoiceId: string;
  currentStatus: InvoiceStatus;
  compact?: boolean;
};

function formatStatus(status: InvoiceStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function InvoiceStatusForm({ apiBaseUrl, invoiceId, currentStatus, compact = false }: InvoiceStatusFormProps) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [pendingAction, setPendingAction] = useState<'paid' | 'cancel' | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const canAct = currentStatus === 'ISSUED';

  async function submitAction(action: 'paid' | 'cancel') {
    if (!canAct) {
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
            : 'Cancel this invoice? This should only be used when the invoice will not be collected.',
        );

    if (!confirmed) {
      setPendingAction(null);
      return;
    }

    try {
      const response = await fetch(`${apiBaseUrl}/invoices/${invoiceId}/${action === 'paid' ? 'mark-paid' : 'cancel'}`, {
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
    <div className="section-stack">
      <div className="quote-preview-total-list">
        <div>
          <span>Current status</span>
          <strong>{formatStatus(currentStatus)}</strong>
        </div>
        <div>
          <span>Allowed actions</span>
          <strong>{canAct ? 'Mark Paid / Cancel' : 'Terminal'}</strong>
        </div>
      </div>
      {message ? <p className="quote-client-confirmation">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {canAct ? (
        <>
          <label className="form-field">
            <span>Audit note</span>
            <textarea
              className="form-textarea"
              rows={compact ? 3 : 4}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional internal note for the audit trail."
              disabled={pendingAction !== null}
            />
          </label>
          <div className="table-action-row">
            <button type="button" className="secondary-button" onClick={() => submitAction('paid')} disabled={pendingAction !== null}>
              {pendingAction === 'paid' ? 'Marking...' : 'Mark Paid'}
            </button>
            <button type="button" className="secondary-button" onClick={() => submitAction('cancel')} disabled={pendingAction !== null}>
              {pendingAction === 'cancel' ? 'Cancelling...' : 'Cancel'}
            </button>
          </div>
        </>
      ) : (
        <p className="detail-copy">This invoice is in a terminal state and cannot move further.</p>
      )}
    </div>
  );
}
