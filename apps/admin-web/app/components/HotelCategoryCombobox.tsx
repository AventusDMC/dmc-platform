'use client';

import { useEffect, useMemo, useState } from 'react';
import { HotelCategoryOption, formatHotelCategoryLabel } from '../lib/hotelCategories';

type HotelCategoryComboboxProps = {
  label: string;
  hotelCategories: HotelCategoryOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
};

export function HotelCategoryCombobox({
  label,
  hotelCategories,
  value,
  onChange,
  placeholder,
  emptyLabel = 'No matching categories.',
}: HotelCategoryComboboxProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedCategory = useMemo(
    () => hotelCategories.find((category) => category.id === value) || null,
    [hotelCategories, value],
  );

  useEffect(() => {
    setQuery(selectedCategory ? formatHotelCategoryLabel(selectedCategory) : '');
  }, [selectedCategory]);

  const filteredCategories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return hotelCategories
      .filter((category) => {
        if (!normalizedQuery) {
          return true;
        }

        return category.name.toLowerCase().includes(normalizedQuery);
      })
      .slice(0, 8);
  }, [hotelCategories, query]);

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
              setQuery(selectedCategory ? formatHotelCategoryLabel(selectedCategory) : '');
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
          {filteredCategories.length === 0 ? (
            <p className="empty-state">{emptyLabel}</p>
          ) : (
            filteredCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                className={`search-combobox-option${value === category.id ? ' search-combobox-option-active' : ''}`}
                onClick={() => {
                  onChange(category.id);
                  setQuery(formatHotelCategoryLabel(category));
                  setIsOpen(false);
                }}
              >
                <strong>{category.name}</strong>
                <span>{category.isActive ? 'Active' : 'Inactive'}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </label>
  );
}
