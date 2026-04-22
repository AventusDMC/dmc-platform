'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../../lib/auth-client';

type SupportTextTemplate = {
  id: string;
  title: string;
  templateType: 'inclusions' | 'exclusions' | 'terms_notes';
  content: string;
};

type SupportTextFormProps = {
  apiBaseUrl: string;
  quoteId: string;
  templates: SupportTextTemplate[];
  initialValues: {
    inclusionsText: string;
    exclusionsText: string;
    termsNotesText: string;
  };
};

export function SupportTextForm({ apiBaseUrl, quoteId, templates, initialValues }: SupportTextFormProps) {
  const router = useRouter();
  const [inclusionsText, setInclusionsText] = useState(initialValues.inclusionsText);
  const [exclusionsText, setExclusionsText] = useState(initialValues.exclusionsText);
  const [termsNotesText, setTermsNotesText] = useState(initialValues.termsNotesText);
  const [selectedInclusionsTemplateId, setSelectedInclusionsTemplateId] = useState('');
  const [selectedExclusionsTemplateId, setSelectedExclusionsTemplateId] = useState('');
  const [selectedTermsTemplateId, setSelectedTermsTemplateId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const inclusionsTemplates = useMemo(
    () => templates.filter((template) => template.templateType === 'inclusions'),
    [templates],
  );
  const exclusionsTemplates = useMemo(
    () => templates.filter((template) => template.templateType === 'exclusions'),
    [templates],
    );
  const termsTemplates = useMemo(
    () => templates.filter((template) => template.templateType === 'terms_notes'),
    [templates],
  );

  function applyTemplate(
    templateId: string,
    availableTemplates: SupportTextTemplate[],
    setValue: (value: string) => void,
  ) {
    const template = availableTemplates.find((entry) => entry.id === templateId);

    if (!template) {
      return;
    }

    setValue(template.content);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}`, {
        method: 'PATCH',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          inclusionsText: inclusionsText.trim() || null,
          exclusionsText: exclusionsText.trim() || null,
          termsNotesText: termsNotesText.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error('Could not save support text.');
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save support text.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="workspace-section" onSubmit={handleSubmit}>
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Client-Facing Copy</p>
          <h2>Support text</h2>
        </div>
        <Link href="/support-text-templates" className="secondary-button">
          Manage templates
        </Link>
      </div>

      <div className="support-text-grid">
        <section className="stacked-card">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Inclusions</p>
              <h3 className="section-title" style={{ fontSize: '1rem' }}>Included services</h3>
            </div>
          </div>
          <div className="form-row">
            <label>
              Template
              <select value={selectedInclusionsTemplateId} onChange={(event) => setSelectedInclusionsTemplateId(event.target.value)}>
                <option value="">Select template</option>
                {inclusionsTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary-button"
              onClick={() => applyTemplate(selectedInclusionsTemplateId, inclusionsTemplates, setInclusionsText)}
              disabled={!selectedInclusionsTemplateId}
            >
              Apply template
            </button>
          </div>
          <label>
            Text
            <textarea
              value={inclusionsText}
              onChange={(event) => setInclusionsText(event.target.value)}
              rows={8}
              placeholder="One inclusion per line"
            />
          </label>
        </section>

        <section className="stacked-card">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Exclusions</p>
              <h3 className="section-title" style={{ fontSize: '1rem' }}>Excluded services</h3>
            </div>
          </div>
          <div className="form-row">
            <label>
              Template
              <select value={selectedExclusionsTemplateId} onChange={(event) => setSelectedExclusionsTemplateId(event.target.value)}>
                <option value="">Select template</option>
                {exclusionsTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary-button"
              onClick={() => applyTemplate(selectedExclusionsTemplateId, exclusionsTemplates, setExclusionsText)}
              disabled={!selectedExclusionsTemplateId}
            >
              Apply template
            </button>
          </div>
          <label>
            Text
            <textarea
              value={exclusionsText}
              onChange={(event) => setExclusionsText(event.target.value)}
              rows={8}
              placeholder="One exclusion per line"
            />
          </label>
        </section>

        <section className="stacked-card">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Terms & Notes</p>
              <h3 className="section-title" style={{ fontSize: '1rem' }}>Terms for client copy</h3>
            </div>
          </div>
          <div className="form-row">
            <label>
              Template
              <select value={selectedTermsTemplateId} onChange={(event) => setSelectedTermsTemplateId(event.target.value)}>
                <option value="">Select template</option>
                {termsTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="secondary-button"
              onClick={() => applyTemplate(selectedTermsTemplateId, termsTemplates, setTermsNotesText)}
              disabled={!selectedTermsTemplateId}
            >
              Apply template
            </button>
          </div>
          <label>
            Text
            <textarea
              value={termsNotesText}
              onChange={(event) => setTermsNotesText(event.target.value)}
              rows={8}
              placeholder="One note per line"
            />
          </label>
        </section>
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save support text'}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
