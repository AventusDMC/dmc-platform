'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage, readJsonResponse } from '../../lib/api';
import { packageComponentReferenceLabel, packageComponentTypeLabel, resolvePackageTemplateDays } from '../../packages/package-template-display';
import type { PackageTemplate } from '../../packages/types';

type ProgramTemplateImportPanelProps = {
  apiBaseUrl: string;
  quoteId: string;
  defaultPax: number;
  defaultStartDate?: string | null;
};

export function ProgramTemplateImportPanel({ apiBaseUrl, quoteId, defaultPax, defaultStartDate }: ProgramTemplateImportPanelProps) {
  const router = useRouter();
  const [templates, setTemplates] = useState<PackageTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [startDate, setStartDate] = useState(defaultStartDate?.slice(0, 10) || '');
  const [hotelCategory, setHotelCategory] = useState('');
  const [pax, setPax] = useState(defaultPax > 0 ? String(defaultPax) : '');
  const [guideLanguage, setGuideLanguage] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    fetch(`${apiBaseUrl}/package-templates`, { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Could not load program templates.');
        }
        return readJsonResponse<PackageTemplate[]>(response, 'Could not load program templates.');
      })
      .then((payload) => {
        if (!mounted) return;
        const activeTemplates = payload.filter((template) => template.active !== false);
        setTemplates(activeTemplates);
        const classic = activeTemplates.find((template) => template.name === 'Classic Jordan 8D7N' || (template as any).code === 'PROGRAM-CLASSIC-JORDAN-8D7N');
        setSelectedTemplateId((classic || activeTemplates[0])?.id || '');
      })
      .catch((error) => {
        if (mounted) {
          setStatus(error instanceof Error ? error.message : 'Could not load program templates.');
        }
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [apiBaseUrl]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) || null,
    [selectedTemplateId, templates],
  );
  const previewDays = useMemo(
    () => (selectedTemplate ? resolvePackageTemplateDays(selectedTemplate.days, selectedTemplate.components || [], selectedTemplate.durationDays) : []),
    [selectedTemplate],
  );
  const activeComponentCount = previewDays.reduce((sum, day) => sum + day.components.filter((component) => component.active !== false).length, 0);

  async function importTemplate() {
    if (!selectedTemplate) {
      setStatus('Choose a program template before importing.');
      return;
    }

    setIsImporting(true);
    setStatus(null);

    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${encodeURIComponent(quoteId)}/import-program-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageTemplateId: selectedTemplate.id,
          startDate: startDate || null,
          hotelCategory: hotelCategory.trim() || null,
          pax: pax.trim() || null,
          guideLanguage: guideLanguage.trim() || null,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Program template import failed.'));
      }

      const result = await readJsonResponse<{ importedDays: number; createdItems: unknown[] }>(response, 'Program template import failed.');
      setStatus(`Imported ${result.importedDays} days and ${result.createdItems.length} draft quote components.`);
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Program template import failed.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <details className="quote-operational-collapsible quote-operational-collapsible-program-template">
      <summary>
        <div>
          <span className="eyebrow">Program Templates</span>
          <strong>Import Program Template</strong>
        </div>
        <em>{selectedTemplate ? `${previewDays.length} days / ${activeComponentCount} components` : isLoading ? 'Loading' : 'None available'}</em>
      </summary>

      <div className="form-field-stack">
        <div className="form-grid">
          <label>
            Program Template
            <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} disabled={isLoading || templates.length === 0}>
              {templates.length === 0 ? <option value="">No active program templates</option> : null}
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Start date
            <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </label>
          <label>
            Hotel category
            <input value={hotelCategory} onChange={(event) => setHotelCategory(event.target.value)} placeholder="Optional" />
          </label>
          <label>
            Pax
            <input inputMode="numeric" value={pax} onChange={(event) => setPax(event.target.value)} placeholder="Optional" />
          </label>
          <label>
            Guide language
            <input value={guideLanguage} onChange={(event) => setGuideLanguage(event.target.value)} placeholder="Optional" />
          </label>
        </div>

        {selectedTemplate ? (
          <div className="section-stack">
            {previewDays.map((day) => (
              <section key={day.id || day.dayNumber} className="quote-template-preview-day">
                <strong>Day {day.dayNumber}: {day.title || `Day ${day.dayNumber}`}</strong>
                {day.description ? <p className="form-helper">{day.description}</p> : null}
                <div className="quote-template-component-list">
                  {day.components
                    .filter((component) => component.active !== false)
                    .map((component) => (
                      <span key={component.id} className="quote-template-component-row">
                        <strong>{component.label}</strong>
                        <em>{packageComponentTypeLabel(component.componentType)} | {packageComponentReferenceLabel(component)}</em>
                      </span>
                    ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}

        {status ? <p className={status.toLowerCase().includes('failed') || status.toLowerCase().includes('could not') ? 'form-error' : 'form-helper'}>{status}</p> : null}

        <div className="form-actions">
          <button type="button" onClick={importTemplate} disabled={!selectedTemplate || isImporting}>
            {isImporting ? 'Importing...' : 'Confirm Import Program Template'}
          </button>
        </div>
      </div>
    </details>
  );
}
