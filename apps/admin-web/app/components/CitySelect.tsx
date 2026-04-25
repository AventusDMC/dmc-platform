'use client';

import { useEffect, useState } from 'react';
import { getCitiesForCountry, isKnownCity, OTHER_REFERENCE_VALUE } from '../lib/reference-data';

const CUSTOM_SELECT_VALUE = '__custom__';

type CitySelectProps = {
  country: string;
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

export function CitySelect({ country, value, onChange, label = 'City', required, disabled, placeholder = 'Select city' }: CitySelectProps) {
  const cityOptions = getCitiesForCountry(country);
  const known = isKnownCity(country, value);
  const [selectedValue, setSelectedValue] = useState(value && !known ? CUSTOM_SELECT_VALUE : value);

  useEffect(() => {
    if (!value && selectedValue === CUSTOM_SELECT_VALUE) {
      return;
    }

    setSelectedValue(value && !isKnownCity(country, value) ? CUSTOM_SELECT_VALUE : value);
  }, [country, selectedValue, value]);

  return (
    <div className="form-field-stack">
      <label>
        {label}
        <select
          value={selectedValue}
          onChange={(event) => {
            const nextValue = event.target.value;
            setSelectedValue(nextValue);
            onChange(nextValue === CUSTOM_SELECT_VALUE ? '' : nextValue);
          }}
          required={required}
          disabled={disabled}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {cityOptions
            .filter((city) => city !== OTHER_REFERENCE_VALUE)
            .map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          <option value={CUSTOM_SELECT_VALUE}>Other</option>
        </select>
      </label>

      {selectedValue === CUSTOM_SELECT_VALUE ? (
        <label>
          Other City
          <input value={known ? '' : value} onChange={(event) => onChange(event.target.value)} required={required} />
        </label>
      ) : null}
    </div>
  );
}
