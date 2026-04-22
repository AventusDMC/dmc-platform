'use client';

import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage, readJsonResponse } from '../lib/api';

type BrandingSettingsFormProps = {
  apiBaseUrl: string;
  requestBasePath?: string;
  companyId: string;
  companyName: string;
};

type BrandingResponse = {
  companyId: string;
  hasCustomBranding: boolean;
  branding: {
    displayName: string;
    logoUrl: string | null;
    headerTitle: string | null;
    headerSubtitle: string | null;
    footerText: string | null;
    website: string | null;
    email: string | null;
    phone: string | null;
    primaryColor: string;
    secondaryColor: string;
  };
};

type BrandingFormState = {
  displayName: string;
  logoUrl: string;
  headerTitle: string;
  headerSubtitle: string;
  footerText: string;
  website: string;
  email: string;
  phone: string;
  primaryColor: string;
  secondaryColor: string;
};

const EMPTY_STATE: BrandingFormState = {
  displayName: '',
  logoUrl: '',
  headerTitle: '',
  headerSubtitle: '',
  footerText: '',
  website: '',
  email: '',
  phone: '',
  primaryColor: '#0F766E',
  secondaryColor: '#0F766E',
};

function toFormState(data: BrandingResponse): BrandingFormState {
  return {
    displayName: data.branding.displayName || '',
    logoUrl: data.branding.logoUrl || '',
    headerTitle: data.branding.headerTitle || '',
    headerSubtitle: data.branding.headerSubtitle || '',
    footerText: data.branding.footerText || '',
    website: data.branding.website || '',
    email: data.branding.email || '',
    phone: data.branding.phone || '',
    primaryColor: data.branding.primaryColor || '#0F766E',
    secondaryColor: data.branding.secondaryColor || '#0F766E',
  };
}

function resolveLogoUrl(apiBaseUrl: string, logoUrl: string) {
  if (!logoUrl) {
    return '';
  }

  if (/^https?:\/\//i.test(logoUrl)) {
    return logoUrl;
  }

  return `${apiBaseUrl}${logoUrl.startsWith('/') ? logoUrl : `/${logoUrl}`}`;
}

