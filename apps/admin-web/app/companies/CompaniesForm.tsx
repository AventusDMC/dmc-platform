'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CountryCityFields } from '../components/CountryCityFields';
import { TypeSelect } from '../components/TypeSelect';
import { ApiValidationError, getApiError } from '../lib/api';
import { companyTypes } from '../lib/reference-data';

type CompaniesFormProps = {
  apiBaseUrl: string;
  companyId?: string;
  submitLabel?: string;
  initialValues?: {
    name: string;
    type: string;
    website: string;
    logoUrl: string;
    primaryColor: string;
    country: string;
    city: string;
  };
};

export function CompaniesForm({ apiBaseUrl, companyId, submitLabel, initialValues }: CompaniesFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name || '');
  const [type, setType] = useState(initialValues?.type || '');
  const [website, setWebsite] = useState(initialValues?.website || '');
  const [logoUrl, setLogoUrl] = useState(initialValues?.logoUrl || '');
  const [primaryColor, setPrimaryColor] = useState(initialValues?.primaryColor || '#0F766E');
  const [country, setCountry] = useState(initialValues?.country || '');
  const [city, setCity] = useState(initialValues?.city || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<ApiValidationError[]>([]);
  const isEditing = Boolean(companyId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');
    setValidationErrors([]);

    try {
      const payload = {
        name: name.trim(),
        type: type.trim() || undefined,
        website: website.trim() || undefined,
        logoUrl: logoUrl.trim() || undefined,
        primaryColor: primaryColor.trim() || undefined,
        country: country.trim() || undefined,
        city: city.trim() || undefined,
      };
      const response = await fetch(`${apiBaseUrl}/companies${companyId ? `/${companyId}` : ''}`, {
        method: companyId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const apiError = await getApiError(response, `Could not ${isEditing ? 'update' : 'create'} company.`);
        setValidationErrors(apiError.errors);
        throw new Error(apiError.message);
      }

      if (!isEditing) {
        setName('');
        setType('');
        setWebsite('');
        setLogoUrl('');
        setPrimaryColor('#0F766E');
        setCountry('');
        setCity('');
        window.location.reload();
        return;
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} company.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} required />
      </label>

      <TypeSelect label="Type" value={type} onChange={setType} options={companyTypes} placeholder="Select company type" />

      <label>
        Website
        <input
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
          placeholder="https://example.com"
        />
      </label>

      <label>
        Logo URL
        <input
          value={logoUrl}
          onChange={(event) => setLogoUrl(event.target.value)}
          placeholder="https://example.com/logo.png"
        />
      </label>

      <div className="form-row">
        <label>
          Primary Color
          <input value={primaryColor} onChange={(event) => setPrimaryColor(event.target.value.toUpperCase())} type="color" />
        </label>

        <label>
          Hex Value
          <input
            value={primaryColor}
            onChange={(event) => setPrimaryColor(event.target.value.toUpperCase())}
            placeholder="#0F766E"
            pattern="^#?[0-9A-Fa-f]{6}$"
          />
        </label>
      </div>

      <CountryCityFields country={country} city={city} onCountryChange={setCountry} onCityChange={setCity} />

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Create company')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
      {validationErrors.length > 0 ? (
        <div className="form-error">
          {validationErrors.map((validationError) => (
            <p key={`${validationError.path}:${validationError.code}`}>{validationError.message}</p>
          ))}
        </div>
      ) : null}
    </form>
  );
}
