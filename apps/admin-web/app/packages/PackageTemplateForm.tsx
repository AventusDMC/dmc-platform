'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';

type PackageTemplateFormProps = {
  apiBaseUrl: string;
};

export function PackageTemplateForm({ apiBaseUrl }: PackageTemplateFormProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [durationDays, setDurationDays] = useState('7');
  const [targetMarket, setTargetMarket] = useState('');
  const [season, setSeason] = useState('');
  const [operationalNotes, setOperationalNotes] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedDuration = Number(durationDays);

    if (!name.trim()) {
      setError('Package name is required.');
      return;
    }

    if (!Number.isInteger(normalizedDuration) || normalizedDuration < 1) {
      setError('Duration must be a positive number of days.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/package-templates`, {
        method: 'POST',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: name.trim(),
          durationDays: normalizedDuration,
          targetMarket: targetMarket.trim() || null,
          season: season.trim() || null,
          active,
          operationalNotes: operationalNotes.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not create package template.'));
      }

      const created = await response.json();
      router.push(`/packages/${created.id}`);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not create package template.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="form-row form-row-2">
        <label>
          Package name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label>
          Duration days
          <input type="number" min="1" value={durationDays} onChange={(event) => setDurationDays(event.target.value)} required />
        </label>
      </div>
      <div className="form-row form-row-2">
        <label>
          Target market
          <input value={targetMarket} onChange={(event) => setTargetMarket(event.target.value)} placeholder="B2B, leisure, MICE" />
        </label>
        <label>
          Season
          <input value={season} onChange={(event) => setSeason(event.target.value)} placeholder="Spring 2027" />
        </label>
      </div>
      <label>
        Operational notes
        <textarea rows={3} value={operationalNotes} onChange={(event) => setOperationalNotes(event.target.value)} />
      </label>
      <label className="checkbox-field">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        Active
      </label>
      <button type="submit" className="primary-button" disabled={isSubmitting}>
        {isSubmitting ? 'Creating...' : 'Create package template'}
      </button>
    </form>
  );
}
