'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export type PoiTranslation = {
  locale: string;
  title?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
};

export type PointOfInterest = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  cityId?: string | null;
  operationalAreaId?: string | null;
  activityId?: string | null;
  stopType?: string | null;
  visitDurationMinutes?: number | null;
  guideRecommended: boolean;
  lunchOpportunity: boolean;
  photoStop: boolean;
  viewpoint: boolean;
  religiousSite: boolean;
  imageUrl?: string | null;
  operationalNotes?: string | null;
  translations?: PoiTranslation[];
  city?: { id: string; name: string } | null;
};

export type PoiLinkOption = { id: string; label: string };

const LOCALES: Array<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'ar', label: 'العربية' },
];

type LocaleContent = { title: string; shortDescription: string; longDescription: string };
type TranslationDraft = Record<string, LocaleContent>;

function blankTranslations(): TranslationDraft {
  return LOCALES.reduce((accumulator, locale) => {
    accumulator[locale.code] = { title: '', shortDescription: '', longDescription: '' };
    return accumulator;
  }, {} as TranslationDraft);
}

function toTranslationDraft(translations?: PoiTranslation[]): TranslationDraft {
  const draft = blankTranslations();
  (translations || []).forEach((entry) => {
    const code = (entry.locale || '').toLowerCase();
    if (draft[code]) {
      draft[code] = {
        title: entry.title || '',
        shortDescription: entry.shortDescription || '',
        longDescription: entry.longDescription || '',
      };
    }
  });
  return draft;
}

type EditorState = {
  id: string | null;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: string;
  cityId: string;
  operationalAreaId: string;
  activityId: string;
  stopType: string;
  visitDurationMinutes: string;
  guideRecommended: boolean;
  lunchOpportunity: boolean;
  photoStop: boolean;
  viewpoint: boolean;
  religiousSite: boolean;
  imageUrl: string;
  operationalNotes: string;
  translations: TranslationDraft;
};

function newEditorState(): EditorState {
  return {
    id: null,
    code: '',
    name: '',
    isActive: true,
    sortOrder: '0',
    cityId: '',
    operationalAreaId: '',
    activityId: '',
    stopType: '',
    visitDurationMinutes: '',
    guideRecommended: false,
    lunchOpportunity: false,
    photoStop: false,
    viewpoint: false,
    religiousSite: false,
    imageUrl: '',
    operationalNotes: '',
    translations: blankTranslations(),
  };
}

function editorStateFromPoi(poi: PointOfInterest): EditorState {
  return {
    id: poi.id,
    code: poi.code || '',
    name: poi.name || '',
    isActive: poi.isActive !== false,
    sortOrder: String(poi.sortOrder ?? 0),
    cityId: poi.cityId || '',
    operationalAreaId: poi.operationalAreaId || '',
    activityId: poi.activityId || '',
    stopType: poi.stopType || '',
    visitDurationMinutes: poi.visitDurationMinutes == null ? '' : String(poi.visitDurationMinutes),
    guideRecommended: Boolean(poi.guideRecommended),
    lunchOpportunity: Boolean(poi.lunchOpportunity),
    photoStop: Boolean(poi.photoStop),
    viewpoint: Boolean(poi.viewpoint),
    religiousSite: Boolean(poi.religiousSite),
    imageUrl: poi.imageUrl || '',
    operationalNotes: poi.operationalNotes || '',
    translations: toTranslationDraft(poi.translations),
  };
}

type ManagerProps = {
  initialPois: PointOfInterest[];
  cityOptions: PoiLinkOption[];
  areaOptions: PoiLinkOption[];
  activityOptions: PoiLinkOption[];
};

