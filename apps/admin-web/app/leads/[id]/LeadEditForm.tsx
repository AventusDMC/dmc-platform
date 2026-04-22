'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type LeadEditFormProps = {
  apiBaseUrl: string;
  leadId: string;
  initialInquiry: string;
  initialSource: string | null;
  initialStatus: string;
};

export function LeadEditForm({
  apiBaseUrl,
  leadId,
  initialInquiry,
  initialSource,
  initialStatus,
}: LeadEditFormProps) {
  const router = useRouter();
  const [inquiry, setInquiry] = useState(initialInquiry);
  const [source, setSource] = useState(initialSource || '');
  const [status, setStatus] = useState(initialStatus);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/leads/${leadId}`, {
        method: 'PATCH',
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
        throw new Error('Request failed');
      }

      router.refresh();
    } catch {
      setError('Could not update lead.');
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
          rows={6}
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
          required
        />
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save changes'}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
