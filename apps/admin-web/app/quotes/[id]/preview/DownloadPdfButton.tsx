'use client';

import { useState } from 'react';
import { getErrorMessage } from '../../../lib/api';
import { getQuoteExportPdfHref } from '../proposal-paths';

type DownloadPdfButtonProps = {
  apiBaseUrl: string;
  quoteId: string;
};

export function DownloadPdfButton({ apiBaseUrl, quoteId }: DownloadPdfButtonProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState('');

  async function handleDownload() {
    try {
      setIsDownloading(true);
      setError('');

      const response = await fetch(getQuoteExportPdfHref(apiBaseUrl, quoteId));

      const contentType = response.headers.get('content-type') || '';

      if (!response.ok || !contentType.toLowerCase().includes('application/pdf')) {
        throw new Error(await getErrorMessage(response, 'Failed to export quote PDF'));
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = `quote-${quoteId}-export.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not download the quote PDF.');
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="section-stack">
      <button type="button" className="secondary-button" onClick={handleDownload} disabled={isDownloading}>
        {isDownloading ? 'Exporting...' : 'Export quote PDF'}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
