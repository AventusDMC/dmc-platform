'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';

type PackageComponentRemoveButtonProps = {
  apiBaseUrl: string;
  packageTemplateId: string;
  componentId: string;
  label: string;
};

export function PackageComponentRemoveButton({ apiBaseUrl, packageTemplateId, componentId, label }: PackageComponentRemoveButtonProps) {
  const router = useRouter();
  const [isRemoving, setIsRemoving] = useState(false);
  const [error, setError] = useState('');

  async function removeComponent() {
    if (!window.confirm(`Remove ${label} from this package template?`)) {
      return;
    }

    setIsRemoving(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/package-templates/${packageTemplateId}/components/${componentId}`, {
        method: 'DELETE',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not remove package component.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not remove package component.');
    } finally {
      setIsRemoving(false);
    }
  }

  return (
    <span className="table-action-group">
      {error ? <span className="form-error">{error}</span> : null}
      <button type="button" className="compact-button compact-button-danger" onClick={removeComponent} disabled={isRemoving}>
        {isRemoving ? 'Removing...' : 'Remove'}
      </button>
    </span>
  );
}
