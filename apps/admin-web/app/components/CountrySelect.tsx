'use client';

import { useEffect, useState } from 'react';
import { countries, isKnownCountry, OTHER_REFERENCE_VALUE } from '../lib/reference-data';

const CUSTOM_SELECT_VALUE = '__custom__';

type CountrySelectProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
};

export function CountrySelect({ value, onChange, label = 'Country', required, disabled, placeholder = 'Select country' }: CountrySelectProps) {
  const [selectedValue, setSelectedValue] = useState(value && !isKnownCountry(value) ? CUSTOM_SELECT_VALUE : value);

  useEffect(() => {
    if (!value && selectedValue === CUSTOM_SELECT_VALUE) {
      return;
    }

    setSelectedValue(value && !isKnownCountry(value) ? CUSTOM_SELECT_VALUE : value);
  }, [selectedValue, value]);

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
          {countries
            .filter((country) => country !== OTHER_REFERENCE_VALUE)
            .map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          <option value={CUSTOM_SELECT_VALUE}>Other</option>
        </select>
      </label>

      {selectedValue === CUSTOM_SELECT_VALUE ? (
        <label>
          Other Country
          <input value={isKnownCountry(value) ? '' : value} onChange={(event) => onChange(event.target.value)} required={required} />
        </label>
      ) : null}
    </div>
  );
}
