'use client';

import { useState } from 'react';
import { getErrorMessage } from '../../lib/api';

type BookingInvoiceMode = 'PACKAGE' | 'ITEMIZED';

type BookingInvoicePdfButtonProps = {
  bookingId: string;
  bookingRef: string;
  portalUrl: string;
  initialSentAt: string | null;
  initialSentTo: string | null;
  initialReminderSentAt: string | null;
  initialReminderSentTo: string | null;
  initialReminderCount: number;
  initialLastReminderAt: string | null;
  initialNextReminderDueAt: string | null;
  reminderAutomationActive: boolean;
  reminderAutomationStage: 'gentle' | 'firm' | 'urgent';
  recipientEmail: string | null;
  clientOutstanding: number;
  overdueClientAmount: number;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function getReminderStageLabel(stage: 'gentle' | 'firm' | 'urgent') {
  if (stage === 'urgent') {
    return 'Urgent cadence';
  }

  if (stage === 'firm') {
    return 'Firm cadence';
  }

  return 'Gentle cadence';
}

export function BookingInvoicePdfButton({
  bookingId,
  bookingRef,
  portalUrl,
  initialSentAt,
  initialSentTo,
  initialReminderSentAt,
  initialReminderSentTo,
  initialReminderCount,
  initialLastReminderAt,
  initialNextReminderDueAt,
  reminderAutomationActive,
  reminderAutomationStage,
  recipientEmail,
  clientOutstanding,
  overdueClientAmount,
}: BookingInvoicePdfButtonProps) {
  const [mode, setMode] = useState<BookingInvoiceMode>('PACKAGE');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sentAt, setSentAt] = useState(initialSentAt);
  const [sentTo, setSentTo] = useState(initialSentTo);
  const [reminderSentAt, setReminderSentAt] = useState(initialReminderSentAt);
  const [reminderSentTo, setReminderSentTo] = useState(initialReminderSentTo);
  const [reminderCount, setReminderCount] = useState(initialReminderCount);
  const [lastReminderAt, setLastReminderAt] = useState(initialLastReminderAt);
  const [nextReminderDueAt, setNextReminderDueAt] = useState(initialNextReminderDueAt);
  const [success, setSuccess] = useState('');
  const [reminderSuccess, setReminderSuccess] = useState('');
  const [portalSuccess, setPortalSuccess] = useState('');
  const [error, setError] = useState('');
  const [reminderError, setReminderError] = useState('');
  const [portalError, setPortalError] = useState('');
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [isCopyingPortal, setIsCopyingPortal] = useState(false);

  function handleOpenPortal() {
    window.open(portalUrl, '_blank', 'noopener,noreferrer');
  }

  async function handleCopyPortalLink() {
    try {
      setIsCopyingPortal(true);
      setPortalError('');
      setPortalSuccess('');
      await navigator.clipboard.writeText(portalUrl);
      setPortalSuccess('Client portal link copied to clipboard.');
    } catch (caughtError) {
      setPortalError(caughtError instanceof Error ? caughtError.message : 'Could not copy the portal link right now.');
    } finally {
      window.setTimeout(() => setIsCopyingPortal(false), 300);
    }
  }

  async function handleDownload() {
    try {
      setIsDownloading(true);
      setError('');
      const response = await fetch(`/api/invoice/${bookingId}/pdf?mode=${mode}`);
      const contentType = response.headers.get('content-type') || '';

      if (!response.ok || !contentType.toLowerCase().includes('application/pdf')) {
        throw new Error(await getErrorMessage(response, 'Failed to download invoice PDF'));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeFileName = `${bookingRef || 'booking'}-invoice`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      link.href = url;
      link.download = `${safeFileName.replace(/^-+|-+$/g, '') || 'booking-invoice'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not download the invoice right now.');
    } finally {
      window.setTimeout(() => setIsDownloading(false), 300);
    }
  }

  async function handleSend() {
    try {
      setIsSending(true);
      setError('');
      setSuccess('');

      const response = await fetch(`/api/bookings/${bookingId}/invoice/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: recipientEmail,
          mode,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Failed to send invoice'));
      }

      const payload = (await response.json()) as {
        sentAt: string;
        sentTo: string;
      };
      setSentAt(payload.sentAt);
      setSentTo(payload.sentTo);
      setSuccess(`Invoice sent to ${payload.sentTo}${payload.sentAt ? ` at ${formatDateTime(payload.sentAt)}` : ''}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not send the invoice right now.');
    } finally {
      window.setTimeout(() => setIsSending(false), 300);
    }
  }

  async function handleSendReminder() {
    try {
      setIsSendingReminder(true);
      setReminderError('');
      setReminderSuccess('');

      const response = await fetch(`/api/bookings/${bookingId}/payments/reminder`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: recipientEmail,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Failed to send payment reminder'));
      }

      const payload = (await response.json()) as {
        sentAt: string;
        sentTo: string;
        reminderCount?: number;
        lastReminderAt?: string | null;
        nextReminderDueAt?: string | null;
      };
      setReminderSentAt(payload.sentAt);
      setReminderSentTo(payload.sentTo);
      setReminderCount(payload.reminderCount ?? reminderCount + 1);
      setLastReminderAt(payload.lastReminderAt ?? payload.sentAt);
      setNextReminderDueAt(payload.nextReminderDueAt ?? null);
      setReminderSuccess(`Reminder sent to ${payload.sentTo}${payload.sentAt ? ` at ${formatDateTime(payload.sentAt)}` : ''}.`);
    } catch (caughtError) {
      setReminderError(caughtError instanceof Error ? caughtError.message : 'Could not send the payment reminder right now.');
    } finally {
      window.setTimeout(() => setIsSendingReminder(false), 300);
    }
  }

  return (
    <div className="booking-invoice-pdf-actions">
      <label className="booking-invoice-mode-field">
        <span>Invoice mode</span>
        <select
          value={mode}
          onChange={(event) => setMode(event.target.value as BookingInvoiceMode)}
          disabled={isDownloading || isSending || isSendingReminder || isCopyingPortal}
        >
          <option value="PACKAGE">Package</option>
          <option value="ITEMIZED">Itemized</option>
        </select>
      </label>
      <button type="button" className="secondary-button" onClick={handleDownload} disabled={isDownloading || isSending || isSendingReminder || isCopyingPortal}>
        {isDownloading ? 'Preparing invoice...' : 'Download Invoice PDF'}
      </button>
      <button
        type="button"
        className="secondary-button"
        onClick={handleSend}
        disabled={isDownloading || isSending || isSendingReminder || isCopyingPortal || !recipientEmail}
      >
        {isSending ? 'Sending invoice...' : sentAt ? 'Resend Invoice' : 'Send Invoice'}
      </button>
      <button
        type="button"
        className="secondary-button"
        onClick={handleOpenPortal}
        disabled={isDownloading || isSending || isSendingReminder || isCopyingPortal}
      >
        Open Client Portal
      </button>
      <button
        type="button"
        className="secondary-button"
        onClick={handleCopyPortalLink}
        disabled={isDownloading || isSending || isSendingReminder || isCopyingPortal}
      >
        {isCopyingPortal ? 'Copying link...' : 'Copy Portal Link'}
      </button>
      {clientOutstanding > 0 ? (
        <button
          type="button"
          className="secondary-button"
          onClick={handleSendReminder}
          disabled={isDownloading || isSending || isSendingReminder || isCopyingPortal || !recipientEmail}
        >
          {isSendingReminder ? 'Sending reminder...' : reminderSentAt ? 'Resend Reminder' : 'Send Reminder'}
        </button>
      ) : null}
      {recipientEmail ? <p className="form-helper">Sends to {recipientEmail}</p> : <p className="form-error">No recipient email is available for this booking.</p>}
      {sentAt ? <p className="form-helper">Sent at {formatDateTime(sentAt)}{sentTo ? ` to ${sentTo}` : ''}.</p> : null}
      {clientOutstanding > 0 ? (
        <p className="form-helper">
          Reminder tracks {clientOutstanding.toFixed(2)} outstanding
          {overdueClientAmount > 0 ? ` | ${overdueClientAmount.toFixed(2)} overdue` : ''}.
        </p>
      ) : null}
      {reminderSentAt ? <p className="form-helper">Last reminder sent at {formatDateTime(reminderSentAt)}{reminderSentTo ? ` to ${reminderSentTo}` : ''}.</p> : null}
      {clientOutstanding > 0 && reminderAutomationActive ? (
        <p className="form-helper">
          Auto reminders active
          {reminderCount > 0 ? ` | ${reminderCount} sent` : ' | no reminders sent yet'}
          {lastReminderAt ? ` | last ${formatDateTime(lastReminderAt)}` : ''}
          {nextReminderDueAt ? ` | next ${formatDateTime(nextReminderDueAt)}` : ''}
          {` | ${getReminderStageLabel(reminderAutomationStage)}`}
        </p>
      ) : null}
      {success ? <p className="form-helper">{success}</p> : null}
      {reminderSuccess ? <p className="form-helper">{reminderSuccess}</p> : null}
      {portalSuccess ? <p className="form-helper">{portalSuccess}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {reminderError ? <p className="form-error">{reminderError}</p> : null}
      {portalError ? <p className="form-error">{portalError}</p> : null}
    </div>
  );
}
