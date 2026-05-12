'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage, readJsonResponse } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';

type PackageTemplateDuplicateButtonProps = {
  apiBaseUrl: string;
  packageTemplateId: string;
  packageName: string;
  navigateToCopy?: boolean;
};

type DuplicatePackageResponse = {
  id: string;
};

export function PackageTemplateDuplicateButton({
  apiBaseUrl,
  packageTemplateId,
  packageName,
  navigateToCopy = false,
}: PackageTemplateDuplicateButtonProps) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [isDuplicating, setIsDuplicating] = useState(false);

  async function duplicatePackage() {
    if (!window.confirm(`Duplicate "${packageName}" as an inactive draft copy?`)) {
      return;
    }

    setIsDuplicating(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/package-templates/${packageTemplateId}/duplicate`, {
        method: 'POST',
        headers: buildAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not duplicate package template.'));
      }

      const copy = await readJsonResponse<DuplicatePackageResponse>(response, 'Duplicate package template');
      if (navigateToCopy) {
        router.push(`/packages/${copy.id}`);
      } else {
        router.refresh();
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not duplicate package template.');
    } finally {
      setIsDuplicating(false);
    }
  }

  return (
    <span className="table-action-group">
      {error ? <span className="form-error">{error}</span> : null}
      <button type="button" className="secondary-button" onClick={duplicatePackage} disabled={isDuplicating}>
        {isDuplicating ? 'Duplicating...' : 'Duplicate'}
      </button>
    </span>
  );
}
