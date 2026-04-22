'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getErrorMessage, readJsonResponse } from '../lib/api';

type ParsedItineraryConfidence = 'high' | 'medium' | 'low';
type ParsedItemType = 'stay' | 'transfer' | 'activity' | 'meal' | 'other';

type ParsedDay = {
  dayNumber: number;
  title: string;
  summary?: string;
  destination?: string;
};

type ParsedItem = {
  id: string;
  dayNumber?: number;
  type: ParsedItemType;
  title: string;
  description?: string;
  location?: string;
  startTime?: string;
  endTime?: string;
  confidence: ParsedItineraryConfidence;
  needsReview: boolean;
  sourceText?: string;
};

type ParsedUnresolvedItem = {
  id: string;
  text: string;
  suggestedType?: ParsedItemType;
  confidence: ParsedItineraryConfidence;
  reason?: string;
};

type ParsedItinerary = {
  sourceType: 'text';
  tripTitle: string;
  destinations: string[];
  days: ParsedDay[];
  items: ParsedItem[];
  unresolved: ParsedUnresolvedItem[];
  parseWarnings: string[];
  sourceText: string;
};

type CreateQuoteDraftPayload = {
  sourceType: 'text';
  days: Array<{
    dayNumber: number;
    title: string;
    summary: string;
  }>;
  items: Array<{
    dayNumber: number;
    type: ParsedItemType;
    title: string;
    description: string;
    notes: string;
  }>;
  unresolved: Array<{
    type: ParsedItemType;
    title: string;
    description: string;
    notes: string;
  }>;
};

type ImportItineraryClientProps = {
  apiBaseUrl: string;
};

type UnresolvedResolutionState = {
  dayNumber: number;
  type: ParsedItemType;
};

const EMPTY_RESULT: ParsedItinerary = {
  sourceType: 'text',
  tripTitle: '',
  destinations: [],
  days: [],
  items: [],
  unresolved: [],
  parseWarnings: [],
  sourceText: '',
};

const ITEM_TYPES: ParsedItemType[] = ['stay', 'transfer', 'activity', 'meal', 'other'];
const ITEM_TYPE_LABELS: Record<ParsedItemType, string> = {
  stay: 'Stay',
  transfer: 'Transfer',
  activity: 'Activity',
  meal: 'Meal',
  other: 'Other',
};

function formatItemMeta(item: ParsedItem) {
  const parts = [item.location, item.startTime, item.endTime].filter(Boolean);
  return parts.join(' | ');
}

function hasParsedOutput(parsed: ParsedItinerary) {
  return (
    parsed.days.length > 0 ||
    parsed.items.length > 0 ||
    parsed.unresolved.length > 0 ||
    parsed.parseWarnings.length > 0 ||
    Boolean(parsed.sourceText.trim())
  );
}

function sanitizeTitle(value: string | undefined, fallbacks: Array<string | undefined>, defaultValue: string) {
  const normalizedValue = value?.trim();
  if (normalizedValue) {
    return normalizedValue;
  }

  for (const fallback of fallbacks) {
    const normalizedFallback = fallback?.trim();
    if (normalizedFallback) {
      return normalizedFallback;
    }
  }

  return defaultValue;
}

function buildFallbackDay(): ParsedDay {
  return {
    dayNumber: 1,
    title: 'Day 1',
    summary: '',
  };
}

function normalizeDays(days: ParsedDay[], options?: { includeFallback?: boolean }) {
  const daysByNumber = new Map<number, ParsedDay>();

  for (const day of days) {
    if (!daysByNumber.has(day.dayNumber)) {
      daysByNumber.set(day.dayNumber, day);
    }
  }

  const normalizedDays = Array.from(daysByNumber.values()).sort((left, right) => left.dayNumber - right.dayNumber);
  if (normalizedDays.length > 0) {
    return normalizedDays;
  }

  return options?.includeFallback ? [buildFallbackDay()] : [];
}

