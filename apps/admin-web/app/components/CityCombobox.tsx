'use client';

import { useEffect, useMemo, useState } from 'react';
import { CityOption, formatCityLabel } from '../lib/cities';

type CityComboboxProps = {
  label: string;
  cities: CityOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
};

export function CityCombobox({
  label,
  cities,
  value,
  onChange,
  placeholder,
  emptyLabel = 'No matching cities.',
}: CityComboboxProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedCity = useMemo(() => cities.find((city) => city.id === value) || null, [cities, value]);

  useEffect(() => {
    setQuery(selectedCity ? formatCityLabel(selectedCity) : '');
  }, [selectedCity]);

  const filteredCities = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return cities
      .filter((city) => {
        if (!normalizedQuery) {
          return true;
        }

        return [city.name, city.country]
          .filter(Boolean)
          .some((part) => part!.toLowerCase().includes(normalizedQuery));
      })
      .slice(0, 8);
  }, [cities, query]);

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
              setQuery(selectedCity ? formatCityLabel(selectedCity) : '');
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
          {filteredCities.length === 0 ? (
            <p className="empty-state">{emptyLabel}</p>
          ) : (
            filteredCities.map((city) => (
              <button
                key={city.id}
                type="button"
                className={`search-combobox-option${value === city.id ? ' search-combobox-option-active' : ''}`}
                onClick={() => {
                  onChange(city.id);
                  setQuery(formatCityLabel(city));
                  setIsOpen(false);
                }}
              >
                <strong>{city.name}</strong>
                <span>{city.country || 'No country'}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </label>
  );
}
