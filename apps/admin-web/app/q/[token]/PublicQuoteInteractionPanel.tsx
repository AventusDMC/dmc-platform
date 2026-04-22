'use client';

import { useState } from 'react';
import { getErrorMessage, readJsonResponse } from '../../lib/api';

type PublicQuoteStatus = 'DRAFT' | 'READY' | 'SENT' | 'ACCEPTED' | 'CONFIRMED' | 'REVISION_REQUESTED' | 'EXPIRED' | 'CANCELLED';
type PublicInvoiceStatus = 'DRAFT' | 'ISSUED' | 'PAID';

type PublicQuoteInvoice = {
  id: string;
  quoteId: string;
  totalAmount: number;
  currency: string;
  status: PublicInvoiceStatus;
  dueDate: string;
};

type PublicQuoteInteractionPanelProps = {
  apiBaseUrl: string;
  token: string;
  initialStatus: PublicQuoteStatus;
  initialInvoice: PublicQuoteInvoice | null;
};

function getStatusLabel(status: PublicQuoteStatus) {
  return status
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function getInvoiceStatusLabel(status: PublicInvoiceStatus) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatMoney(amount: number, currency = 'USD') {
  return `${currency} ${amount.toFixed(2)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
  }).format(new Date(value));
}

export function PublicQuoteInteractionPanel({
  apiBaseUrl,
  token,
  initialStatus,
  initialInvoice,
}: PublicQuoteInteractionPanelProps) {
  const [status, setStatus] = useState<PublicQuoteStatus>(initialStatus);
  const [invoice, setInvoice] = useState<PublicQuoteInvoice | null>(initialInvoice);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [lastAction, setLastAction] = useState<'accept' | 'request-changes' | 'payment' | null>(null);

  const isLocked = status === 'ACCEPTED' || status === 'CONFIRMED' || status === 'REVISION_REQUESTED';
  const trimmedMessage = message.trim();

  async function postAction(path: string, body?: Record<string, unknown>) {
    setIsSubmitting(true);
    setError('');
    setConfirmation('');

    try {
      const response = await fetch(`${apiBaseUrl}/quotes/public/${token}/${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not update quote response.'));
      }

      const data = await readJsonResponse<Record<string, unknown>>(response, 'Could not update quote response.');
      const nextStatus = (typeof data?.status === 'string' ? data.status : status) as PublicQuoteStatus;
      setStatus(nextStatus);
      setInvoice(data?.invoice && typeof data.invoice === 'object' ? (data.invoice as PublicQuoteInvoice) : invoice);
      return nextStatus;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAccept() {
    try {
      setLastAction('accept');
      await postAction('accept');
      setConfirmation('Your acceptance has been recorded. Your invoice is ready for payment.');
      setShowRequestModal(false);
      setMessage('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not record acceptance.');
    }
  }

  async function handleRequestChanges() {
    if (!trimmedMessage) {
      setError('Add a short note so the team knows what to revise.');
      return;
    }

    try {
      setLastAction('request-changes');
      await postAction('request-changes', { message: trimmedMessage });
      setConfirmation('Your change request has been sent.');
      setShowRequestModal(false);
      setMessage('');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not submit change request.');
    }
  }

  return (
    <div className="quote-send-actions quote-client-actions">
      <p className="detail-copy">Status: {getStatusLabel(status)}</p>
      <p className="detail-copy">
        {isLocked
          ? 'This quote response is already recorded. If you need anything else, please contact your consultant.'
          : 'Review the itinerary and pricing, then accept the quote or request revisions.'}
      </p>
      {confirmation ? <p className="quote-client-confirmation">{confirmation}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {status === 'ACCEPTED' || status === 'CONFIRMED' ? (
        <div className="detail-card quote-client-invoice-card">
          <div>
            <p className="eyebrow">Invoice</p>
            <h2 className="section-title" style={{ fontSize: '1.05rem' }}>Payment readiness</h2>
          </div>
          {invoice ? (
            <div className="quote-client-invoice-grid">
              <div>
                <span>Total due</span>
                <strong>{formatMoney(invoice.totalAmount, invoice.currency)}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{getInvoiceStatusLabel(invoice.status)}</strong>
              </div>
              <div>
                <span>Due date</span>
                <strong>{formatDate(invoice.dueDate)}</strong>
              </div>
            </div>
          ) : (
            <p className="detail-copy">Invoice setup is being prepared.</p>
          )}
          <button
            type="button"
            className="secondary-button quote-client-cta quote-client-cta-primary"
            onClick={() => {
              setLastAction('payment');
              setError('');
              setConfirmation('Payment handoff is not enabled in this demo yet. Your consultant can share the next payment step.');
            }}
            disabled={!invoice}
          >
            Proceed to payment
          </button>
        </div>
      ) : null}
      <button type="button" className="secondary-button quote-client-cta quote-client-cta-primary" onClick={handleAccept} disabled={isSubmitting || isLocked}>
        {isSubmitting && lastAction === 'accept' ? 'Recording acceptance...' : 'Accept Quote'}
      </button>
      <button
        type="button"
        className="secondary-button quote-client-cta"
        onClick={() => {
          setShowRequestModal(true);
          setError('');
          setConfirmation('');
        }}
        disabled={isSubmitting || isLocked}
      >
        Request Changes
      </button>

      {showRequestModal ? (
        <div className="quote-client-modal-backdrop">
          <div className="detail-card quote-client-modal-card">
            <div>
              <p className="eyebrow">Request Changes</p>
              <h2 className="section-title" style={{ fontSize: '1.2rem' }}>Tell us what to update</h2>
            </div>
            <textarea
              className="form-textarea"
              rows={6}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Share the revisions you would like."
              disabled={isSubmitting}
            />
            {!trimmedMessage ? <p className="detail-copy">Add the changes you want so the team can update the proposal accurately.</p> : null}
            <div className="table-action-row quote-client-modal-actions">
              <button type="button" className="secondary-button quote-client-cta quote-client-cta-primary" onClick={handleRequestChanges} disabled={isSubmitting || !trimmedMessage}>
                {isSubmitting && lastAction === 'request-changes' ? 'Sending request...' : 'Submit request'}
              </button>
              <button
                type="button"
                className="secondary-button quote-client-cta"
                onClick={() => {
                  setShowRequestModal(false);
                  setError('');
                }}
                disabled={isSubmitting}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