function normalizeParsedResult(nextParsed: ParsedItinerary): ParsedItinerary {
  const hasRealDays = nextParsed.days.length > 0;
  const normalizedDays = normalizeDays(nextParsed.days, { includeFallback: nextParsed.items.length > 0 });
  const validDayNumbers = new Set(normalizedDays.map((day) => day.dayNumber));
  const unresolved: ParsedUnresolvedItem[] = [...nextParsed.unresolved];

  const items = nextParsed.items.reduce<ParsedItem[]>((result, item) => {
    if (!hasRealDays) {
      result.push({
        ...item,
        dayNumber: normalizedDays[0]?.dayNumber || 1,
        needsReview: true,
      });
      return result;
    }

    const hasValidDayNumber = typeof item.dayNumber === 'number' && validDayNumbers.has(item.dayNumber);
    if (hasValidDayNumber) {
      result.push(item);
      return result;
    }

    unresolved.push({
      id: `unassigned-${item.id}`,
      text: item.title || item.sourceText || item.description || 'Imported item',
      suggestedType: item.type,
      confidence: item.confidence,
      reason:
        typeof item.dayNumber === 'number' && item.dayNumber > 0
          ? `Assigned to missing day ${item.dayNumber}.`
          : 'No valid day assignment was extracted.',
    });

    return result;
  }, []);

  return {
    ...nextParsed,
    days: normalizedDays,
    items,
    unresolved,
  };
}

function buildDraftPayload(parsed: ParsedItinerary): CreateQuoteDraftPayload {
  const normalizedDays = normalizeDays(parsed.days, { includeFallback: parsed.items.length > 0 });

  return {
    sourceType: parsed.sourceType,
    days: normalizedDays.map((day, index) => ({
      dayNumber: day.dayNumber || index + 1,
      title: day.title,
      summary: day.summary || '',
    })),
    items: parsed.items.map((item, index) => ({
        dayNumber:
          typeof item.dayNumber === 'number' && item.dayNumber > 0 && normalizedDays.some((day) => day.dayNumber === item.dayNumber)
            ? item.dayNumber
            : normalizedDays[index]?.dayNumber || normalizedDays[0]?.dayNumber || 1,
        type: item.type,
        title: sanitizeTitle(item.title, [item.sourceText, item.description], `Imported item ${index + 1}`),
        description: item.description || item.sourceText || '',
        notes: '',
      })),
    unresolved: parsed.unresolved.map((item, index) => ({
      type: item.suggestedType || 'other',
      title: sanitizeTitle(item.text, [item.reason], `Unresolved item ${index + 1}`),
      description: item.reason || '',
      notes: '',
    })),
  };
}

