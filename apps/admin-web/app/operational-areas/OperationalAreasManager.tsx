'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

// Operational Areas Catalog v1 — admin manager component for the
// canonical dictionary of operational movement endpoints. Supports:
//   - inline add (with type / region / default-flag controls)
//   - inline edit (any field; duplicate-code blocked server-side)
//   - deactivate (soft — preserves historical references)
//   - free-text search + type filter

type OperationalArea = {
  id: string;
  code: string;
  name: string;
  type: string;
  city: string;
  region: string | null;
  country: string;
  isActive: boolean;
  airportRouteFlagDefault: boolean;
  borderCrossingFlagDefault: boolean;
  mountainRoadFlagDefault: boolean;
  overnightRiskDefault: boolean;
  // Preferred Operational Area Logic — lower wins when multiple areas
  // share a city + type. NULL = lowest priority.
  priority: number | null;
};

const AREA_TYPES = [
  'CITY',
  'AIRPORT',
  'BORDER',
  'HOTEL_ZONE',
  'TOURISM_SITE',
  'CAMP_AREA',
  'PORT',
  'RESORT_AREA',
] as const;

type FormState = {
  code: string;
  name: string;
  type: string;
  city: string;
  region: string;
  country: string;
  airportRouteFlagDefault: boolean;
  borderCrossingFlagDefault: boolean;
  mountainRoadFlagDefault: boolean;
  overnightRiskDefault: boolean;
  // String here so the input can be blank — converted to int / null
  // before sending to the API.
  priority: string;
};

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  type: 'CITY',
  city: '',
  region: '',
  country: 'Jordan',
  airportRouteFlagDefault: false,
  borderCrossingFlagDefault: false,
  mountainRoadFlagDefault: false,
  overnightRiskDefault: false,
  priority: '',
};

type PreviewResponse = {
  suggestedCode: string;
  // The code the backend actually validated. Equals form.code when the
  // operator manually edited; equals suggestedCode otherwise. Drives
  // the chip + alternatives + reason text.
  checkedCode?: string;
  usingManualCode?: boolean;
  alternatives: string[];
  existingMatch: { id: string; code: string; name: string; type: string; city: string; isActive: boolean } | null;
  similarMatch: { id: string; code: string; name: string; type: string; city: string } | null;
  confidence: 'unique' | 'similar_exists' | 'duplicate' | 'empty';
  reason: string;
};

