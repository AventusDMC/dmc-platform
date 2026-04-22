'use client';

import { useState } from 'react';

type BookingPortalLinkActionsProps = {
  apiBaseUrl: string;
  bookingId: string;
  portalUrl: string;
};

export function BookingPortalLinkActions({ apiBaseUrl, bookingId, portalUrl }: BookingPortalLinkActionsProps) {
  const [isCopying, setIsCopying] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  async function handleCopy() {
    try {
      setIsCopying(true);
      await navigator.clipboard.writeText(portalUrl);
    } finally {
      window.setTimeout(() => {
        setIsCopying(false);
      }, 600);
    }
  }

  async function handleRegenerate() {
    try {
      setIsRegenerating(true);
      const response = await fetch(`${apiBaseUrl}/bookings/${bookingId}/portal-access-token`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to regenerate portal link');
      }

      window.location.reload();
    } finally {
      window.setTimeout(() => {
        setIsRegenerating(false);
      }, 300);
    }
  }

  return (
    <div className="workspace-document-actions">
      <button type="button" className="secondary-button" onClick={handleCopy} disabled={isCopying}>
        {isCopying ? 'Copied' : 'Copy link'}
      </button>
      <button type="button" className="secondary-button" onClick={handleRegenerate} disabled={isRegenerating}>
        {isRegenerating ? 'Regenerating...' : 'Regenerate link'}
      </button>
    </div>
  );
}