export function ImportItineraryClient({ apiBaseUrl }: ImportItineraryClientProps) {
  const router = useRouter();
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedItinerary>(EMPTY_RESULT);
  const [unresolvedResolution, setUnresolvedResolution] = useState<Record<string, UnresolvedResolutionState>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingQuoteDraft, setIsCreatingQuoteDraft] = useState(false);
  const [error, setError] = useState('');

  const sortedDays = useMemo(
    () => normalizeDays(parsed.days, { includeFallback: parsed.items.length > 0 }),
    [parsed.days, parsed.items.length],
  );
  const assignmentDays = useMemo(
    () => normalizeDays(parsed.days, { includeFallback: true }),
    [parsed.days],
  );

  const dayNumbers = useMemo(() => sortedDays.map((day) => day.dayNumber), [sortedDays]);
  const assignmentDayNumbers = useMemo(() => assignmentDays.map((day) => day.dayNumber), [assignmentDays]);
  const reviewVisible = useMemo(() => hasParsedOutput(parsed), [parsed]);

  const activeUnresolved = parsed.unresolved;

  const reviewWarnings = useMemo(() => {
    const warnings = [...parsed.parseWarnings];
    const deduplicatedDayCount = normalizeDays(parsed.days).length;

    if (parsed.days.length > deduplicatedDayCount) {
      warnings.push('Duplicate day numbers were collapsed during review; verify day titles and summaries before creating the draft.');
    }

    if (activeUnresolved.length > 0) {
      warnings.push(`${activeUnresolved.length} unresolved item${activeUnresolved.length === 1 ? '' : 's'} will not block draft creation.`);
    }

    return Array.from(new Set(warnings));
  }, [activeUnresolved.length, parsed.days, parsed.parseWarnings]);

  async function handleExtract() {
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/import-itinerary/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rawText,
          sourceType: 'text',
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not extract itinerary.'));
      }

      const nextParsed = await readJsonResponse<ParsedItinerary>(response, 'Could not extract itinerary.');
      setParsed(normalizeParsedResult(nextParsed));
      setUnresolvedResolution({});
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not extract itinerary.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateQuoteDraft() {
    setIsCreatingQuoteDraft(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/import-itinerary/create-quote-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildDraftPayload(parsed)),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, 'Could not create quote draft.'));
      }

      const result = await readJsonResponse<{ id: string }>(response, 'Could not create quote draft.');
      router.push(`/quotes/${result.id}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not create quote draft.');
    } finally {
      setIsCreatingQuoteDraft(false);
    }
  }

  function updateItem(id: string, updates: Partial<ParsedItem>) {
    setParsed((current) => ({
      ...current,
      items: current.items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    }));
  }

  function updateUnresolvedResolution(id: string, updates: Partial<UnresolvedResolutionState>) {
    setUnresolvedResolution((current) => {
      const next = current[id] || {
        dayNumber: assignmentDayNumbers[0] || 1,
        type: parsed.unresolved.find((item) => item.id === id)?.suggestedType || 'other',
      };

      return {
        ...current,
        [id]: {
          ...next,
          ...updates,
        },
      };
    });
  }

  function assignUnresolvedItem(id: string) {
    const unresolvedItem = parsed.unresolved.find((item) => item.id === id);
    if (!unresolvedItem) {
      return;
    }

    const resolution = unresolvedResolution[id] || {
      dayNumber: assignmentDayNumbers[0] || 1,
      type: unresolvedItem.suggestedType || 'other',
    };

    setParsed((current) => ({
      ...current,
      items: [
        ...current.items,
        {
          id: `resolved-${unresolvedItem.id}`,
          dayNumber: resolution.dayNumber,
          type: resolution.type,
          title: unresolvedItem.text,
          description: '',
          confidence: unresolvedItem.confidence,
          needsReview: true,
          sourceText: unresolvedItem.text,
        },
      ],
      unresolved: current.unresolved.filter((item) => item.id !== id),
    }));

    setUnresolvedResolution((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function ignoreUnresolvedItem(id: string) {
    setParsed((current) => ({
      ...current,
      unresolved: current.unresolved.filter((item) => item.id !== id),
    }));
    setUnresolvedResolution((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  return (
    <div className="import-itinerary-shell">
      <form
        className="entity-form"
        onSubmit={(event) => {
          event.preventDefault();
          void handleExtract();
        }}
      >
        <label>
          Pasted itinerary text
          <textarea
            value={rawText}
            onChange={(event) => setRawText(event.target.value)}
            rows={14}
            placeholder={`Day 1: Arrival in Amman\nMeet at the airport and transfer to hotel.\nDinner at local restaurant.\n\nDay 2: Petra\nDrive to Petra and guided visit.`}
            required
          />
        </label>

        <p className="form-helper">This version only parses pasted text. Save/import mapping can be added later.</p>

        <button type="submit" disabled={isSubmitting || !rawText.trim()}>
          {isSubmitting ? 'Extracting...' : 'Extract itinerary'}
        </button>

        {error ? <p className="form-error">{error}</p> : null}
      </form>

      {reviewVisible ? (
        <section className="workspace-section">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Structured Output</p>
              <h2>Review and edit before saving</h2>
            </div>
            <div className="import-itinerary-actions">
              <span className="workspace-sidebar-note">
                {parsed.items.length} assigned item{parsed.items.length === 1 ? '' : 's'}
              </span>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void handleCreateQuoteDraft()}
                disabled={isSubmitting || isCreatingQuoteDraft}
              >
                {isCreatingQuoteDraft ? 'Creating quote...' : 'Create Quote Draft'}
              </button>
            </div>
          </div>

          <div className="import-itinerary-review-grid">
            <article className="import-itinerary-panel import-itinerary-summary-card">
              <p className="eyebrow">Trip Summary</p>
              <h3>{parsed.tripTitle || 'Imported itinerary'}</h3>
              <div className="import-itinerary-stat-grid">
                <div>
                  <span>Days</span>
                  <strong>{sortedDays.length}</strong>
                </div>
                <div>
                  <span>Assigned items</span>
                  <strong>{parsed.items.length}</strong>
                </div>
                <div>
                  <span>Unresolved</span>
                  <strong>{activeUnresolved.length}</strong>
                </div>
              </div>
            </article>

            <article className="import-itinerary-panel">
              <p className="eyebrow">Destinations</p>
              {parsed.destinations.length > 0 ? (
                <div className="import-itinerary-chip-row">
                  {parsed.destinations.map((destination) => (
                    <span key={destination} className="import-itinerary-chip">
                      {destination}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="empty-state">No destinations were extracted.</p>
              )}
            </article>

            <article className="import-itinerary-panel">
              <p className="eyebrow">Parse Warnings</p>
              {reviewWarnings.length > 0 ? (
                <ul className="import-itinerary-warning-list">
                  {reviewWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">No parse warnings.</p>
              )}
            </article>
          </div>

          {activeUnresolved.length > 0 ? (
            <div className="import-itinerary-warning-banner">
              Unresolved items still remain. You can create the quote draft now, but unresolved items are not included unless you assign them.
            </div>
          ) : null}

          {sortedDays.length > 0 ? (
          <div className="import-itinerary-day-list">
            {sortedDays.map((day) => {
              const dayItems = parsed.items.filter((item) => item.dayNumber === day.dayNumber);

              return (
                <article key={day.dayNumber} className="import-itinerary-day-card">
                  <div className="import-itinerary-day-head">
                    <div>
                      <p className="eyebrow">Day {day.dayNumber}</p>
                      <h3>{day.title}</h3>
                      {day.summary ? <p>{day.summary}</p> : null}
                    </div>
                    {day.destination ? <span className="import-itinerary-chip">{day.destination}</span> : null}
                  </div>

                  {ITEM_TYPES.map((type) => {
                    const itemsByType = dayItems.filter((item) => item.type === type);
                    if (itemsByType.length === 0) {
                      return null;
                    }

                    return (
                      <section key={`${day.dayNumber}-${type}`} className="import-itinerary-type-group">
                        <div className="import-itinerary-type-head">
                          <h4>{ITEM_TYPE_LABELS[type]}</h4>
                          <span>{itemsByType.length}</span>
                        </div>

                        <div className="import-itinerary-item-list">
                          {itemsByType.map((item) => (
                            <article key={item.id} className="import-itinerary-item-card">
                              <div className="form-row form-row-3">
                                <label>
                                  Title
                                  <input value={item.title} onChange={(event) => updateItem(item.id, { title: event.target.value })} />
                                </label>

                                <label>
                                  Type
                                  <select value={item.type} onChange={(event) => updateItem(item.id, { type: event.target.value as ParsedItemType })}>
                                    {ITEM_TYPES.map((itemType) => (
                                      <option key={itemType} value={itemType}>
                                        {ITEM_TYPE_LABELS[itemType]}
                                      </option>
                                    ))}
                                  </select>
                                </label>

                                <label>
                                  Day
                                  <select
                                    value={item.dayNumber || day.dayNumber}
                                    onChange={(event) => updateItem(item.id, { dayNumber: Number(event.target.value) || day.dayNumber })}
                                  >
                                    {dayNumbers.map((dayNumber) => (
                                      <option key={dayNumber} value={dayNumber}>
                                        Day {dayNumber}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              </div>

                              {(item.description || item.sourceText || formatItemMeta(item) || item.needsReview) ? (
                                <div className="import-itinerary-item-meta">
                                  {formatItemMeta(item) ? <p>{formatItemMeta(item)}</p> : null}
                                  {item.description ? <p>{item.description}</p> : null}
                                  {!item.description && item.sourceText ? <p>{item.sourceText}</p> : null}
                                  {item.needsReview ? <span className="import-itinerary-review-flag">Needs review</span> : null}
                                </div>
                              ) : null}
                            </article>
                          ))}
                        </div>
                      </section>
                    );
                  })}

                  {dayItems.length === 0 ? <p className="empty-state">No items assigned to this day.</p> : null}
                </article>
              );
            })}
          </div>
          ) : (
            <article className="import-itinerary-panel">
              <p className="eyebrow">Day Review</p>
              <h3>No days extracted</h3>
              <p className="empty-state">
                No valid day blocks were extracted from the source text yet. Review warnings and unresolved items below, then re-run extraction or recover items manually.
              </p>
            </article>
          )}

          <article className="import-itinerary-panel">
            <div className="import-itinerary-section-head">
              <div>
                <p className="eyebrow">Unresolved Items</p>
                <h3>Needs manual review</h3>
              </div>
              <span className="workspace-sidebar-note">
                {activeUnresolved.length} active unresolved item{activeUnresolved.length === 1 ? '' : 's'}
              </span>
            </div>

            {activeUnresolved.length === 0 ? (
              <p className="empty-state">No unresolved items remain.</p>
            ) : (
              <div className="import-itinerary-unresolved-list">
                {activeUnresolved.map((item) => {
                  const resolution = unresolvedResolution[item.id] || {
                    dayNumber: assignmentDayNumbers[0] || 1,
                    type: item.suggestedType || 'other',
                  };

                  return (
                    <article key={item.id} className="import-itinerary-item-card">
                      <div className="import-itinerary-unresolved-copy">
                        <strong>{item.text}</strong>
                        <p>
                          Confidence: {item.confidence}
                          {item.reason ? ` | ${item.reason}` : ''}
                        </p>
                      </div>

                      <div className="form-row form-row-3">
                        <label>
                          Assign to day
                          <select
                            value={resolution.dayNumber}
                            onChange={(event) => updateUnresolvedResolution(item.id, { dayNumber: Number(event.target.value) || 1 })}
                          >
                            {assignmentDayNumbers.map((dayNumber) => (
                              <option key={dayNumber} value={dayNumber}>
                                Day {dayNumber}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label>
                          Choose type
                          <select
                            value={resolution.type}
                            onChange={(event) => updateUnresolvedResolution(item.id, { type: event.target.value as ParsedItemType })}
                          >
                            {ITEM_TYPES.map((itemType) => (
                              <option key={itemType} value={itemType}>
                                {ITEM_TYPE_LABELS[itemType]}
                              </option>
                            ))}
                          </select>
                        </label>

                        <div className="import-itinerary-inline-actions">
                          <button type="button" className="secondary-button" onClick={() => assignUnresolvedItem(item.id)}>
                            Assign
                          </button>
                          <button type="button" className="secondary-button" onClick={() => ignoreUnresolvedItem(item.id)}>
                            Ignore
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </article>

          <article className="import-itinerary-panel">
            <p className="eyebrow">Original Source Text</p>
            <pre className="import-itinerary-source-text">{parsed.sourceText || rawText}</pre>
          </article>

          <p className="form-helper">Nothing on this screen is persisted until you create a quote draft from this reviewed result.</p>
        </section>
      ) : null}
    </div>
  );
}
