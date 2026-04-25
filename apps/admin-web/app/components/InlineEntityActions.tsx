'use client';

import { ReactNode, useState } from 'react';
import { InlineRowEditorShell } from './InlineRowEditorShell';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage, logFetchUrl } from '../lib/api';

type InlineEntityActionsProps = {
  apiBaseUrl: string;
  deletePath: string;
  deleteLabel: string;
  confirmMessage: string;
  children: ReactNode;
};

export function InlineEntityActions({
  apiBaseUrl,
  deletePath,
  deleteLabel,
  confirmMessage,
  children,
}: InlineEntityActionsProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    if (!window.confirm(confirmMessage)) {
      return;
    }

    setIsDeleting(true);
    setError('');

    try {
      const response = await fetch(logFetchUrl(`${apiBaseUrl}${deletePath}`), {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not delete ${deleteLabel}.`));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not delete ${deleteLabel}.`);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="inline-entity-actions">
      <div className="inline-entity-action-bar">
        <button type="button" className="compact-button" onClick={() => setIsEditing((value) => !value)}>
          {isEditing ? 'Cancel' : 'Edit'}
        </button>
        <button type="button" className="compact-button compact-button-danger" onClick={handleDelete} disabled={isDeleting}>
          {isDeleting ? 'Deleting...' : 'Delete'}
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
      {isEditing ? <InlineRowEditorShell>{children}</InlineRowEditorShell> : null}
    </div>
  );
}
