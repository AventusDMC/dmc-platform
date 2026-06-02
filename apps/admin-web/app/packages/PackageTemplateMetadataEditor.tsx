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
  const [code, setCode] = useState(template.code || '');
  const [targetMarket, setTargetMarket] = useState(template.targetMarket || '');
  const [season, setSeason] = useState(template.season || '');
  const [destination, setDestination] = useState(template.destination || '');
  const [summary, setSummary] = useState(template.summary || '');
  const [inclusions, setInclusions] = useState(template.inclusions || '');
  const [exclusions, setExclusions] = useState(template.exclusions || '');
  const [hotelCategoryNotes, setHotelCategoryNotes] = useState(template.hotelCategoryNotes || '');
  const [guideRules, setGuideRules] = useState(template.guideRules || '');
  const [categoryTags, setCategoryTags] = useState((template.categoryTags || []).join(', '));
  const [operationalNotes, setOperationalNotes] = useState(template.operationalNotes || '');
  const [active, setActive] = useState(template.active);
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  function resetForm() {
    setName(template.name);
    setDurationDays(String(template.durationDays));
    setCode(template.code || '');
    setTargetMarket(template.targetMarket || '');
    setSeason(template.season || '');
    setDestination(template.destination || '');
    setSummary(template.summary || '');
    setInclusions(template.inclusions || '');
    setExclusions(template.exclusions || '');
    setHotelCategoryNotes(template.hotelCategoryNotes || '');
    setGuideRules(template.guideRules || '');
    setCategoryTags((template.categoryTags || []).join(', '));
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
          code: code.trim() || null,
          targetMarket: targetMarket.trim() || null,
          season: season.trim() || null,
          destination: destination.trim() || null,
          summary: summary.trim() || null,
          inclusions: inclusions.trim() || null,
          exclusions: exclusions.trim() || null,
          hotelCategoryNotes: hotelCategoryNotes.trim() || null,
          guideRules: guideRules.trim() || null,
          categoryTags: categoryTags
            .split(',')
            .map((tag) => tag.trim())
            .filter((tag) => tag.length > 0),
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
            <strong>Code:</strong> {template.code || 'Not set'}
          </p>
          <p>
            <strong>Destination:</strong> {template.destination || 'Not set'}
          </p>
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
        {template.categoryTags?.length ? (
          <div className="table-action-group">
            {template.categoryTags.map((tag) => (
              <span key={tag} className="status-pill status-pill-muted">
                {tag}
              </span>
            ))}
          </div>
        ) : null}
        {template.summary ? <p className="detail-copy">{template.summary}</p> : null}
        {template.inclusions ? (
          <p className="detail-copy">
            <strong>Inclusions:</strong> {template.inclusions}
          </p>
        ) : null}
        {template.exclusions ? (
          <p className="detail-copy">
            <strong>Exclusions:</strong> {template.exclusions}
          </p>
        ) : null}
        {template.hotelCategoryNotes ? (
          <p className="detail-copy">
            <strong>Hotel category notes:</strong> {template.hotelCategoryNotes}
          </p>
        ) : null}
        {template.guideRules ? (
          <p className="detail-copy">
            <strong>Guide rules:</strong> {template.guideRules}
          </p>
        ) : null}
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
        <div className="form-row form-row-2">
          <label>
            Package code
            <input value={code} onChange={(event) => setCode(event.target.value)} placeholder="e.g. JOR-CLASSIC-8D" />
          </label>
          <label>
            Destination
            <input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="e.g. Jordan" />
          </label>
        </div>
        <label>
          Category tags
          <input
            value={categoryTags}
            onChange={(event) => setCategoryTags(event.target.value)}
            placeholder="Comma-separated, e.g. Cultural, Family, Luxury"
          />
        </label>
        <label>
          Package summary
          <textarea rows={3} value={summary} onChange={(event) => setSummary(event.target.value)} />
        </label>
        <div className="form-row form-row-2">
          <label>
            Inclusions
            <textarea rows={3} value={inclusions} onChange={(event) => setInclusions(event.target.value)} />
          </label>
          <label>
            Exclusions
            <textarea rows={3} value={exclusions} onChange={(event) => setExclusions(event.target.value)} />
          </label>
        </div>
        <div className="form-row form-row-2">
          <label>
            Hotel category notes
            <textarea rows={3} value={hotelCategoryNotes} onChange={(event) => setHotelCategoryNotes(event.target.value)} />
          </label>
          <label>
            Guide rules
            <textarea rows={3} value={guideRules} onChange={(event) => setGuideRules(event.target.value)} />
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
