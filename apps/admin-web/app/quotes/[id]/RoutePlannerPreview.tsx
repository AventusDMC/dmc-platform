'use client';

// Phase S.2D-1/-2 — per-day Route Planner.
//
// S.2D-1: pick a route preset per itinerary day and PREVIEW the title / narrative
// / overnight city it would write.
// S.2D-2: "Apply to Day" writes the selected preset to ONE day's title + notes via
// the EXISTING PATCH /itinerary/day/:dayId endpoint — nothing else:
//   • no new backend endpoint, no generator call, no DTO/schema/pricing change,
//   • no service / QuoteItem creation, no /items call,
//   • no hotel/transport/experience/guide auto-apply,
//   • updates ONLY the one selected day (title + notes), confirmed first.
// "Custom / keep current" and "Leisure / no transport" never PATCH (leisure stays
// preview-only until it has safe title/narrative/overnight handling).
// Reuses the existing DAY_ROUTE_PRESETS catalog (no new place data).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { buildAuthHeaders } from '../../lib/auth-client';
import { getErrorMessage } from '../../lib/api';
import { DAY_ROUTE_PRESETS, getDayRoutePreset, getClassicJordanRouteTemplate } from './day-route-presets';
// Phase R.7A-1/-2 — read-only English client narrative preview, generated purely
// from the day's route/day text (title + notes) and, when present, the day's
// already-applied services (R.7A-2). No network, no save.
// R.7B-3B/-4 — the preview is language-aware (en/es/pt/ar) via a UI selector;
// narrativeTextDirection drives RTL for Arabic. R.7B-4 allows saving the selected
// language into the existing day notes (notes-only PATCH, one day at a time). The
// backend/API, schema, and client document rendering are untouched; the selected
// language is never persisted as a separate field.
import { buildDayNarrativePreview, isClientSafeNarrative, narrativeTextDirection, resolveNarrativeLocale, type AppliedNarrativeService, type NarrativeLocale } from './day-narrative-preview';

// R.7B-3B — supported client-narrative PREVIEW languages (label + code).
const NARRATIVE_LANGUAGE_OPTIONS: { code: NarrativeLocale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ar', label: 'Arabic' },
];

// R.7B-4 — display label per locale (used in the save button + confirmation copy).
const NARRATIVE_LANGUAGE_LABELS: Record<NarrativeLocale, string> = {
  en: 'English',
  es: 'Spanish',
  pt: 'Portuguese',
  ar: 'Arabic',
};

// R.7A-3 — set of known route-preset narratives, used to tell whether a day's
// current notes came from a preset/template (safe to replace quietly) or look
// manually edited (warrants a stronger overwrite warning).
const PRESET_NARRATIVES = new Set(DAY_ROUTE_PRESETS.map((p) => (p.narrative || '').trim()).filter(Boolean));

// Local sentinels for the two non-preset choices (UI-only; never submitted).
const KEEP_CURRENT_KEY = '__keep_current__';
const LEISURE_KEY = '__leisure__';

export type RoutePlannerDay = {
  id: string;
  dayNumber: number;
  title: string | null;
  notes?: string | null;
  // R.7A-2 — client-safe descriptors of services already applied to this day.
  appliedServices?: AppliedNarrativeService[];
};

