'use client';

// Phase S.2D-1 — UI-ONLY per-day Route Planner PREVIEW.
//
// Lets the operator pick a route preset per itinerary day and SEE the title /
// narrative / overnight city that WOULD be written — but persists NOTHING:
//   • no PATCH /itinerary/day call,
//   • no generator call, no DTO/schema/pricing change,
//   • no service / QuoteItem creation,
//   • no mutation of the real itinerary day (manual edits are never overwritten).
// Selecting a preset only updates this component's local preview state. Applying
// presets to days (and the consistency/transport wiring) lands in S.2D-2+.
// Reuses the existing DAY_ROUTE_PRESETS catalog (no new place data).

import { useState } from 'react';
import { DAY_ROUTE_PRESETS, getDayRoutePreset } from './day-route-presets';

// Local sentinels for the two non-preset choices (UI-only; never submitted).
const KEEP_CURRENT_KEY = '__keep_current__';
const LEISURE_KEY = '__leisure__';

export type RoutePlannerDay = { dayNumber: number; title: string | null };

export function RoutePlannerPreview({ days }: { days: RoutePlannerDay[] }) {
  const sorted = [...(days || [])].sort((a, b) => a.dayNumber - b.dayNumber);
  // Preview-only selection state, keyed by day number. Nothing here is persisted.
  const [selected, setSelected] = useState<Record<number, string>>({});

  // 5-day classic routing is operationally tight and lacks a curated departure
  // preset — warn rather than over-promise a complete route (S.2D planning).
  const durationWarning =
    sorted.length === 5
      ? '5-day classic routing is operationally tight and requires a curated departure preset before automation.'
      : null;

  return (
    <section className="route-planner-preview" aria-label="Route Planner (preview)">
      <p className="form-help">
        Preview only — not saved yet. Choosing a preset shows the title, narrative and overnight city that would be written to the day. Nothing is saved, priced, or applied; saving route presets to days comes in a later phase.
      </p>
      {durationWarning ? (
        <p className="form-help route-planner-duration-warning" role="alert">{durationWarning}</p>
      ) : null}

      <div className="route-planner-rows">
        {sorted.map((day) => {
          const choice = selected[day.dayNumber] ?? KEEP_CURRENT_KEY;
          const preset = choice === KEEP_CURRENT_KEY || choice === LEISURE_KEY ? null : getDayRoutePreset(choice);
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
                <span className="route-planner-preview-flag">Preview only — not saved yet</span>
                {preset ? (
                  <>
                    <p><strong>Preview title:</strong> {preset.defaultTitle}</p>
                    <p><strong>Preview narrative:</strong> {preset.narrative}</p>
                    <p><strong>Preview overnight:</strong> {preset.overnightCity ?? 'No overnight (departure day)'}</p>
                    <p className="form-help">
                      {preset.transportHint === 'NONE' ? 'Leisure / no transport' : `Transport hint: ${preset.transportHint}`}
                    </p>
                  </>
                ) : choice === LEISURE_KEY ? (
                  <>
                    <p><strong>Preview:</strong> Leisure / no transport</p>
                    <p className="form-help">Overnight stays the same city as the current day. No transfer.</p>
                  </>
                ) : (
                  <p className="form-help">Keeping the current day — no change previewed.</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
