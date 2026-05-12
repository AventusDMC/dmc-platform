'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../lib/api';
import { buildAuthHeaders } from '../lib/auth-client';
import type { PackageTemplate } from './types';

type PackageTemplateMetadataEditorProps = {
  apiBaseUrl: string;
  template: PackageTemplate;
};

export function PackageTemplateMetadataEditor({ apiBaseUrl, template }: PackageTemplateMetadataEditorProps) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(template.name);
  const [durationDays, setDurationDays] = useState(String(template.durationDays));
  const [targetMarket, setTargetMarket] = useState(template.targetMarket || '');
  const [season, setSeason] = useState(template.season || '');
  const [summary, setSummary] = useState(template.summary || '');
  const [operationalNotes, setOperationalNotes] = useState(template.operationalNotes || '');
  const [active, setActive] = useState(template.active);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  function resetForm() {
    setName(template.name);
    setDurationDays(String(template.durationDays));
    setTargetMarket(template.targetMarket || '');
    setSeason(template.season || '');
    setSummary(template.summary || '');
    setOperationalNotes(template.operationalNotes || '');
    setActive(template.active);
    setError('');
  }

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

    setIsSaving(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/package-templates/${template.id}`, {
        method: 'PATCH',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          name: name.trim(),
          durationDays: normalizedDuration,
          targetMarket: targetMarket.trim() || null,
          season: season.trim() || null,
          summary: summary.trim() || null,
          active,
          operationalNotes: operationalNotes.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not update package metadata.'));
      }

      setIsEditing(false);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update package metadata.');
    } finally {
      setIsSaving(false);
    }
  }

  if (!isEditing) {
    return (
      <article className="detail-card">
        <div className="section-header">
          <h2>Package setup</h2>
          <button type="button" className="secondary-button" onClick={() => setIsEditing(true)}>
            Edit
          </button>
        </div>
        <div className="detail-fields">
          <p>
            <strong>Target market:</strong> {template.targetMarket || 'Not set'}
          </p>
          <p>
            <strong>Season:</strong> {template.season || 'Not set'}
          </p>
          <p>
            <strong>Status:</strong> {template.active ? 'Active' : 'Inactive'}
          </p>
          <p>
            <strong>Duration:</strong> {template.durationDays} days
          </p>
        </div>
        {template.summary ? <p className="detail-copy">{template.summary}</p> : null}
        {template.operationalNotes ? <p className="detail-copy">{template.operationalNotes}</p> : null}
      </article>
    );
  }

  return (
    <article className="detail-card">
      <div className="section-header">
        <h2>Edit package metadata</h2>
      </div>
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
            <input value={targetMarket} onChange={(event) => setTargetMarket(event.target.value)} />
          </label>
          <label>
            Season
            <input value={season} onChange={(event) => setSeason(event.target.value)} />
          </label>
        </div>
        <label>
          Package summary
          <textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} />
        </label>
        <label>
          Operational notes
          <textarea rows={3} value={operationalNotes} onChange={(event) => setOperationalNotes(event.target.value)} />
        </label>
        <label className="checkbox-field">
          <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
          Active
        </label>
        <div className="form-actions">
          <button type="submit" className="primary-button" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              resetForm();
              setIsEditing(false);
            }}
            disabled={isSaving}
          >
            Cancel
          </button>
        </div>
      </form>
    </article>
  );
}
