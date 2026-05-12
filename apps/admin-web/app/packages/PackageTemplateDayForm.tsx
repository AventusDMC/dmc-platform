'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';
import type { PackageTemplateDay } from './types';

type PackageTemplateDayFormProps = {
  apiBaseUrl: string;
  packageTemplateId: string;
  day: PackageTemplateDay;
};

export function PackageTemplateDayForm({ apiBaseUrl, packageTemplateId, day }: PackageTemplateDayFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(day.title);
  const [description, setDescription] = useState(day.description || '');
  const [active, setActive] = useState(day.active);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!title.trim()) {
      setError('Day title is required.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/package-templates/${packageTemplateId}/days/${day.id}`, {
        method: 'PATCH',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          active,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not update package day.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update package day.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="form-row form-row-2">
        <label>
          Day title
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Active day
        </label>
      </div>
      <label>
        Description / notes
        <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <button type="submit" className="primary-button" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save day'}
      </button>
    </form>
  );
}
