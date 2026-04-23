import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '../lib/currencyOptions';

type CurrencySelectProps = {
  value: SupportedCurrency | '';
  onChange: (value: SupportedCurrency | '') => void;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  disabled?: boolean;
  name?: string;
};

export function CurrencySelect({
  value,
  onChange,
  required,
  allowEmpty = false,
  emptyLabel = 'None',
  disabled,
  name,
}: CurrencySelectProps) {
  return (
    <select
      name={name}
      value={value}
      onChange={(event) => onChange(event.target.value as SupportedCurrency | '')}
      required={required}
      disabled={disabled}
    >
      {allowEmpty ? <option value="">{emptyLabel}</option> : null}
      {SUPPORTED_CURRENCIES.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}
