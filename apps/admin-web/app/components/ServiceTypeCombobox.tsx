'use client';

import { useEffect, useMemo, useState } from 'react';
import { ServiceTypeOption, formatServiceTypeLabel } from '../lib/serviceTypes';

type ServiceTypeComboboxProps = {
  label: string;
  serviceTypes: ServiceTypeOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  emptyLabel?: string;
};

export function ServiceTypeCombobox({
  label,
  serviceTypes,
  value,
  onChange,
  placeholder,
  emptyLabel = 'No matching service types.',
}: ServiceTypeComboboxProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const selectedServiceType = useMemo(
    () => serviceTypes.find((serviceType) => serviceType.id === value) || null,
    [serviceTypes, value],
  );

  useEffect(() => {
    setQuery(selectedServiceType ? formatServiceTypeLabel(selectedServiceType) : '');
  }, [selectedServiceType]);

  const filteredServiceTypes = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return serviceTypes
      .filter((serviceType) => {
        if (!normalizedQuery) {
          return true;
        }

        return [serviceType.name, serviceType.code]
          .filter(Boolean)
          .some((part) => part!.toLowerCase().includes(normalizedQuery));
      })
      .slice(0, 8);
  }, [query, serviceTypes]);

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
              setQuery(selectedServiceType ? formatServiceTypeLabel(selectedServiceType) : '');
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
          {filteredServiceTypes.length === 0 ? (
            <p className="empty-state">{emptyLabel}</p>
          ) : (
            filteredServiceTypes.map((serviceType) => (
              <button
                key={serviceType.id}
                type="button"
                className={`search-combobox-option${value === serviceType.id ? ' search-combobox-option-active' : ''}`}
                onClick={() => {
                  onChange(serviceType.id);
                  setQuery(formatServiceTypeLabel(serviceType));
                  setIsOpen(false);
                }}
              >
                <strong>{serviceType.name}</strong>
                <span>{serviceType.code || (serviceType.isActive ? 'Active' : 'Inactive')}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </label>
  );
}