export function BrandingSettingsForm({
  apiBaseUrl,
  requestBasePath = apiBaseUrl,
  companyId,
  companyName,
}: BrandingSettingsFormProps) {
  const router = useRouter();
  const brandingBasePath = `${requestBasePath}/companies/${companyId}/branding`;
  const [values, setValues] = useState<BrandingFormState>(EMPTY_STATE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadBranding() {
      setIsLoading(true);
      setError('');

      try {
        const response = await fetch(brandingBasePath, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(await getErrorMessage(response, 'Could not load branding settings.'));
        }

        const data = await readJsonResponse<BrandingResponse>(response, 'Could not load branding settings.');
        if (!isMounted) {
          return;
        }

        setValues(toFormState(data));
      } catch (caughtError) {
        if (!isMounted) {
          return;
        }

        setError(caughtError instanceof Error ? caughtError.message : 'Could not load branding settings.');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadBranding();

    return () => {
      isMounted = false;
    };
  }, [brandingBasePath]);

  function updateValue<Key extends keyof BrandingFormState>(key: Key, value: BrandingFormState[Key]) {
    setValues((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    setSelectedFile(event.target.files?.[0] || null);
    setSuccessMessage('');
    setError('');
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(brandingBasePath, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName: values.displayName,
          headerTitle: values.headerTitle,
          headerSubtitle: values.headerSubtitle,
          footerText: values.footerText,
          website: values.website,
          email: values.email,
          phone: values.phone,
          primaryColor: values.primaryColor,
          secondaryColor: values.secondaryColor,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save branding settings.'));
      }

      const data = await readJsonResponse<BrandingResponse>(response, 'Could not save branding settings.');
      setValues((current) => ({
        ...toFormState(data),
        logoUrl: current.logoUrl || data.branding.logoUrl || '',
      }));
      setSuccessMessage('Branding settings saved.');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save branding settings.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogoUpload() {
    if (!selectedFile) {
      setError('Choose a logo image before uploading.');
      return;
    }

    setIsUploading(true);
    setError('');
    setSuccessMessage('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch(`${brandingBasePath}/logo`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not upload branding logo.'));
      }

      const data = await readJsonResponse<BrandingResponse>(response, 'Could not upload branding logo.');
      setValues((current) => ({
        ...current,
        logoUrl: data.branding.logoUrl || '',
      }));
      setSelectedFile(null);
      setSuccessMessage('Logo uploaded.');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not upload branding logo.');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleResetBranding() {
    if (!window.confirm(`Reset branding for ${companyName}?`)) {
      return;
    }

    setIsResetting(true);
    setError('');
    setSuccessMessage('');

    try {
      const response = await fetch(brandingBasePath, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName: null,
          logoUrl: null,
          headerTitle: null,
          headerSubtitle: null,
          footerText: null,
          website: null,
          email: null,
          phone: null,
          primaryColor: null,
          secondaryColor: null,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not reset branding settings.'));
      }

      const data = await readJsonResponse<BrandingResponse>(response, 'Could not reset branding settings.');
      setValues(toFormState(data));
      setSelectedFile(null);
      setSuccessMessage('Branding reset.');
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not reset branding settings.');
    } finally {
      setIsResetting(false);
    }
  }

  const previewUrl = resolveLogoUrl(apiBaseUrl, values.logoUrl);

  return (
    <section className="branding-settings">
      <div className="branding-settings-header">
        <p className="eyebrow">Branding Settings</p>
        <h3>Branding Settings</h3>
        <p className="form-helper">Manage branding used in PDFs for {companyName}.</p>
      </div>

      {isLoading ? (
        <p className="form-helper">Loading branding settings...</p>
      ) : (
        <form className="entity-form branding-settings-form" onSubmit={handleSave}>
          <section className="branding-section">
            <div className="branding-section-header">
              <h4>Logo</h4>
              <p className="form-helper">Upload the logo used in branded PDF headers.</p>
            </div>
            <div className="branding-logo-preview">
              {previewUrl ? (
                <img src={previewUrl} alt={`${companyName} logo`} />
              ) : (
                <div className="branding-logo-placeholder">No logo uploaded</div>
              )}
            </div>

            <div className="branding-logo-meta">
              <label>
                Upload Logo
                <input type="file" accept="image/*" onChange={handleFileChange} />
              </label>
              <button type="button" onClick={handleLogoUpload} disabled={isUploading || !selectedFile}>
                {isUploading ? 'Uploading...' : 'Upload logo'}
              </button>
              {isUploading ? <p className="form-helper">Uploading logo...</p> : null}
            </div>
          </section>

          <section className="branding-section">
            <div className="branding-section-header">
              <h4>Brand Details</h4>
              <p className="form-helper">Control the labels and contact details shown in branded PDFs.</p>
            </div>

            <div className="branding-two-column">
              <div className="branding-column">
                <label>
                  Display Name
                  <input
                    value={values.displayName}
                    onChange={(event) => updateValue('displayName', event.target.value)}
                    placeholder="Company display name"
                  />
                </label>

                <label>
                  Header Title
                  <input
                    value={values.headerTitle}
                    onChange={(event) => updateValue('headerTitle', event.target.value)}
                    placeholder="Proposal heading"
                  />
                </label>

                <label>
                  Email
                  <input value={values.email} onChange={(event) => updateValue('email', event.target.value)} placeholder="sales@example.com" />
                </label>
              </div>

              <div className="branding-column">
                <label>
                  Website
                  <input
                    value={values.website}
                    onChange={(event) => updateValue('website', event.target.value)}
                    placeholder="https://example.com"
                  />
                </label>

                <label>
                  Header Subtitle
                  <input
                    value={values.headerSubtitle}
                    onChange={(event) => updateValue('headerSubtitle', event.target.value)}
                    placeholder="Optional supporting header text"
                  />
                </label>

                <label>
                  Phone
                  <input value={values.phone} onChange={(event) => updateValue('phone', event.target.value)} placeholder="+1 555 0100" />
                </label>
              </div>
            </div>

            <label>
              Footer Text
              <textarea
                value={values.footerText}
                onChange={(event) => updateValue('footerText', event.target.value)}
                rows={3}
                placeholder="Optional footer text"
              />
            </label>
          </section>

          <section className="branding-section">
            <div className="branding-section-header">
              <h4>Colors</h4>
              <p className="form-helper">Primary and secondary colors are used across branded PDF presentation.</p>
            </div>

            <div className="form-row-4">
              <label>
                Primary Color
                <input value={values.primaryColor} onChange={(event) => updateValue('primaryColor', event.target.value.toUpperCase())} type="color" />
              </label>

              <label>
                Primary Hex
                <input
                  value={values.primaryColor}
                  onChange={(event) => updateValue('primaryColor', event.target.value.toUpperCase())}
                  placeholder="#0F766E"
                  pattern="^#?[0-9A-Fa-f]{6}$"
                />
              </label>

              <label>
                Secondary / Accent Color
                <input value={values.secondaryColor} onChange={(event) => updateValue('secondaryColor', event.target.value.toUpperCase())} type="color" />
              </label>

              <label>
                Secondary / Accent Hex
                <input
                  value={values.secondaryColor}
                  onChange={(event) => updateValue('secondaryColor', event.target.value.toUpperCase())}
                  placeholder="#0F766E"
                  pattern="^#?[0-9A-Fa-f]{6}$"
                />
              </label>
            </div>
          </section>

          <div className="branding-actions">
            <button type="submit" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save branding'}
            </button>
            <button type="button" className="secondary-button" onClick={handleResetBranding} disabled={isResetting || isSaving || isUploading}>
              {isResetting ? 'Resetting...' : 'Reset Branding'}
            </button>
          </div>

          {successMessage ? <p className="form-helper">{successMessage}</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
        </form>
      )}
    </section>
  );
}
