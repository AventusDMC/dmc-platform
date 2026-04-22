'use client';

import { useState } from 'react';
import { getErrorMessage } from '../../lib/api';

type BookingDocumentActionsProps = {
  apiBaseUrl: string;
  bookingId: string;
  bookingRef: string;
  documentLabel: string;
  documentType: 'voucher' | 'supplier-confirmation';
};

export function BookingDocumentActions({
  apiBaseUrl,
  bookingId,
  bookingRef,
  documentLabel,
  documentType,
}: BookingDocumentActionsProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState('');

  async function handleDownloadPdf() {
    try {
      setIsDownloading(true);
      setError('');
      const response = await fetch(`${apiBaseUrl}/bookings/${bookingId}/${documentType}/pdf`);

      const contentType = response.headers.get('content-type') || '';

      if (!response.ok || !contentType.toLowerCase().includes('application/pdf')) {
        throw new Error(await getErrorMessage(response, 'Failed to download PDF'));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeFileName = `${bookingRef || 'booking'}-${documentType}`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      link.href = url;
      link.download = `${safeFileName.replace(/^-+|-+$/g, '') || 'booking-document'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not download the PDF right now.');
    } finally {
      window.setTimeout(() => {
        setIsDownloading(false);
      }, 300);
    }
  }

  function handleSendByEmail() {
    const subject = `${documentLabel} - ${bookingRef}`;
    const body = `Please find the ${documentLabel.toLowerCase()} for booking reference ${bookingRef}.\n\nDocument link:\n${window.location.href}`;

    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="workspace-document-actions document-page-actions">
      <button type="button" className="secondary-button" onClick={handleDownloadPdf} disabled={isDownloading}>
        {isDownloading ? 'Downloading...' : 'Download PDF'}
      </button>
      <button type="button" className="secondary-button" onClick={handleSendByEmail}>
        Open email draft
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
