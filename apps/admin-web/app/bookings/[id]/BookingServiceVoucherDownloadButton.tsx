'use client';

import { useState } from 'react';
import { getErrorMessage } from '../../lib/api';

type BookingServiceVoucherDownloadButtonProps = {
  voucherId: string;
  bookingRef: string;
  label?: string;
};

export function BookingServiceVoucherDownloadButton({
  voucherId,
  bookingRef,
  label = 'Download Voucher PDF',
}: BookingServiceVoucherDownloadButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleDownload() {
    try {
      setIsDownloading(true);
      setMessage(null);
      const response = await fetch(`/api/vouchers/${voucherId}/pdf`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const contentType = response.headers.get('content-type') || '';

      if (!response.ok || !contentType.toLowerCase().includes('application/pdf')) {
        throw new Error(await getErrorMessage(response, 'Failed to download voucher PDF.'));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const safeRef = `${bookingRef || 'booking'}-${voucherId}-voucher`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

      link.href = url;
      link.download = `${safeRef || 'service-voucher'}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: 'Voucher PDF downloaded.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to download voucher PDF.' });
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <span className="inline-action-feedback">
      <button type="button" className="secondary-button" onClick={handleDownload} disabled={isDownloading}>
        {isDownloading ? 'Downloading...' : label}
      </button>
      {message ? <span className={message.type === 'error' ? 'form-error' : 'form-helper'}>{message.text}</span> : null}
    </span>
  );
}