export function OperationalAreasManager({ initialAreas }: { initialAreas: OperationalArea[] }) {
  const router = useRouter();
  const [areas, setAreas] = useState<OperationalArea[]>(initialAreas);
  const [filterType, setFilterType] = useState<string>('');
  const [search, setSearch] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Auto-Code Generation v1 — live preview + confidence state. The
  // `codeManuallyEdited` flag stops auto-generation once the operator
  // types into the Code field directly; clearing the field re-enables
  // auto-generation (so they can switch back without losing their
  // place).
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(false);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced preview-code call.
  //
  // Two validation modes the backend supports:
  //   - manualCode mode (when operator typed into the Code field OR
  //     adopted an alternative): backend checks the operator's EXACT
  //     code for duplicates. The chip / reason / alternatives describe
  //     THAT code's situation. This is the fix for "operator types AQS
  //     and gets warned about AQJ" — AQS is what they'll save, so AQS
  //     is what we validate.
  //   - auto mode (operator hasn't touched the Code field): backend
  //     generates a code from the name and validates that. UI auto-
  //     fills the Code field with the suggestion.
  //
  // Fires on name / type / code / editingId / manuallyEdited changes.
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    if (!form.name.trim()) {
      setPreview(null);
      return;
    }
    previewTimer.current = setTimeout(async () => {
      setPreviewing(true);
      try {
        const response = await fetch('/api/operational-areas/preview-code', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.name,
            type: form.type,
            excludeId: editingId || undefined,
            // Send the operator's current code value when they've
            // manually edited it OR when they've adopted an alternative
            // (in which case form.code differs from the auto-generated
            // suggestion). Backend validates THIS code, not the auto-
            // generated one.
            manualCode: codeManuallyEdited ? form.code : undefined,
          }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          setPreview(null);
          return;
        }
        const result = payload as PreviewResponse;
        setPreview(result);
        // Auto-fill the Code field with the suggestion unless the
        // operator has manually edited it.
        if (!codeManuallyEdited && result.suggestedCode) {
          setForm((f) => (f.code !== result.suggestedCode ? { ...f, code: result.suggestedCode } : f));
        }
      } catch {
        setPreview(null);
      } finally {
        setPreviewing(false);
      }
    }, 250);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [form.name, form.type, form.code, editingId, codeManuallyEdited]);

  // Apply default-flag suggestions from the area type — operator can
  // still override per row. We only set flags when not editing (avoid
  // clobbering operator-tuned values).
  useEffect(() => {
    if (editingId) return;
    if (form.type === 'AIRPORT') {
      setForm((f) => ({ ...f, airportRouteFlagDefault: true }));
    } else if (form.type === 'BORDER') {
      setForm((f) => ({ ...f, borderCrossingFlagDefault: true }));
    }
  }, [form.type, editingId]);

  const visibleAreas = useMemo(() => {
    const term = search.trim().toLowerCase();
    return areas.filter((a) => {
      if (!showInactive && !a.isActive) return false;
      if (filterType && a.type !== filterType) return false;
      if (term) {
        const haystack = `${a.code} ${a.name} ${a.city} ${a.region || ''}`.toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [areas, filterType, search, showInactive]);

  async function refresh() {
    try {
      const response = await fetch('/api/operational-areas', { cache: 'no-store' });
      const payload = await response.json();
      if (response.ok) setAreas(payload as OperationalArea[]);
    } catch {
      // ignore — page-level refresh below kicks the server reload anyway
    }
  }

  async function submitForm(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const url = editingId ? `/api/operational-areas/${editingId}` : '/api/operational-areas';
      const method = editingId ? 'PATCH' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          region: form.region || null,
          // Priority is an int? on the API. Blank input = NULL (lowest
          // priority, falls back to PREFERRED_TYPE_ORDER + alphabetical).
          priority: form.priority.trim() === '' ? null : Number(form.priority),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `${editingId ? 'Update' : 'Create'} failed (${response.status})`);
      setSuccess(`${editingId ? 'Updated' : 'Created'} ${payload.code}.`);
      setForm(EMPTY_FORM);
      setEditingId(null);
      setCodeManuallyEdited(false);
      setPreview(null);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  }

  async function deactivate(area: OperationalArea) {
    if (!area.isActive) return;
    if (!confirm(`Deactivate ${area.code} — ${area.name}? Existing Route Standards referencing this area continue to work; new Route Builder pickers will hide it.`)) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/operational-areas/${area.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`Deactivate failed (${response.status})`);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Deactivate failed');
    } finally {
      setBusy(false);
    }
  }

  async function reactivate(area: OperationalArea) {
    if (area.isActive) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/operational-areas/${area.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      });
      if (!response.ok) throw new Error(`Reactivate failed (${response.status})`);
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reactivate failed');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(area: OperationalArea) {
    setEditingId(area.id);
    setForm({
      code: area.code,
      name: area.name,
      type: area.type,
      city: area.city,
      region: area.region || '',
      country: area.country,
      airportRouteFlagDefault: area.airportRouteFlagDefault,
      borderCrossingFlagDefault: area.borderCrossingFlagDefault,
      mountainRoadFlagDefault: area.mountainRoadFlagDefault,
      overnightRiskDefault: area.overnightRiskDefault,
      priority: area.priority != null ? String(area.priority) : '',
    });
    // Edit mode starts with the existing code treated as "manually set"
    // so the preview doesn't immediately rewrite it from the name. The
    // operator can hit ↻ Use suggested to switch back.
    setCodeManuallyEdited(true);
    setPreview(null);
    setSuccess(null);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCodeManuallyEdited(false);
    setPreview(null);
  }

  return (
    <>
      {/* Add / edit form */}
      <section
        style={{
          background: '#ffffff',
          border: '1px solid var(--ds-color-border-subtle, #E4E7EC)',
          borderRadius: 10,
          padding: '1rem',
          marginBottom: '1rem',
        }}
      >
        <h2 style={{ marginTop: 0 }}>{editingId ? 'Edit operational area' : 'Add operational area'}</h2>
        <p style={{ color: 'var(--ds-color-text-subtle, #667085)', marginTop: 0, fontSize: '0.85rem' }}>
          Codes must be unique. UPPER_SNAKE_CASE is enforced server-side. Default flags
          are smart starting values the Route Builder pre-applies when this area is on
          either side of a route — operators can always override per row.
        </p>
        <form onSubmit={submitForm} style={{ display: 'grid', gap: '0.75rem' }}>
          {/* Name FIRST — the live preview generates the Code from it.
              Operators think in place names; ERP generates the canonical
              identity. */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <FieldText
              label="Name *"
              value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="Amman City"
              required
            />
            <CodeFieldWithPreview
              value={form.code}
              onChange={(v) => {
                setCodeManuallyEdited(true);
                setForm((f) => ({ ...f, code: v }));
              }}
              onReset={() => {
                setCodeManuallyEdited(false);
                if (preview?.suggestedCode) {
                  setForm((f) => ({ ...f, code: preview.suggestedCode }));
                }
              }}
              preview={preview}
              previewing={previewing}
              manuallyEdited={codeManuallyEdited}
              onAdoptAlternative={(alt) => {
                setForm((f) => ({ ...f, code: alt }));
                setCodeManuallyEdited(true);
              }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>Type *</span>
              <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))} required>
                {AREA_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, ' ')}
                  </option>
                ))}
              </select>
            </div>
            <FieldText
              label="City *"
              value={form.city}
              onChange={(v) => setForm((f) => ({ ...f, city: v }))}
              placeholder="Amman"
              required
            />
            <FieldText
              label="Region"
              value={form.region}
              onChange={(v) => setForm((f) => ({ ...f, region: v }))}
              placeholder="Central / North / South / …"
            />
            <FieldText
              label="Country"
              value={form.country}
              onChange={(v) => setForm((f) => ({ ...f, country: v }))}
              placeholder="Jordan"
            />
            {/* Preferred Operational Area Logic — lower wins when
                multiple areas share the same city + type (e.g. QAIA=1
                beats Marka=2 for AIRPORT/Amman). Blank = lowest. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>
                Priority
              </span>
              <input
                type="number"
                min={1}
                step={1}
                value={form.priority}
                placeholder="e.g. 1"
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                title="Lower number wins when multiple areas share the same city + type. Leave blank for default (lowest priority)."
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--ds-color-text-subtle, #667085)', lineHeight: 1.35 }}>
                Lower wins when multiple areas share a city + type.
                Blank = lowest. e.g. QAIA = 1 beats Marka = 2.
              </span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.5rem' }}>
            <FlagCard
              label="Airport route default"
              helper="Auto-applies airportRouteFlag when this area is on either side"
              checked={form.airportRouteFlagDefault}
              onChange={(v) => setForm((f) => ({ ...f, airportRouteFlagDefault: v }))}
            />
            <FlagCard
              label="Border crossing default"
              helper="Auto-applies borderCrossingFlag (1–3 h wait risk)"
              checked={form.borderCrossingFlagDefault}
              onChange={(v) => setForm((f) => ({ ...f, borderCrossingFlagDefault: v }))}
            />
            <FlagCard
              label="Mountain road default"
              helper="Weather-sensitive, slower in winter"
              checked={form.mountainRoadFlagDefault}
              onChange={(v) => setForm((f) => ({ ...f, mountainRoadFlagDefault: v }))}
            />
            <FlagCard
              label="Overnight risk default"
              helper="Day may roll over if departure pushed late"
              checked={form.overnightRiskDefault}
              onChange={(v) => setForm((f) => ({ ...f, overnightRiskDefault: v }))}
            />
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          {success ? (
            <p
              style={{
                background: 'var(--ds-color-success-surface, #ECFDF3)',
                color: 'var(--ds-color-success, #067647)',
                border: '1px solid var(--ds-color-success-border, #ABEFC6)',
                borderRadius: 6,
                padding: '0.5rem 0.7rem',
                fontSize: '0.88rem',
                margin: 0,
              }}
            >
              {success}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              type="submit"
              className="primary-button"
              disabled={busy || preview?.confidence === 'duplicate'}
              title={
                preview?.confidence === 'duplicate'
                  ? 'Code is a duplicate — pick an alternative or rename before saving.'
                  : undefined
              }
            >
              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Add area'}
            </button>
            {editingId ? (
              <button type="button" className="secondary-button" onClick={cancelEdit} disabled={busy}>
                Cancel edit
              </button>
            ) : null}
            {preview?.confidence === 'duplicate' ? (
              <span style={{ color: '#7c2d12', fontSize: '0.78rem' }}>
                Save blocked — duplicate code. Pick an alternative above or rename.
              </span>
            ) : null}
          </div>
        </form>
      </section>

      {/* Filters */}
      <section
        style={{
          background: '#f7f9fb',
          border: '1px solid #d8e0eb',
          borderRadius: 10,
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          display: 'flex',
          gap: '0.75rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code / name / city / region"
          style={{ flex: 1, minWidth: 220 }}
        />
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="">All types</option>
          {AREA_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </section>

      {/* Table */}
      <section style={{ background: '#ffffff', border: '1px solid var(--ds-color-border-subtle, #E4E7EC)', borderRadius: 10, padding: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>
          {visibleAreas.length} of {areas.length} areas
        </h2>
        {visibleAreas.length === 0 ? (
          <p style={{ color: 'var(--ds-color-text-subtle, #667085)' }}>No matches. Try adjusting the filters or clearing the search.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: 'var(--ds-color-surface-soft, #F9FAFB)', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--ds-color-border-subtle, #E4E7EC)' }}>Code</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--ds-color-border-subtle, #E4E7EC)' }}>Name</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--ds-color-border-subtle, #E4E7EC)' }}>Type</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--ds-color-border-subtle, #E4E7EC)' }}>City</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--ds-color-border-subtle, #E4E7EC)' }}>Region</th>
                  <th
                    style={{ padding: '0.5rem', borderBottom: '1px solid var(--ds-color-border-subtle, #E4E7EC)' }}
                    title="Preferred Operational Area — lower wins on ties"
                  >
                    Priority
                  </th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--ds-color-border-subtle, #E4E7EC)' }}>Defaults</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--ds-color-border-subtle, #E4E7EC)' }}>Active</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid var(--ds-color-border-subtle, #E4E7EC)' }}></th>
                </tr>
              </thead>
              <tbody>
                {visibleAreas.map((a) => {
                  const flags: string[] = [];
                  if (a.airportRouteFlagDefault) flags.push('airport');
                  if (a.borderCrossingFlagDefault) flags.push('border');
                  if (a.mountainRoadFlagDefault) flags.push('mountain');
                  if (a.overnightRiskDefault) flags.push('overnight');
                  return (
                    <tr key={a.id} style={{ borderBottom: '1px solid var(--ds-color-surface-soft, #F9FAFB)' }}>
                      <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>
                        <strong>{a.code}</strong>
                      </td>
                      <td style={{ padding: '0.5rem' }}>{a.name}</td>
                      <td style={{ padding: '0.5rem', color: 'var(--ds-color-text-muted, #475569)' }}>{a.type.replace(/_/g, ' ')}</td>
                      <td style={{ padding: '0.5rem' }}>{a.city}</td>
                      <td style={{ padding: '0.5rem', color: 'var(--ds-color-text-muted, #475569)' }}>{a.region || <em style={{ color: 'var(--ds-color-text-faint, #94A3B8)' }}>—</em>}</td>
                      <td style={{ padding: '0.5rem', color: 'var(--ds-color-text-muted, #475569)', textAlign: 'center', fontFamily: 'monospace' }}>
                        {a.priority != null ? a.priority : <em style={{ color: 'var(--ds-color-text-faint, #94A3B8)' }}>—</em>}
                      </td>
                      <td style={{ padding: '0.5rem', color: 'var(--ds-color-text-muted, #475569)', fontSize: '0.78rem' }}>
                        {flags.length > 0 ? flags.join(' · ') : <em style={{ color: 'var(--ds-color-text-faint, #94A3B8)' }}>—</em>}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <span
                          style={{
                            background: a.isActive ? 'var(--ds-color-success-surface, #ECFDF3)' : 'var(--ds-color-surface-soft, #F9FAFB)',
                            color: a.isActive ? 'var(--ds-color-success, #067647)' : 'var(--ds-color-text-muted, #475569)',
                            padding: '0.1rem 0.5rem',
                            borderRadius: 999,
                            fontSize: '0.72rem',
                            fontWeight: 600,
                          }}
                        >
                          {a.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <div style={{ display: 'flex', gap: '0.3rem' }}>
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => startEdit(a)}
                            style={{ fontSize: '0.78rem' }}
                          >
                            Edit
                          </button>
                          {a.isActive ? (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => deactivate(a)}
                              style={{ fontSize: '0.78rem', color: '#a85454' }}
                              disabled={busy}
                            >
                              Deactivate
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => reactivate(a)}
                              style={{ fontSize: '0.78rem' }}
                              disabled={busy}
                            >
                              Reactivate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

function CodeFieldWithPreview({
  value,
  onChange,
  onReset,
  preview,
  previewing,
  manuallyEdited,
  onAdoptAlternative,
}: {
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
  preview: PreviewResponse | null;
  previewing: boolean;
  manuallyEdited: boolean;
  onAdoptAlternative: (alt: string) => void;
}) {
  // Diverged = operator's current Code differs from the auto-generated
  // suggestion (either manually typed or alternative-chip adopted). The
  // ↻ "Use suggested" link only makes sense when diverged.
  const suggestion = preview?.suggestedCode || '';
  const diverged = Boolean(suggestion && suggestion !== value);
  // Color-coded confidence chip + alternative chips. Operator workflow:
  //   1. Type the Name. Code auto-fills with the ERP suggestion.
  //   2. If chip is green → save normally.
  //   3. If chip is red (duplicate) → click an alternative chip OR
  //      manually rename the Code. Either way, save is blocked while
  //      the chip is red.
  //   4. If they want full manual control, they can type into the Code
  //      field directly — auto-fill stops until they hit the ↻ reset.
  const confidence = preview?.confidence || (previewing ? 'pending' : 'empty');
  const chipMeta = (() => {
    switch (confidence) {
      case 'unique':
        return { color: '#067647', bg: '#ecfdf3', border: '#abefc6', dot: '🟢', label: 'Unique & safe' };
      case 'similar_exists':
        return { color: '#8b5e34', bg: '#fef3c7', border: '#fcd34d', dot: '🟡', label: 'Similar area exists' };
      case 'duplicate':
        return { color: '#7c2d12', bg: '#fee2e2', border: '#fca5a5', dot: '🔴', label: 'Duplicate code' };
      case 'pending':
        return { color: '#475467', bg: '#f9fafb', border: '#e4e7ec', dot: '…', label: 'Checking…' };
      default:
        return { color: '#98a2b3', bg: '#f9fafb', border: '#e4e7ec', dot: '', label: 'Type a name to preview' };
    }
  })();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>Code *</span>
        {diverged ? (
          <button
            type="button"
            onClick={onReset}
            style={{
              background: 'transparent',
              border: 'none',
              padding: 0,
              color: '#0c4a6e',
              fontSize: '0.72rem',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
            title={`Switch back to the auto-generated suggestion (${suggestion})`}
          >
            ↻ Use suggested ({suggestion})
          </button>
        ) : null}
      </div>
      <input
        required
        value={value}
        placeholder="Auto-generated from the name"
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
      />
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          marginTop: '0.15rem',
          background: chipMeta.bg,
          border: `1px solid ${chipMeta.border}`,
          color: chipMeta.color,
          borderRadius: 999,
          padding: '0.1rem 0.55rem',
          fontSize: '0.72rem',
          fontWeight: 600,
          width: 'fit-content',
        }}
      >
        <span>{chipMeta.dot}</span>
        <span>{chipMeta.label}</span>
      </div>
      {preview?.reason && preview.confidence !== 'unique' && preview.confidence !== 'empty' ? (
        <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--ds-color-text-muted, #475569)', lineHeight: 1.35 }}>
          {preview.reason}
        </p>
      ) : null}
      {preview && preview.alternatives.length > 0 ? (
        <div style={{ marginTop: '0.3rem', display: 'flex', gap: '0.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--ds-color-text-muted, #475569)' }}>Try:</span>
          {preview.alternatives.map((alt) => (
            <button
              key={alt}
              type="button"
              onClick={() => onAdoptAlternative(alt)}
              style={{
                background: '#fff',
                border: '1px solid #d0d5dd',
                color: '#0c4a6e',
                padding: '0.1rem 0.55rem',
                borderRadius: 999,
                fontSize: '0.72rem',
                fontFamily: 'monospace',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {alt}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FieldText({
  label,
  value,
  onChange,
  placeholder,
  required,
  monospace,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  monospace?: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--ds-color-text-muted, #475569)' }}>{label}</span>
      <input
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={monospace ? { fontFamily: 'monospace' } : undefined}
      />
    </div>
  );
}

function FlagCard({
  label,
  helper,
  checked,
  onChange,
}: {
  label: string;
  helper: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  // Same defensive div-based card pattern that fixed the Route Standard
  // editor cascade bug. Wrapping <label> in form shells gets overridden
  // by globals.css to display:grid — using <div> with onClick keeps
  // the layout stable.
  return (
    <div
      onClick={() => onChange(!checked)}
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onChange(!checked);
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        padding: '0.55rem 0.7rem',
        border: '1px solid var(--ds-color-border-subtle, #E4E7EC)',
        borderRadius: 8,
        background: '#fff',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        style={{ width: 18, height: 18, marginTop: '0.15rem', flexShrink: 0 }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ds-color-text, #0F172A)', lineHeight: 1.3 }}>{label}</div>
        <div style={{ fontSize: '0.76rem', color: 'var(--ds-color-text-subtle, #667085)', lineHeight: 1.35, marginTop: '0.1rem' }}>{helper}</div>
      </div>
    </div>
  );
}
