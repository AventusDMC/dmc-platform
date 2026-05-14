'use client';

import { useEffect, useMemo, useState } from 'react';

export type SearchableSelectOption = {
  value: string;
  label: string;
  helper?: string | null;
};

type SearchableSelectProps = {
  label: string;
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  missingText?: string;
  required?: boolean;
  disabled?: boolean;
  maxResults?: number;
};

function optionText(option: SearchableSelectOption) {
  return [option.label, option.helper].filter(Boolean).join(' ');
}

export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  emptyText = 'No matching catalog records.',
  missingText,
  required = false,
  disabled = false,
  maxResults = 50,
}: SearchableSelectProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = useMemo(() => options.find((option) => option.value === value) || null, [options, value]);

  useEffect(() => {
    setQuery(selectedOption ? selectedOption.label : '');
  }, [selectedOption]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return options
      .filter((option) => !normalizedQuery || optionText(option).toLowerCase().includes(normalizedQuery))
      .slice(0, maxResults);
  }, [maxResults, options, query]);

  return (
    <label className="search-combobox">
      {label}
      <div className="search-combobox-shell">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            onChange('');
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(!disabled)}
          onBlur={() => {
            window.setTimeout(() => {
              setIsOpen(false);
              setQuery(selectedOption ? selectedOption.label : '');
            }, 150);
          }}
          placeholder={placeholder}
          autoComplete="off"
          disabled={disabled}
          required={required}
        />
        {value && !disabled ? (
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
      {value && !selectedOption ? <p className="form-error">{missingText || 'Selected catalog value is no longer available.'}</p> : null}
      {selectedOption?.helper ? <p className="search-combobox-selected">{selectedOption.helper}</p> : null}
      {isOpen ? (
        <div className="search-combobox-menu">
          {filteredOptions.length === 0 ? (
            <p className="empty-state">{emptyText}</p>
          ) : (
            filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`search-combobox-option${value === option.value ? ' search-combobox-option-active' : ''}`}
                onClick={() => {
                  onChange(option.value);
                  setQuery(option.label);
                  setIsOpen(false);
                }}
              >
                <strong>{option.label}</strong>
                {option.helper ? <span>{option.helper}</span> : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </label>
  );
}
