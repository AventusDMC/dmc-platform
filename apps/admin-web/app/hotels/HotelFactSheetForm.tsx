'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../lib/auth-client';
import { getErrorMessage } from '../lib/api';

type HotelFactSheet = {
  shortDescription?: string | null;
  highlightsJson?: unknown;
  amenitiesJson?: unknown;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  imageGalleryJson?: unknown;
};

type HotelFactSheetFormProps = {
  apiBaseUrl: string;
  hotelId: string;
  factSheet?: HotelFactSheet | null;
};

function jsonToLines(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).join('\n');
  }

  if (value === null || value === undefined || value === '') {
    return '';
  }

  return JSON.stringify(value, null, 2);
}

function linesToJson(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function HotelFactSheetForm({ apiBaseUrl, hotelId, factSheet }: HotelFactSheetFormProps) {
  const router = useRouter();
  const [shortDescription, setShortDescription] = useState(factSheet?.shortDescription || '');
  const [highlights, setHighlights] = useState(jsonToLines(factSheet?.highlightsJson));
  const [amenities, setAmenities] = useState(jsonToLines(factSheet?.amenitiesJson));
  const [checkInTime, setCheckInTime] = useState(factSheet?.checkInTime || '');
  const [checkOutTime, setCheckOutTime] = useState(factSheet?.checkOutTime || '');
  const [imageGallery, setImageGallery] = useState(jsonToLines(factSheet?.imageGalleryJson));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/hotels/${hotelId}/fact-sheet`, {
        method: 'PATCH',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          shortDescription: shortDescription.trim() || null,
          highlightsJson: linesToJson(highlights),
          amenitiesJson: linesToJson(amenities),
          checkInTime: checkInTime.trim() || null,
          checkOutTime: checkOutTime.trim() || null,
          imageGalleryJson: linesToJson(imageGallery),
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save hotel fact sheet.'));
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save hotel fact sheet.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <label>
        Short description
        <textarea
          value={shortDescription}
          onChange={(event) => setShortDescription(event.target.value)}
          placeholder="Client-facing hotel summary"
        />
      </label>

      <div className="form-row form-row-2">
        <label>
          Check-in time
          <input value={checkInTime} onChange={(event) => setCheckInTime(event.target.value)} placeholder="15:00" />
        </label>
        <label>
          Check-out time
          <input value={checkOutTime} onChange={(event) => setCheckOutTime(event.target.value)} placeholder="12:00" />
        </label>
      </div>

      <div className="form-row form-row-2">
        <label>
          Highlights
          <textarea
            value={highlights}
            onChange={(event) => setHighlights(event.target.value)}
            placeholder="One highlight per line"
          />
        </label>
        <label>
          Amenities
          <textarea
            value={amenities}
            onChange={(event) => setAmenities(event.target.value)}
            placeholder="One amenity per line"
          />
        </label>
      </div>

      <label>
        Image gallery
        <textarea
          value={imageGallery}
          onChange={(event) => setImageGallery(event.target.value)}
          placeholder="One image URL per line"
        />
      </label>

      {error ? <p className="form-error">{error}</p> : null}

      <div className="table-action-row">
        <button type="submit" className="primary-button" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save fact sheet'}
        </button>
      </div>
    </form>
  );
}
