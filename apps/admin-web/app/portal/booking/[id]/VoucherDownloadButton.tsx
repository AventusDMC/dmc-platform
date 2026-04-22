'use client';

import { useState } from 'react';
import { getErrorMessage } from '../../../lib/api';

type VoucherDownloadButtonProps = {
  apiBaseUrl: string;
  bookingId: string;
  bookingRef: string;
  token: string;
};

export function VoucherDownloadButton({ apiBaseUrl, bookingId, bookingRef, token }: VoucherDownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState('');

  async function handleDownload() {
    try {
      setIsDownloading(true);
      setError('');
      const response = await fetch(`${apiBaseUrl}/bookings/${bookingId}/portal-voucher/pdf?token=${encodeURIComponent(token)}`);

      const contentType = response.headers.get('content-type') || '';

      if (!response.ok || !contentType.toLowerCase().includes('application/pdf')) {
        throw new Error(await getErrorMessage(response, 'Failed to download voucher PDF'));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeFileName = `${bookingRef || 'booking'}-voucher`.toLowerCase().replace(/[^a-z0-9]+/g, '-');

      link.href = url;
      link.download = `${safeFileName.replace(/^-+|-+$/g, '') || 'booking-voucher'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not download the voucher right now.');
    } finally {
      window.setTimeout(() => {
        setIsDownloading(false);
      }, 300);
    }
  }

  return (
    <div className="workspace-document-actions document-page-actions">
      <button type="button" className="secondary-button" onClick={handleDownload} disabled={isDownloading}>
        {isDownloading ? 'Downloading...' : 'Download Voucher'}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
