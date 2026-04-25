'use client';

import { useEffect, useMemo, useState } from 'react';
import { OTHER_REFERENCE_VALUE, type ReferenceOption } from '../lib/reference-data';

const CUSTOM_SELECT_VALUE = '__custom__';

type TypeSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ReferenceOption[];
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  otherLabel?: string;
  allowCustom?: boolean;
};

function isKnownOption(options: ReferenceOption[], value: string) {
  return options.some((option) => option.value !== OTHER_REFERENCE_VALUE && option.value === value);
}

export function TypeSelect({
  label,
  value,
  onChange,
  options,
  required,
  disabled,
  placeholder,
  otherLabel,
  allowCustom = true,
}: TypeSelectProps) {
  const known = useMemo(() => isKnownOption(options, value), [options, value]);
  const [selectedValue, setSelectedValue] = useState(allowCustom && value && !known ? CUSTOM_SELECT_VALUE : value);
  const selectableOptions = allowCustom ? options.filter((option) => option.value !== OTHER_REFERENCE_VALUE) : options;

  useEffect(() => {
    if (!value && selectedValue === CUSTOM_SELECT_VALUE) {
      return;
    }

    setSelectedValue(allowCustom && value && !isKnownOption(options, value) ? CUSTOM_SELECT_VALUE : value);
  }, [allowCustom, options, selectedValue, value]);

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
          {selectableOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
          {allowCustom ? <option value={CUSTOM_SELECT_VALUE}>Other</option> : null}
        </select>
      </label>

      {selectedValue === CUSTOM_SELECT_VALUE ? (
        <label>
          {otherLabel || `Other ${label.toLowerCase()}`}
          <input value={known ? '' : value} onChange={(event) => onChange(event.target.value)} required={required} />
        </label>
      ) : null}
    </div>
  );
}
