'use client';

import { useState } from 'react';
import { getErrorMessage } from '../../lib/api';

type InvoicePortalActionsProps = {
  token: string;
  invoiceNumber: string;
  supportEmail: string | null;
  initialAcknowledgedAt: string | null;
  initialPaymentProofSubmission?: {
    reference: string | null;
    amount: number | null;
    receiptUrl: string | null;
    submittedAt: string | null;
  } | null;
};

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

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  return `${apiBaseUrl}${value.startsWith('/') ? value : `/${value}`}`;
}

export function InvoicePortalActions({
  token,
  invoiceNumber,
  supportEmail,
  initialAcknowledgedAt,
  initialPaymentProofSubmission,
}: InvoicePortalActionsProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [acknowledgedAt, setAcknowledgedAt] = useState(initialAcknowledgedAt);
  const [reference, setReference] = useState(initialPaymentProofSubmission?.reference || '');
  const [amount, setAmount] = useState(initialPaymentProofSubmission?.amount ? initialPaymentProofSubmission.amount.toFixed(2) : '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [paymentProofSubmission, setPaymentProofSubmission] = useState(initialPaymentProofSubmission || null);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  async function handleDownload() {
    try {
      setIsDownloading(true);
      setError('');
      const response = await fetch(`/api/public/invoice/${token}/pdf`);
      const contentType = response.headers.get('content-type') || '';

      if (!response.ok || !contentType.toLowerCase().includes('application/pdf')) {
        throw new Error(await getErrorMessage(response, 'Failed to download invoice PDF'));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeFileName = `${invoiceNumber || 'invoice'}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      link.href = url;
      link.download = `${safeFileName.replace(/^-+|-+$/g, '') || 'invoice'}.pdf`;
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

  async function handleSubmitProof() {
    try {
      if (!reference.trim() && !selectedFile && !amount.trim()) {
        setError('Add a payment amount, payment reference, or attach a receipt before submitting.');
        return;
      }

      setIsSubmittingProof(true);
      setError('');
      setSuccess('');
      const formData = new FormData();
      if (reference.trim()) {
        formData.append('reference', reference.trim());
      }
      if (amount.trim()) {
        formData.append('amount', amount.trim());
      }
      if (selectedFile) {
        formData.append('file', selectedFile);
      }

      const response = await fetch(`/api/public/invoice/${token}/payment-proof`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Failed to submit payment proof'));
      }

      const payload = (await response.json()) as {
        submittedAt: string;
        paymentProofSubmission?: {
          reference: string | null;
          amount: number | null;
          receiptUrl: string | null;
          submittedAt: string | null;
        } | null;
      };
      setAcknowledgedAt(payload.submittedAt);
      setPaymentProofSubmission(
        payload.paymentProofSubmission || {
          reference: reference.trim() || null,
          amount: amount.trim() ? Number(amount) : null,
          receiptUrl: null,
          submittedAt: payload.submittedAt,
        },
      );
      setSelectedFile(null);
      setSuccess('Thanks. Your payment proof was submitted and our finance team will review it shortly.');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not submit your payment proof right now.');
    } finally {
      window.setTimeout(() => setIsSubmittingProof(false), 300);
    }
  }

  const contactHref = supportEmail
    ? `mailto:${supportEmail}?subject=${encodeURIComponent(`Invoice support - ${invoiceNumber}`)}`
    : null;
  const receiptHref = resolveReceiptUrl(paymentProofSubmission?.receiptUrl);

  return (
    <div className="invoice-portal-actions">
      <div className="invoice-portal-proof-form">
        <label>
          Payment Amount
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            placeholder="0.00"
            disabled={isDownloading || isSubmittingProof}
          />
        </label>
        <label>
          Payment Reference
          <input
            type="text"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Wire reference, transaction ID, or bank note"
            disabled={isDownloading || isSubmittingProof}
          />
        </label>
        <label>
          Receipt Upload
          <input
            type="file"
            accept="image/*,application/pdf"
            onChange={(event) => setSelectedFile(event.target.files?.[0] || null)}
            disabled={isDownloading || isSubmittingProof}
          />
        </label>
        <button
          type="button"
          className="invoice-portal-primary-button"
          onClick={handleSubmitProof}
          disabled={isDownloading || isSubmittingProof}
        >
          {isSubmittingProof ? 'Submitting proof...' : 'Submit Payment Proof'}
        </button>
      </div>
      <button type="button" className="secondary-button" onClick={handleDownload} disabled={isDownloading || isSubmittingProof}>
        {isDownloading ? 'Downloading...' : 'Download PDF'}
      </button>
      {contactHref ? (
        <a className="secondary-button" href={contactHref}>
          Contact Support
        </a>
      ) : null}
      <div className="invoice-portal-feedback">
        {paymentProofSubmission?.submittedAt ? (
          <p className="form-helper">
            Payment proof submitted on {formatDateTime(paymentProofSubmission.submittedAt)}
            {paymentProofSubmission.amount !== null ? ` | Amount: ${paymentProofSubmission.amount.toFixed(2)}` : ''}
            {paymentProofSubmission.reference ? ` | Ref: ${paymentProofSubmission.reference}` : ''}.
          </p>
        ) : acknowledgedAt ? <p className="form-helper">Payment confirmed by client on {formatDateTime(acknowledgedAt)}.</p> : null}
        {receiptHref ? (
          <p className="form-helper">
            Receipt uploaded: <a href={receiptHref} target="_blank" rel="noreferrer">View receipt</a>
          </p>
        ) : null}
        {success ? <p className="form-helper">{success}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
      </div>
    </div>
  );
}
