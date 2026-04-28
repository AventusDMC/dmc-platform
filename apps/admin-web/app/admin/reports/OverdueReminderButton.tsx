'use client';

import { useState } from 'react';
import { getErrorMessage } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';

export function OverdueReminderButton() {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function sendAll() {
    const confirmed = window.confirm('Send payment reminders for all overdue invoices with open balances?');
    if (!confirmed) {
      return;
    }

    setPending(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch('/api/reports/send-overdue-reminders', {
        method: 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not send overdue reminders.'));
      }

      const result = await response.json().catch(() => ({ sentCount: 0 }));
      setMessage(`${result.sentCount || 0} reminders sent.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not send overdue reminders.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="section-stack">
      <button type="button" className="secondary-button" onClick={sendAll} disabled={pending}>
        {pending ? 'Sending reminders...' : 'Send All Overdue Reminders'}
      </button>
      {message ? <p className="quote-client-confirmation">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
