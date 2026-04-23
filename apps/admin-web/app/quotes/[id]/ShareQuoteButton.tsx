'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage, readJsonResponse } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';

type ShareQuoteButtonProps = {
  apiBaseUrl: string;
  quoteId: string;
  initialPublicToken?: string | null;
  initialPublicEnabled?: boolean;
};

export function ShareQuoteButton({
  apiBaseUrl,
  quoteId,
  initialPublicToken = null,
  initialPublicEnabled = false,
}: ShareQuoteButtonProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [isPublicEnabled, setIsPublicEnabled] = useState(initialPublicEnabled);
  const [publicToken, setPublicToken] = useState(initialPublicEnabled ? initialPublicToken : null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const shareUrl = useMemo(() => {
    if (!publicToken) {
      return '';
    }

    if (typeof window === 'undefined') {
      return `/q/${publicToken}`;
    }

    return `${window.location.origin}/q/${publicToken}`;
  }, [publicToken]);

  async function handleLinkAction(path: string, successMessage: string) {
    setIsSubmitting(true);
    setMessage('');
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/${path}`, {
        method: 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not update public quote link.'));
      }

      const data = await readJsonResponse<Record<string, unknown>>(response, 'Could not update public quote link.');
      const nextEnabled = Boolean(data?.publicEnabled);
      const nextToken = typeof data?.publicToken === 'string' ? data.publicToken : null;

      setIsPublicEnabled(nextEnabled);
      setPublicToken(nextEnabled ? nextToken : null);
      setMessage(successMessage);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update public quote link.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEnableLink() {
    return handleLinkAction('enable-public-link', 'Share link ready');
  }

  async function handleDisableLink() {
    return handleLinkAction('disable-public-link', 'Share link disabled');
  }

  async function handleRegenerateLink() {
    return handleLinkAction('regenerate-public-link', 'Share link regenerated');
  }

  async function handleCopyLink() {
    if (!shareUrl) {
      return;
    }

    setIsCopying(true);
    setMessage('');
    setError('');

    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage('Share link copied');
    } catch {
      setError('Could not copy share link.');
    } finally {
      setIsCopying(false);
    }
  }

  return (
    <div className="quote-send-actions quote-share-actions">
      <p className="detail-copy">Public link: {isPublicEnabled && publicToken ? 'Enabled' : 'Disabled'}</p>
      {!isPublicEnabled ? <p className="detail-copy">Enable a link to let the client review the latest shared quote online.</p> : null}
      <button type="button" className="secondary-button" onClick={handleEnableLink} disabled={isSubmitting || isPublicEnabled}>
        {isSubmitting && !isPublicEnabled ? 'Preparing link...' : isPublicEnabled ? 'Share enabled' : 'Share quote'}
      </button>
      {isPublicEnabled && shareUrl ? (
        <>
          <a href={shareUrl} target="_blank" rel="noreferrer" className="detail-copy quote-share-link">
            {shareUrl}
          </a>
          <button type="button" className="secondary-button" onClick={handleRegenerateLink} disabled={isSubmitting}>
            {isSubmitting ? 'Regenerating...' : 'Regenerate link'}
          </button>
          <button type="button" className="secondary-button" onClick={handleDisableLink} disabled={isSubmitting}>
            {isSubmitting ? 'Disabling...' : 'Disable link'}
          </button>
          <button type="button" className="secondary-button" onClick={handleCopyLink} disabled={isCopying || !shareUrl}>
            {isCopying ? 'Copying...' : 'Copy link'}
          </button>
        </>
      ) : null}
      {message ? <p className="detail-copy">{message}</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