export function RoutePlannerPreview({ apiBaseUrl, days }: { apiBaseUrl: string; days: RoutePlannerDay[] }) {
  const router = useRouter();
  const sorted = [...(days || [])].sort((a, b) => a.dayNumber - b.dayNumber);
  // Preview-only selection state, keyed by day number. Not persisted on its own.
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [applyingDay, setApplyingDay] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [appliedDay, setAppliedDay] = useState<number | null>(null);
  const [applyingTemplate, setApplyingTemplate] = useState(false);
  const [templateApplied, setTemplateApplied] = useState(false);
  // R.7A-3 — per-day "Use this narrative" save state.
  const [savingNarrativeDay, setSavingNarrativeDay] = useState<number | null>(null);
  const [savedNarrativeDay, setSavedNarrativeDay] = useState<number | null>(null);
  // R.7B-3B — per-day client-narrative PREVIEW language (en/es/pt/ar). Default
  // English. Preview-only: never persisted, never sent to the backend, never
  // changes day notes or the stored document language.
  const [narrativeLocale, setNarrativeLocale] = useState<Record<number, NarrativeLocale>>({});

  // S.2D-3B — the curated classic route template for the current duration (4/5/6/7
  // days), or null for 8-day (existing generator) / other durations.
  const templateKeys = getClassicJordanRouteTemplate(sorted.length);

  // S.2D-3C — apply the whole curated template to the existing days, ONE day at a
  // time via the existing PATCH /itinerary/day/:dayId (title + notes only). No new
  // endpoint, no generator, no services/QuoteItems/pricing, no day create/delete.
  // Strong confirm first (it overwrites multiple days' titles/narratives). If the
  // day count doesn't match the template length, refuses with a clear message. On
  // any PATCH failure it surfaces the error and does NOT claim full success.
  async function applyTemplate() {
    if (!templateKeys) return;
    if (templateKeys.length !== sorted.length) {
      setError(`This template requires ${templateKeys.length} itinerary days. Please create or adjust the itinerary days first.`);
      return;
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'This will replace the current day titles and narratives with the selected Classic Jordan route template. Services and pricing will not be changed. Continue?',
      )
    ) {
      return;
    }
    setApplyingTemplate(true);
    setError('');
    setTemplateApplied(false);
    try {
      for (let i = 0; i < templateKeys.length; i++) {
        const day = sorted[i];
        const tp = getDayRoutePreset(templateKeys[i]);
        if (!day || !tp) {
          throw new Error('Template could not be matched to the itinerary days.');
        }
        const response = await fetch(`${apiBaseUrl}/itinerary/day/${day.id}`, {
          method: 'PATCH',
          headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ title: tp.defaultTitle, notes: tp.narrative }),
        });
        if (!response.ok) {
          throw new Error(await getErrorMessage(response, `Could not apply the template to day ${day.dayNumber} — stopped before completing.`));
        }
      }
      setTemplateApplied(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply the route template.');
    } finally {
      setApplyingTemplate(false);
    }
  }

  // S.2D-2 — apply ONE preset to ONE day via the existing day PATCH. Sends only
  // title + notes (a partial update; dayNumber/sortOrder/isActive are untouched
  // server-side). Confirms first since it overwrites the current day content.
  async function applyPresetToDay(day: RoutePlannerDay, presetKey: string) {
    const preset = getDayRoutePreset(presetKey);
    if (!preset) return; // Custom / keep current / Leisure → never PATCH
    if (typeof window !== 'undefined' && !window.confirm('This will replace the current day title and narrative with the selected route preset. Continue?')) {
      return;
    }
    setApplyingDay(day.dayNumber);
    setError('');
    setAppliedDay(null);
    try {
      const response = await fetch(`${apiBaseUrl}/itinerary/day/${day.id}`, {
        method: 'PATCH',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        // Only the title + client-safe narrative (which already carries the
        // "Overnight in <City>." phrase). No services/pricing/QuoteItems.
        body: JSON.stringify({ title: preset.defaultTitle, notes: preset.narrative }),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not apply the route preset to this day.'));
      }
      setAppliedDay(day.dayNumber);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not apply the route preset to this day.');
    } finally {
      setApplyingDay(null);
    }
  }

  // R.7A-3 — does this day's current notes look manually edited? True when the
  // notes are non-blank AND match neither a known route-preset narrative nor the
  // generated narrative preview — i.e. an operator likely hand-wrote them.
  function isManuallyEditedNotes(day: RoutePlannerDay, generatedText: string): boolean {
    const notes = (day.notes || '').trim();
    if (!notes) return false;
    if (PRESET_NARRATIVES.has(notes)) return false;
    if (notes === generatedText.trim()) return false;
    return true;
  }

  // R.7A-3 — save ONE day's generated client narrative into its notes via the
  // EXISTING PATCH /itinerary/day/:dayId. Sends ONLY { notes } (no title /
  // dayNumber / services / pricing / QuoteItems). Confirms first (stronger warning
  // when the current notes look manually edited), and refuses unsafe/empty text.
  async function applyNarrativeToDay(day: RoutePlannerDay, generatedText: string, locale: NarrativeLocale) {
    if (!isClientSafeNarrative(generatedText)) return; // button is disabled in this case
    const manual = isManuallyEditedNotes(day, generatedText);
    // R.7A-3 — English keeps its exact confirmation copy (behaviour unchanged).
    // R.7B-4 — non-English mentions the selected language and warns that day notes
    // stores only ONE language, so saving replaces the current notes.
    const manualPrefix = manual
      ? 'This day’s notes may have been manually edited. Replacing them may overwrite operator changes. '
      : '';
    const message =
      locale === 'en'
        ? `${manualPrefix}This will replace the current day narrative/notes with the client narrative preview. Continue?`
        : `${manualPrefix}Day notes stores only one language. Saving this will replace the current notes with the selected-language text. This will replace the current day notes with the ${NARRATIVE_LANGUAGE_LABELS[locale]} narrative. Continue?`;
    if (typeof window !== 'undefined' && !window.confirm(message)) {
      return;
    }
    setSavingNarrativeDay(day.dayNumber);
    setError('');
    setSavedNarrativeDay(null);
    try {
      const response = await fetch(`${apiBaseUrl}/itinerary/day/${day.id}`, {
        method: 'PATCH',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        // NOTES ONLY — title / dayNumber / sortOrder / isActive / country / POIs /
        // services / QuoteItems / pricing are all left untouched (partial update).
        body: JSON.stringify({ notes: generatedText }),
      });
      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not save the narrative to this day.'));
      }
      setSavedNarrativeDay(day.dayNumber);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the narrative to this day.');
    } finally {
      setSavingNarrativeDay(null);
    }
  }

  return (
    <section className="route-planner-preview" aria-label="Route Planner">
      <p className="form-help">
        Choose a route preset per day to preview its title, narrative and overnight city. &ldquo;Apply to Day&rdquo; writes the selected preset to that day&rsquo;s title and narrative only — it does not add hotels, transport, tickets, guides, or pricing.
      </p>
      {error ? <p className="form-error">{error}</p> : null}

      {/* S.2D-3B preview + S.2D-3C apply — Classic Jordan Route Template for the
          current duration. Apply writes each day's title + notes via the existing
          PATCH /itinerary/day (no services/pricing/generator). 8-day + other
          durations have no template (Apply is not rendered). */}
      <section className="route-template-preview" aria-label="Classic Jordan Route Template">
        <h4>Classic Jordan Route Template</h4>
        <p className="form-help">Preview the curated route below. &ldquo;Apply Template&rdquo; writes each day&rsquo;s title and narrative only — it does not add hotels, transport, tickets, guides, or pricing.</p>
        {templateKeys ? (
          <>
            {sorted.length === 4 ? (
              <p className="form-help route-template-warning" role="alert">
                4-day classic is a short highlights program. It skips Wadi Rum and gives Petra limited time.
              </p>
            ) : null}
            {sorted.length === 5 ? (
              <p className="form-help route-template-warning" role="alert">
                5-day classic is a faster-paced program. It skips Jerash to keep Wadi Rum and Dead Sea.
              </p>
            ) : null}
            <ol className="route-template-rows">
              {templateKeys.map((key, index) => {
                const tp = getDayRoutePreset(key);
                return (
                  <li key={`${key}-${index}`} className="route-template-row">
                    <strong>Day {String(index + 1).padStart(2, '0')}</strong>
                    <span className="route-template-title">{tp?.defaultTitle ?? key}</span>
                    <span className="form-help">Overnight: {tp?.overnightCity ?? 'No overnight (departure day)'}</span>
                    {tp?.narrative ? <span className="form-help route-template-narrative">{tp.narrative}</span> : null}
                  </li>
                );
              })}
            </ol>
            <button
              type="button"
              className="route-template-apply"
              disabled={applyingTemplate}
              onClick={applyTemplate}
            >
              {applyingTemplate ? 'Applying template…' : `Apply ${sorted.length}-day Template to Days`}
            </button>
            {templateApplied && !applyingTemplate ? (
              <span className="route-template-applied">Template applied — day titles & narratives updated. Services and pricing were not changed.</span>
            ) : null}
          </>
        ) : sorted.length === 8 ? (
          <p className="form-help">The 8-day classic route is currently generated by the existing structured generator.</p>
        ) : (
          <p className="form-help">No curated classic template exists yet. Use the basic shell and edit days manually.</p>
        )}
      </section>

      <div className="route-planner-rows">
        {sorted.map((day) => {
          const choice = selected[day.dayNumber] ?? KEEP_CURRENT_KEY;
          const preset = choice === KEEP_CURRENT_KEY || choice === LEISURE_KEY ? null : getDayRoutePreset(choice);
          const isApplying = applyingDay === day.dayNumber;
          // R.7A-1/-2 — deterministic client narrative preview from this day's
          // route/day text + any already-applied services. Read-only.
          // R.7B-3B — rendered in the selected preview language (default English).
          const narrativeLocaleForDay: NarrativeLocale = narrativeLocale[day.dayNumber] ?? 'en';
          const narrativeIsEnglish = narrativeLocaleForDay === 'en';
          const narrativeDir = narrativeTextDirection(narrativeLocaleForDay);
          const narrativePreview = buildDayNarrativePreview({
            dayNumber: day.dayNumber,
            title: day.title,
            notes: day.notes,
            appliedServices: day.appliedServices,
          }, { locale: narrativeLocaleForDay });
          return (
            <div key={day.dayNumber} className="route-planner-row">
              <div className="route-planner-day">
                <strong>Day {String(day.dayNumber).padStart(2, '0')}</strong>
                <span className="form-help">Current title: {day.title?.trim() || `Day ${day.dayNumber}`}</span>
              </div>

              <div className="route-narrative-preview" aria-label="Client narrative preview">
                <span className="form-help">Client narrative preview</span>
                {/* R.7B-3B — preview language selector (preview-only; not persisted). */}
                <label className="route-narrative-language">
                  Preview language
                  <select
                    value={narrativeLocaleForDay}
                    onChange={(e) => setNarrativeLocale((prev) => ({ ...prev, [day.dayNumber]: resolveNarrativeLocale(e.target.value) }))}
                  >
                    {NARRATIVE_LANGUAGE_OPTIONS.map((opt) => (
                      <option key={opt.code} value={opt.code}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                <p className="route-narrative-preview-text" dir={narrativeDir} lang={narrativeLocaleForDay}>{narrativePreview.text}</p>
                <span className="route-narrative-preview-flag">Preview only — not saved yet</span>
                {narrativePreview.sourceLayer === 'service-aware' ? (
                  <span className="route-narrative-preview-services">Includes applied services</span>
                ) : null}
                {/* R.7A-3 / R.7B-4 — save THIS day's narrative (in the selected
                    language) into its notes (one day only, notes-only PATCH; disabled
                    when empty/unsafe). English keeps its original copy; non-English
                    uses a language-specific label + a single-language warning, and the
                    confirmation names the language (see applyNarrativeToDay). */}
                {(() => {
                  const canSave = isClientSafeNarrative(narrativePreview.text);
                  const savingThis = savingNarrativeDay === day.dayNumber;
                  const saveLabel = narrativeIsEnglish
                    ? 'Use this narrative'
                    : `Use this ${NARRATIVE_LANGUAGE_LABELS[narrativeLocaleForDay]} narrative`;
                  return (
                    <>
                      <button
                        type="button"
                        className="route-narrative-use"
                        disabled={!canSave || savingThis}
                        onClick={() => applyNarrativeToDay(day, narrativePreview.text, narrativeLocaleForDay)}
                      >
                        {savingThis ? 'Saving…' : saveLabel}
                      </button>
                      {!narrativeIsEnglish ? (
                        <span className="form-help route-narrative-translated-note">
                          Day notes stores only one language — saving replaces the current notes with the selected-language text.
                        </span>
                      ) : null}
                      {!canSave ? (
                        <span className="form-help">
                          Narrative preview is empty or not client-safe — it cannot be saved to the day notes.
                        </span>
                      ) : null}
                      {savedNarrativeDay === day.dayNumber ? (
                        <span className="form-success" role="status">Saved to day notes. The preview now matches the saved notes.</span>
                      ) : null}
                    </>
                  );
                })()}
              </div>

              <label>
                Route preset
                <select
                  value={choice}
                  onChange={(e) => setSelected((prev) => ({ ...prev, [day.dayNumber]: e.target.value }))}
                >
                  <option value={KEEP_CURRENT_KEY}>Custom / keep current</option>
                  <option value={LEISURE_KEY}>Leisure / no transport</option>
                  {DAY_ROUTE_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>{p.label}</option>
                  ))}
                </select>
              </label>

              <div className="route-planner-preview-values">
                {preset ? (
                  <>
                    <p><strong>Preview title:</strong> {preset.defaultTitle}</p>
                    <p><strong>Preview narrative:</strong> {preset.narrative}</p>
                    <p><strong>Preview overnight:</strong> {preset.overnightCity ?? 'No overnight (departure day)'}</p>
                    <p className="form-help">
                      {preset.transportHint === 'NONE' ? 'Leisure / no transport' : `Transport hint: ${preset.transportHint}`}
                    </p>
                    <button
                      type="button"
                      className="route-planner-apply"
                      disabled={isApplying}
                      onClick={() => applyPresetToDay(day, choice)}
                    >
                      {isApplying ? 'Applying…' : 'Replace Day with Selected Preset'}
                    </button>
                    {appliedDay === day.dayNumber && !isApplying ? (
                      <span className="route-planner-applied">Applied — day title & narrative updated.</span>
                    ) : null}
                  </>
                ) : choice === LEISURE_KEY ? (
                  <>
                    <span className="route-planner-preview-flag">Preview only — not saved yet</span>
                    <p><strong>Preview:</strong> Leisure / no transport</p>
                    <p className="form-help">Overnight stays the same city as the current day. No transfer. (Preview only for now.)</p>
                  </>
                ) : (
                  <>
                    <span className="route-planner-preview-flag">Preview only — not saved yet</span>
                    <p className="form-help">Keeping the current day — no change previewed.</p>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
