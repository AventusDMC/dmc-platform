'use client';

import { useEffect, useMemo, useState } from 'react';
import { filterCanonicalGeographicPlaces, PlaceOption, formatPlaceLabel } from '../lib/places';

type PlaceComboboxProps = {
  label: string;
  places: PlaceOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export function PlaceCombobox({ label, places, value, onChange, placeholder, disabled = false }: PlaceComboboxProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [committedSelectedPlace, setCommittedSelectedPlace] = useState<PlaceOption | null>(null);

  const visiblePlaces = useMemo(() => filterCanonicalGeographicPlaces(places, [value]), [places, value]);
  const selectedPlaceFromOptions = useMemo(() => places.find((place) => place.id === value) || null, [places, value]);
  const selectedPlace = selectedPlaceFromOptions || committedSelectedPlace;

  useEffect(() => {
    if (!value) {
      setCommittedSelectedPlace(null);
      return;
    }

    if (selectedPlaceFromOptions) {
      setCommittedSelectedPlace(selectedPlaceFromOptions);
    }
  }, [selectedPlaceFromOptions, value]);

  useEffect(() => {
    if (isOpen) {
      return;
    }

    setQuery(selectedPlace && value ? formatPlaceLabel(selectedPlace) : '');
  }, [isOpen, selectedPlace, value]);

  const filteredPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return visiblePlaces
      .filter((place) => {
        if (!normalizedQuery) {
          return true;
        }

        return [place.name, place.type, place.city, place.country]
          .filter(Boolean)
          .some((part) => part!.toLowerCase().includes(normalizedQuery));
      })
      .slice(0, 50);
  }, [visiblePlaces, query]);

  return (
    <label className="search-combobox">
      {label}
      <div className="search-combobox-shell">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(!disabled)}
          onBlur={() => {
            window.setTimeout(() => {
              setIsOpen(false);
            }, 150);
          }}
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled}
        />
        {value && !disabled ? (
          <button
            type="button"
            className="secondary-button search-combobox-clear"
            aria-label={`Clear ${label}`}
            onClick={() => {
              setCommittedSelectedPlace(null);
              onChange('');
              setQuery('');
              setIsOpen(false);
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      {value && selectedPlace ? (
        <span className="search-combobox-selected" aria-live="polite">
          Selected <strong>{formatPlaceLabel(selectedPlace)}</strong>
        </span>
      ) : null}
      {isOpen ? (
        <div className="search-combobox-menu">
          {filteredPlaces.length === 0 ? (
            <p className="empty-state">No matching places.</p>
          ) : (
            filteredPlaces.map((place) => (
              <button
                key={place.id}
                type="button"
                className={`search-combobox-option${value === place.id ? ' search-combobox-option-active' : ''}`}
                onClick={() => {
                  setCommittedSelectedPlace(place);
                  onChange(place.id);
                  setQuery(formatPlaceLabel(place));
                  setIsOpen(false);
                }}
              >
                <strong>{place.name}</strong>
                <span>
                  {place.type}
                  {place.city ? ` - ${place.city}` : ''}
                  {place.country ? `, ${place.country}` : ''}
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </label>
  );
}
