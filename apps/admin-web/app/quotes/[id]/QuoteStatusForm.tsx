'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';

type QuoteStatus = 'DRAFT' | 'READY' | 'SENT' | 'ACCEPTED' | 'CONFIRMED' | 'REVISION_REQUESTED' | 'EXPIRED' | 'CANCELLED';

type QuoteVersion = {
  id: string;
  versionNumber: number;
  label: string | null;
};

type QuoteStatusFormProps = {
  apiBaseUrl: string;
  quoteId: string;
  currentStatus: QuoteStatus;
  acceptedVersionId: string | null;
  versions: QuoteVersion[];
};

export function QuoteStatusForm({
  apiBaseUrl,
  quoteId,
  currentStatus,
  acceptedVersionId,
  versions,
}: QuoteStatusFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState<QuoteStatus>(currentStatus);
  const [selectedVersionId, setSelectedVersionId] = useState(acceptedVersionId || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const requiresAcceptedVersion = status === 'ACCEPTED';
  const hasVersions = versions.length > 0;
  const hasChanges = status !== currentStatus || (requiresAcceptedVersion && selectedVersionId !== (acceptedVersionId || ''));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');

    if (requiresAcceptedVersion && !selectedVersionId) {
      setError('Choose a saved version before marking the quote as accepted.');
      return;
    }

    if (!hasChanges) {
      setMessage('No status changes to save.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/status`, {
        method: 'PATCH',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          status,
          acceptedVersionId: requiresAcceptedVersion ? selectedVersionId : null,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not update quote status.'));
      }

      setMessage('Quote status updated.');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update quote status.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="quote-status-form" onSubmit={handleSubmit}>
      <label>
        Status
        <select value={status} onChange={(event) => setStatus(event.target.value as QuoteStatus)} disabled={isSubmitting}>
          <option value="DRAFT">Draft</option>
          <option value="READY">Ready</option>
          <option value="SENT">Sent</option>
          <option value="ACCEPTED">Accepted</option>
          <option value="REVISION_REQUESTED">Revision Requested</option>
          <option value="EXPIRED">Expired</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </label>

      {requiresAcceptedVersion ? (
        <label>
          Accepted version
          <select
            value={selectedVersionId}
            onChange={(event) => setSelectedVersionId(event.target.value)}
            disabled={isSubmitting || !hasVersions}
          >
            <option value="">{hasVersions ? 'Select a saved version' : 'No saved versions available'}</option>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                {`Version ${version.versionNumber}${version.label ? ` - ${version.label}` : ''}`}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="quote-status-actions">
        <button type="submit" disabled={isSubmitting || (requiresAcceptedVersion && !hasVersions) || !hasChanges}>
          {isSubmitting ? 'Saving...' : 'Update status'}
        </button>
        {message ? <p className="quote-client-confirmation">{message}</p> : null}
        {requiresAcceptedVersion && !hasVersions ? (
          <p className="form-error">Save a version before marking this quote as accepted.</p>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
      </div>
    </form>
  );
}
