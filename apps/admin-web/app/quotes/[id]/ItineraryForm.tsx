'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage } from '../../lib/api';

type QuoteBlock = {
  id: string;
  name: string;
  type: 'ITINERARY_DAY' | 'SERVICE_BLOCK';
  title: string;
  description: string | null;
};

type ItineraryFormProps = {
  apiBaseUrl: string;
  quoteId: string;
  itineraryId?: string;
  submitLabel?: string;
  blocks?: QuoteBlock[];
  initialValues?: {
    dayNumber: string;
    title: string;
    description: string;
  };
};

export function ItineraryForm({ apiBaseUrl, quoteId, itineraryId, submitLabel, blocks = [], initialValues }: ItineraryFormProps) {
  const router = useRouter();
  const [dayNumber, setDayNumber] = useState(initialValues?.dayNumber || '1');
  const [title, setTitle] = useState(initialValues?.title || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [selectedBlockId, setSelectedBlockId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(itineraryId);
  const itineraryBlocks = blocks.filter((block) => block.type === 'ITINERARY_DAY');

  useEffect(() => {
    setDayNumber(initialValues?.dayNumber || '1');
    setTitle(initialValues?.title || '');
    setDescription(initialValues?.description || '');
    setSelectedBlockId('');
  }, [initialValues?.dayNumber, initialValues?.title, initialValues?.description]);

  function applyBlock(blockId: string) {
    const block = itineraryBlocks.find((entry) => entry.id === blockId);

    if (!block) {
      return;
    }

    setSelectedBlockId(blockId);
    setTitle(block.title);
    setDescription(block.description ?? '');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/itineraries${itineraryId ? `/${itineraryId}` : ''}`, {
        method: itineraryId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quoteId,
          dayNumber: Number(dayNumber),
          title,
          description,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'add'} itinerary day.`));
      }

      if (!isEditing) {
        setDayNumber('1');
        setTitle('');
        setDescription('');
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'add'} itinerary day.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      {itineraryBlocks.length > 0 ? (
        <div className="form-row form-row-3">
          <label>
            Reusable block
            <select value={selectedBlockId} onChange={(event) => setSelectedBlockId(event.target.value)}>
              <option value="">Select itinerary block</option>
              {itineraryBlocks.map((block) => (
                <option key={block.id} value={block.id}>
                  {block.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="secondary-button" onClick={() => applyBlock(selectedBlockId)} disabled={!selectedBlockId}>
            Apply block
          </button>
          <Link href="/quote-blocks" className="secondary-button">
            Manage blocks
          </Link>
        </div>
      ) : null}

      <label>
        Day number
        <input
          value={dayNumber}
          onChange={(event) => setDayNumber(event.target.value)}
          type="number"
          min="1"
          required
        />
      </label>

      <label>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </label>

      <label>
        Description
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Add day')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
