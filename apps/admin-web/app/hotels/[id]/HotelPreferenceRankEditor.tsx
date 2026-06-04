'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiError } from '../../lib/api';

// Preferred Hotel Ranking — small client island on the hotel detail page.
// Lets operators set/clear a preference rank (lower wins, 1 = most
// preferred) that boosts the hotel in the Guided Quote Builder's
// per-tier suggestions. PATCHes /api/hotels/[id] { preferenceRank }.

type HotelPreferenceRankEditorProps = {
  hotelId: string;
  initialRank: number | null;
};

export function HotelPreferenceRankEditor({ hotelId, initialRank }: HotelPreferenceRankEditorProps) {
  const router = useRouter();
  const [rank, setRank] = useState(initialRank === null || initialRank === undefined ? '' : String(initialRank));
  const [savedRank, setSavedRank] = useState(initialRank ?? null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');

  async function submit(nextRank: number | null) {
    setError('');
    setIsSubmitting(true);
    setSaveState('saving');
    try {
      const response = await fetch(`/api/hotels/${hotelId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferenceRank: nextRank }),
      });
      if (!response.ok) {
        const apiError = await getApiError(response, 'Could not update preference rank.');
        throw new Error(apiError.message);
      }
      setSavedRank(nextRank);
      setRank(nextRank === null ? '' : String(nextRank));
      setSaveState('saved');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not update preference rank.');
      setSaveState('idle');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = rank.trim();
    if (!trimmed) {
      void submit(null);
      return;
    }
    const parsed = Math.trunc(Number(trimmed));
    if (!Number.isFinite(parsed) || parsed < 1) {
      setError('Preference rank must be a whole number of 1 or greater (or blank to clear).');
      return;
    }
    void submit(parsed);
  }

  return (
    <section className="detail-card" style={{ marginBottom: '1.5rem' }} data-testid="hotel-preference-rank">
      <h2 className="section-title" style={{ fontSize: '1.05rem', marginBottom: '0.4rem' }}>
        Guided preference rank
      </h2>
      <p className="table-subcopy" style={{ marginBottom: '0.8rem' }}>
        {savedRank === null
          ? 'Unranked — this hotel sorts by contract trust then alphabetically in Guided suggestions.'
          : `Preferred (rank ${savedRank}) — surfaces ahead of unranked hotels in its tier in Guided suggestions.`}{' '}
        Lower number wins (1 = most preferred). Leave blank to clear.
      </p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', alignItems: 'flex-end', gap: '0.6rem', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: '0.82rem', color: 'var(--ds-color-text-muted, #475569)', gap: '0.25rem' }}>
          Preference rank
          <input
            value={rank}
            onChange={(event) => {
              setSaveState('idle');
              setRank(event.target.value);
            }}
            type="number"
            min="1"
            step="1"
            placeholder="Unranked"
            style={{ width: '8rem' }}
          />
        </label>
        <button type="submit" className="compact-button" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save rank'}
        </button>
        {savedRank !== null ? (
          <button
            type="button"
            className="compact-button"
            disabled={isSubmitting}
            onClick={() => {
              setSaveState('idle');
              void submit(null);
            }}
          >
            Clear
          </button>
        ) : null}
      </form>
      {saveState === 'saved' ? <p className="status-text-success" style={{ marginTop: '0.6rem' }}>Preference rank saved.</p> : null}
      {error ? <p className="form-error" style={{ marginTop: '0.6rem' }}>{error}</p> : null}
    </section>
  );
}
