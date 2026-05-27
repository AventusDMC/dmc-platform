'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Client island for the Phase 0 destructive cleanup buttons. Posts to
// /api/hotels/admin/wipe-contracts and /api/hotels/admin/wipe-invalid-
// room-categories with the matching confirmation tokens. After a
// successful wipe, calls router.refresh() so the page re-renders the
// engine-health audit with the updated counts.

type ActionResult = {
  kind: 'success' | 'error';
  message: string;
};

type CleanupActionsProps = {
  contractCount: number;
  invalidRoomCategoryCount: number;
};

export function CleanupActions({ contractCount, invalidRoomCategoryCount }: CleanupActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<'contracts' | 'invalid' | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);

  async function runWipe(kind: 'contracts' | 'invalid') {
    const endpoint =
      kind === 'contracts'
        ? '/api/hotels/admin/wipe-contracts'
        : '/api/hotels/admin/wipe-invalid-room-categories';
    const confirmToken =
      kind === 'contracts' ? 'wipe-all-contracts' : 'wipe-invalid-room-categories';
    const friendlyName =
      kind === 'contracts' ? 'all hotel contracts' : 'invalid room categories';
    const confirmed = window.confirm(
      `This will permanently delete ${friendlyName}. Type-to-confirm dialog is intentional. Continue?`,
    );
    if (!confirmed) {
      return;
    }
    setBusy(kind);
    setResult(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: confirmToken }),
      });
      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`HTTP ${response.status}: ${errBody.slice(0, 200)}`);
      }
      const data = await response.json();
      const deletedKey = kind === 'contracts' ? 'deletedContracts' : 'deletedRoomCategories';
      const deleted = data?.[deletedKey] ?? 0;
      setResult({
        kind: 'success',
        message: `Deleted ${deleted} ${friendlyName}. Refreshing audit…`,
      });
      router.refresh();
    } catch (caughtError) {
      setResult({
        kind: 'error',
        message:
          caughtError instanceof Error
            ? caughtError.message
            : `Could not wipe ${friendlyName}.`,
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
        <button
          type="button"
          className="compact-button compact-button-danger"
          onClick={() => runWipe('contracts')}
          disabled={busy !== null || contractCount === 0}
          data-testid="wipe-contracts-button"
        >
          {busy === 'contracts'
            ? 'Wiping…'
            : `Wipe all hotel contracts (${contractCount})`}
        </button>
        <button
          type="button"
          className="compact-button compact-button-danger"
          onClick={() => runWipe('invalid')}
          disabled={busy !== null || invalidRoomCategoryCount === 0}
          data-testid="wipe-invalid-room-categories-button"
        >
          {busy === 'invalid'
            ? 'Wiping…'
            : `Wipe invalid room categories (${invalidRoomCategoryCount})`}
        </button>
      </div>
      {result ? (
        <p
          className={result.kind === 'success' ? 'table-subcopy' : 'form-error'}
          style={{ marginTop: '0.75rem' }}
          role="status"
          data-testid="cleanup-action-result"
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