export function PointsOfInterestManager({ initialPois, cityOptions, areaOptions, activityOptions }: ManagerProps) {
  const router = useRouter();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [activeLocale, setActiveLocale] = useState('en');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const sortedPois = useMemo(
    () => [...initialPois].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name)),
    [initialPois],
  );

  function startCreate() {
    setEditor(newEditorState());
    setActiveLocale('en');
    setError('');
    setStatus('');
  }

  function startEdit(poi: PointOfInterest) {
    setEditor(editorStateFromPoi(poi));
    setActiveLocale('en');
    setError('');
    setStatus('');
  }

  function patchEditor(patch: Partial<EditorState>) {
    setEditor((current) => (current ? { ...current, ...patch } : current));
  }

  function patchLocale(locale: string, patch: Partial<LocaleContent>) {
    setEditor((current) => {
      if (!current) return current;
      return {
        ...current,
        translations: {
          ...current.translations,
          [locale]: { ...current.translations[locale], ...patch },
        },
      };
    });
  }

  async function save() {
    if (!editor) return;
    if (!editor.name.trim()) {
      setError('Name is required.');
      return;
    }
    setIsSaving(true);
    setError('');
    setStatus('');
    try {
      const payload = {
        code: editor.code.trim() || undefined,
        name: editor.name.trim(),
        isActive: editor.isActive,
        sortOrder: Number(editor.sortOrder) || 0,
        cityId: editor.cityId || null,
        operationalAreaId: editor.operationalAreaId || null,
        activityId: editor.activityId || null,
        stopType: editor.stopType.trim() || null,
        visitDurationMinutes: editor.visitDurationMinutes === '' ? null : Number(editor.visitDurationMinutes),
        guideRecommended: editor.guideRecommended,
        lunchOpportunity: editor.lunchOpportunity,
        photoStop: editor.photoStop,
        viewpoint: editor.viewpoint,
        religiousSite: editor.religiousSite,
        imageUrl: editor.imageUrl.trim() || null,
        operationalNotes: editor.operationalNotes.trim() || null,
        translations: LOCALES.map((locale) => ({
          locale: locale.code,
          title: editor.translations[locale.code].title,
          shortDescription: editor.translations[locale.code].shortDescription,
          longDescription: editor.translations[locale.code].longDescription,
        })),
      };
      const url = editor.id ? `/api/points-of-interest/${editor.id}` : '/api/points-of-interest';
      const response = await fetch(url, {
        method: editor.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message || 'Could not save point of interest.');
      }
      setStatus(editor.id ? 'Point of interest updated.' : 'Point of interest created.');
      setEditor(null);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save point of interest.');
    } finally {
      setIsSaving(false);
    }
  }

  const localeContent = editor ? editor.translations[activeLocale] : null;

  return (
    <section className="section-stack">
      <div className="inline-actions">
        <button type="button" className="primary-button" onClick={startCreate}>
          New point of interest
        </button>
        {status ? <span className="detail-copy" style={{ color: 'var(--ds-color-success, #067647)' }}>{status}</span> : null}
      </div>

      {editor ? (
        <article className="workspace-section">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">{editor.id ? 'Edit' : 'New'}</p>
              <h2>{editor.id ? editor.name || 'Point of interest' : 'New point of interest'}</h2>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Name
              <input value={editor.name} onChange={(event) => patchEditor({ name: event.target.value })} />
            </label>
            <label>
              Code
              <input value={editor.code} placeholder="auto from name" onChange={(event) => patchEditor({ code: event.target.value })} />
            </label>
            <label>
              Sort order
              <input type="number" value={editor.sortOrder} onChange={(event) => patchEditor({ sortOrder: event.target.value })} />
            </label>
            <label>
              Active
              <select value={editor.isActive ? 'true' : 'false'} onChange={(event) => patchEditor({ isActive: event.target.value === 'true' })}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
          </div>

          <div className="form-grid">
            <label>
              Stop type
              <input value={editor.stopType} placeholder="e.g. Archaeological site" onChange={(event) => patchEditor({ stopType: event.target.value })} />
            </label>
            <label>
              Visit duration (minutes)
              <input type="number" min="0" value={editor.visitDurationMinutes} onChange={(event) => patchEditor({ visitDurationMinutes: event.target.value })} />
            </label>
            <label>
              Image URL
              <input value={editor.imageUrl} onChange={(event) => patchEditor({ imageUrl: event.target.value })} />
            </label>
          </div>

          <div className="inline-actions" style={{ flexWrap: 'wrap', gap: '14px' }}>
            <label className="checkbox-inline">
              <input type="checkbox" checked={editor.guideRecommended} onChange={(event) => patchEditor({ guideRecommended: event.target.checked })} />
              Guide recommended
            </label>
            <label className="checkbox-inline">
              <input type="checkbox" checked={editor.lunchOpportunity} onChange={(event) => patchEditor({ lunchOpportunity: event.target.checked })} />
              Lunch opportunity
            </label>
            <label className="checkbox-inline">
              <input type="checkbox" checked={editor.photoStop} onChange={(event) => patchEditor({ photoStop: event.target.checked })} />
              Photo stop
            </label>
            <label className="checkbox-inline">
              <input type="checkbox" checked={editor.viewpoint} onChange={(event) => patchEditor({ viewpoint: event.target.checked })} />
              Viewpoint
            </label>
            <label className="checkbox-inline">
              <input type="checkbox" checked={editor.religiousSite} onChange={(event) => patchEditor({ religiousSite: event.target.checked })} />
              Religious site
            </label>
          </div>

          <div className="form-grid">
            <label>
              City (link)
              <select value={editor.cityId} onChange={(event) => patchEditor({ cityId: event.target.value })}>
                <option value="">— none —</option>
                {cityOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              Operational area (link)
              <select value={editor.operationalAreaId} onChange={(event) => patchEditor({ operationalAreaId: event.target.value })}>
                <option value="">— none —</option>
                {areaOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              Activity (link, for pricing)
              <select value={editor.activityId} onChange={(event) => patchEditor({ activityId: event.target.value })}>
                <option value="">— none —</option>
                {activityOptions.map((option) => (
                  <option key={option.id} value={option.id}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <label>
            Operational notes (internal)
            <textarea rows={2} value={editor.operationalNotes} onChange={(event) => patchEditor({ operationalNotes: event.target.value })} />
          </label>

          <div className="detail-card">
            <p className="eyebrow">Client content</p>
            <div className="inline-actions" style={{ gap: '6px', flexWrap: 'wrap' }}>
              {LOCALES.map((locale) => (
                <button
                  key={locale.code}
                  type="button"
                  className={activeLocale === locale.code ? 'primary-button' : 'secondary-button'}
                  onClick={() => setActiveLocale(locale.code)}
                >
                  {locale.label}
                </button>
              ))}
            </div>
            {localeContent ? (
              <div className="section-stack" style={{ marginTop: '0.6rem' }} dir={activeLocale === 'ar' ? 'rtl' : 'ltr'}>
                <label>
                  Title
                  <input value={localeContent.title} onChange={(event) => patchLocale(activeLocale, { title: event.target.value })} />
                </label>
                <label>
                  Short description
                  <textarea rows={2} value={localeContent.shortDescription} onChange={(event) => patchLocale(activeLocale, { shortDescription: event.target.value })} />
                </label>
                <label>
                  Long description
                  <textarea rows={6} value={localeContent.longDescription} onChange={(event) => patchLocale(activeLocale, { longDescription: event.target.value })} />
                </label>
              </div>
            ) : null}
          </div>

          {error ? <p className="form-error">{error}</p> : null}
          <div className="inline-actions">
            <button type="button" className="primary-button" disabled={isSaving} onClick={save}>
              {isSaving ? 'Saving…' : editor.id ? 'Save changes' : 'Create point of interest'}
            </button>
            <button type="button" className="secondary-button" disabled={isSaving} onClick={() => setEditor(null)}>
              Cancel
            </button>
          </div>
        </article>
      ) : null}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Code</th>
              <th>City</th>
              <th>Flags</th>
              <th>Languages</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedPois.length === 0 ? (
              <tr>
                <td colSpan={7} className="detail-copy">No points of interest yet — create the first one.</td>
              </tr>
            ) : (
              sortedPois.map((poi) => {
                const flags = [
                  poi.viewpoint ? 'Viewpoint' : null,
                  poi.religiousSite ? 'Religious' : null,
                  poi.photoStop ? 'Photo' : null,
                  poi.lunchOpportunity ? 'Lunch' : null,
                  poi.guideRecommended ? 'Guide' : null,
                ].filter(Boolean);
                const languages = (poi.translations || [])
                  .filter((entry) => entry.title || entry.shortDescription || entry.longDescription)
                  .map((entry) => (entry.locale || '').toUpperCase());
                return (
                  <tr key={poi.id}>
                    <td>{poi.name}</td>
                    <td>{poi.code}</td>
                    <td>{poi.city?.name || '—'}</td>
                    <td>{flags.length ? flags.join(', ') : '—'}</td>
                    <td>{languages.length ? languages.join(' · ') : '—'}</td>
                    <td>{poi.isActive ? 'Active' : 'Inactive'}</td>
                    <td>
                      <button type="button" className="secondary-button" onClick={() => startEdit(poi)}>Edit</button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
