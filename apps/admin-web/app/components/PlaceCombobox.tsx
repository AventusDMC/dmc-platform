'use client';

import { useEffect, useMemo, useState } from 'react';
import { PlaceOption, formatPlaceLabel } from '../lib/places';

type PlaceComboboxProps = {
  label: string;
  places: PlaceOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function PlaceCombobox({ label, places, value, onChange, placeholder }: PlaceComboboxProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedPlace = useMemo(() => places.find((place) => place.id === value) || null, [places, value]);

  useEffect(() => {
    setQuery(selectedPlace ? formatPlaceLabel(selectedPlace) : '');
  }, [selectedPlace]);

  const filteredPlaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return places
      .filter((place) => {
        if (!normalizedQuery) {
          return true;
        }

        return [place.name, place.type, place.city, place.country]
          .filter(Boolean)
          .some((part) => part!.toLowerCase().includes(normalizedQuery));
      })
      .slice(0, 8);
  }, [places, query]);

  return (
    <label className="search-combobox">
      {label}
      <div className="search-combobox-shell">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            onChange('');
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            window.setTimeout(() => {
              setIsOpen(false);
              setQuery(selectedPlace ? formatPlaceLabel(selectedPlace) : '');
            }, 150);
          }}
          placeholder={placeholder}
          autoComplete="off"
        />
        {value ? (
          <button
            type="button"
            className="secondary-button search-combobox-clear"
            onClick={() => {
              onChange('');
              setQuery('');
              setIsOpen(false);
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
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
