'use client';

import { CitySelect } from './CitySelect';
import { CountrySelect } from './CountrySelect';
import { getCitiesForCountry, isKnownCity } from '../lib/reference-data';

type CountryCityFieldsProps = {
  country: string;
  city: string;
  onCountryChange: (value: string) => void;
  onCityChange: (value: string) => void;
  countryLabel?: string;
  cityLabel?: string;
  required?: boolean;
};

export function CountryCityFields({
  country,
  city,
  onCountryChange,
  onCityChange,
  countryLabel,
  cityLabel,
  required,
}: CountryCityFieldsProps) {
  return (
    <div className="form-row">
      <CountrySelect
        label={countryLabel}
        value={country}
        onChange={(nextCountry) => {
          onCountryChange(nextCountry);
          if (city && nextCountry && !isKnownCity(nextCountry, city) && getCitiesForCountry(nextCountry).length > 1) {
            onCityChange('');
          }
        }}
        required={required}
      />
      <CitySelect country={country} label={cityLabel} value={city} onChange={onCityChange} disabled={!country} required={required} />
    </div>
  );
}
