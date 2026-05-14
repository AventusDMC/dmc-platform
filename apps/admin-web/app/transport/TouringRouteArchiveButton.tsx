'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type TouringRouteArchiveButtonProps = {
  routeId: string;
  disabled?: boolean;
};

export function TouringRouteArchiveButton({ routeId, disabled = false }: TouringRouteArchiveButtonProps) {
  const router = useRouter();
  const [isArchiving, setIsArchiving] = useState(false);

  async function archiveRoute() {
    if (disabled || isArchiving) return;
    if (!window.confirm('Archive this touring route? Existing operational history will be preserved.')) return;
    setIsArchiving(true);
    try {
      const response = await fetch(`/api/touring-routes/${encodeURIComponent(routeId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.message || 'Could not archive touring route.');
      }
      router.refresh();
    } finally {
      setIsArchiving(false);
    }
  }

  return (
    <button type="button" className="secondary-button" onClick={archiveRoute} disabled={disabled || isArchiving}>
      {isArchiving ? 'Archiving...' : 'Delete'}
    </button>
  );
}
