'use client';

import { useEffect, useMemo, useState } from 'react';
import { PlaceTypeOption, formatPlaceTypeLabel } from '../lib/placeTypes';

type PlaceTypeComboboxProps = {
  label: string;
  placeTypes: PlaceTypeOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
};

export function PlaceTypeCombobox({
  label,
  placeTypes,
  value,
  onChange,
  placeholder,
  emptyLabel = 'No matching place types.',
}: PlaceTypeComboboxProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedPlaceType = useMemo(() => placeTypes.find((placeType) => placeType.id === value) || null, [placeTypes, value]);

  useEffect(() => {
    setQuery(selectedPlaceType ? formatPlaceTypeLabel(selectedPlaceType) : '');
  }, [selectedPlaceType]);

  const filteredPlaceTypes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return placeTypes
      .filter((placeType) => {
        if (!normalizedQuery) {
          return true;
        }

        return placeType.name.toLowerCase().includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [placeTypes, query]);

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
              setQuery(selectedPlaceType ? formatPlaceTypeLabel(selectedPlaceType) : '');
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
          {filteredPlaceTypes.length === 0 ? (
            <p className="empty-state">{emptyLabel}</p>
          ) : (
            filteredPlaceTypes.map((placeType) => (
              <button
                key={placeType.id}
                type="button"
                className={`search-combobox-option${value === placeType.id ? ' search-combobox-option-active' : ''}`}
                onClick={() => {
                  onChange(placeType.id);
                  setQuery(formatPlaceTypeLabel(placeType));
                  setIsOpen(false);
                }}
              >
                <strong>{placeType.name}</strong>
                <span>{placeType.isActive ? 'Active' : 'Inactive'}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </label>
  );
}
