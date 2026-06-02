'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';

type SaveQuoteAsTemplateButtonProps = {
  apiBaseUrl: string;
  quoteId: string;
  quoteTitle?: string | null;
};

export function SaveQuoteAsTemplateButton({ apiBaseUrl, quoteId, quoteTitle }: SaveQuoteAsTemplateButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setIsSaving(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/package-templates/from-quote`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ quoteId, name: name.trim() || null }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save this quote as a package template.'));
      }

      const template = (await response.json()) as { id: string };
      router.push(`/packages/${template.id}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save this quote as a package template.');
      setIsSaving(false);
    }
  }

  if (!isOpen) {
    return (
      <button type="button" className="secondary-button" onClick={() => setIsOpen(true)}>
        Save as package template
      </button>
    );
  }

  return (
    <span className="table-action-group" onClick={(event) => event.stopPropagation()}>
      {error ? <span className="form-error">{error}</span> : null}
      <input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder={quoteTitle ? `${quoteTitle} (template)` : 'Template name (optional)'}
        aria-label="New package template name"
        disabled={isSaving}
      />
      <button type="button" className="primary-button" onClick={handleSave} disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Create template'}
      </button>
      <button
        type="button"
        className="secondary-button"
        onClick={() => {
          setIsOpen(false);
          setError('');
        }}
        disabled={isSaving}
      >
        Cancel
      </button>
    </span>
  );
}
