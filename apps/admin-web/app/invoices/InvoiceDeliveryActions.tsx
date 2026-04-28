'use client';

import { useState } from 'react';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';

type InvoiceDeliveryActionsProps = {
  invoiceId: string;
  invoiceNumber: string;
  defaultEmail: string | null;
  disabled?: boolean;
};

export function InvoiceDeliveryActions({
  invoiceId,
  invoiceNumber,
  defaultEmail,
  disabled = false,
}: InvoiceDeliveryActionsProps) {
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const [reminderPending, setReminderPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function sendInvoice() {
    setPending(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`/api/invoices/${invoiceId}/send`, {
        method: 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          email: email.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not send invoice.'));
      }

      const result = await response.json().catch(() => ({ email: email.trim() || defaultEmail }));
      setMessage(`Invoice sent to ${result.email || email.trim() || defaultEmail || 'recipient'}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not send invoice.');
    } finally {
      setPending(false);
    }
  }

  async function sendReminder() {
    setReminderPending(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`/api/invoices/${invoiceId}/send-reminder`, {
        method: 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          email: email.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not send reminder.'));
      }

      const result = await response.json().catch(() => ({ email: email.trim() || defaultEmail }));
      setMessage(`Payment reminder sent to ${result.email || email.trim() || defaultEmail || 'recipient'}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not send reminder.');
    } finally {
      setReminderPending(false);
    }
  }

  return (
    <div className="section-stack">
      <div className="table-action-row">
        <a className="secondary-button" href={`/api/invoices/${invoiceId}/pdf`}>
          Download PDF
        </a>
      </div>
      <label className="form-field">
        <span>Email override</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={defaultEmail || 'client@example.com'}
          disabled={pending || disabled}
        />
      </label>
      <button type="button" className="primary-button" onClick={sendInvoice} disabled={pending || disabled}>
        {pending ? 'Sending...' : `Send Invoice ${invoiceNumber}`}
      </button>
      <button type="button" className="secondary-button" onClick={sendReminder} disabled={reminderPending || disabled}>
        {reminderPending ? 'Sending reminder...' : 'Send Reminder'}
      </button>
      {message ? <p className="quote-client-confirmation">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {disabled ? <p className="detail-copy">Cancelled invoices cannot be sent by default.</p> : null}
    </div>
  );
}
