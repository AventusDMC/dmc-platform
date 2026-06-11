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

// Local sentinels for the two non-preset choices (UI-only; never submitted).
const KEEP_CURRENT_KEY = '__keep_current__';
const LEISURE_KEY = '__leisure__';

export type RoutePlannerDay = { id: string; dayNumber: number; title: string | null };

export function RoutePlannerPreview({ apiBaseUrl, days }: { apiBaseUrl: string; days: RoutePlannerDay[] }) {
  const router = useRouter();
  const sorted = [...(days || [])].sort((a, b) => a.dayNumber - b.dayNumber);
  // Preview-only selection state, keyed by day number. Not persisted on its own.
  const [selected, setSelected] = useState<Record<number, string>>({});
  const [applyingDay, setApplyingDay] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [appliedDay, setAppliedDay] = useState<number | null>(null);

  // S.2D-3B — the curated classic route template for the current duration (4/5/6/7
  // days), or null for 8-day (existing generator) / other durations. Preview-only.
  const templateKeys = getClassicJordanRouteTemplate(sorted.length);

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

  return (
    <section className="route-planner-preview" aria-label="Route Planner">
      <p className="form-help">
        Choose a route preset per day to preview its title, narrative and overnight city. &ldquo;Apply to Day&rdquo; writes the selected preset to that day&rsquo;s title and narrative only — it does not add hotels, transport, tickets, guides, or pricing.
      </p>
      {error ? <p className="form-error">{error}</p> : null}

      {/* S.2D-3B — Classic Jordan Route Template PREVIEW for the current duration.
          Read-only: no apply, no PATCH, no persistence. The Apply button is shown
          but DISABLED (apply lands in S.2D-3C). */}
      <section className="route-template-preview" aria-label="Classic Jordan Route Template">
        <h4>Classic Jordan Route Template</h4>
        <p className="form-help">Preview only — templates are not saved yet.</p>
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
            <button type="button" className="route-template-apply" disabled title="Template apply comes in the next phase.">
              Apply Template (next phase)
            </button>
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
          return (
            <div key={day.dayNumber} className="route-planner-row">
              <div className="route-planner-day">
                <strong>Day {String(day.dayNumber).padStart(2, '0')}</strong>
                <span className="form-help">Current title: {day.title?.trim() || `Day ${day.dayNumber}`}</span>
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
