'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';

type LeadsFormProps = {
  apiBaseUrl: string;
  leadId?: string;
  submitLabel?: string;
  initialValues?: {
    inquiry: string;
    source: string;
    status: string;
  };
};

export function LeadsForm({ apiBaseUrl, leadId, submitLabel, initialValues }: LeadsFormProps) {
  const router = useRouter();
  const [inquiry, setInquiry] = useState(initialValues?.inquiry || '');
  const [source, setSource] = useState(initialValues?.source || '');
  const [status, setStatus] = useState(initialValues?.status || 'new');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(leadId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/leads${leadId ? `/${leadId}` : ''}`, {
        method: leadId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inquiry,
          source,
          status,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} lead.`));
      }

      if (!isEditing) {
        setInquiry('');
        setSource('');
        setStatus('new');
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} lead.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="lead-form" onSubmit={handleSubmit}>
      <label>
        Inquiry
        <textarea
          value={inquiry}
          onChange={(event) => setInquiry(event.target.value)}
          required
          rows={4}
        />
      </label>

      <label>
        Source
        <input
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="Website, email, referral..."
        />
      </label>

      <label>
        Status
        <input
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          placeholder="new"
        />
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Create lead')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
