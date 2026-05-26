'use client';

import { useMemo, useState } from 'react';
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
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || `${editingId ? 'Update' : 'Create'} failed (${response.status})`);
      setSuccess(`${editingId ? 'Updated' : 'Created'} ${payload.code}.`);
      setForm(EMPTY_FORM);
      setEditingId(null);
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
    });
    setSuccess(null);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  return (
    <>
      {/* Add / edit form */}
      <section
        style={{
          background: '#ffffff',
          border: '1px solid #e4e7ec',
          borderRadius: 10,
          padding: '1rem',
          marginBottom: '1rem',
        }}
      >
        <h2 style={{ marginTop: 0 }}>{editingId ? 'Edit operational area' : 'Add operational area'}</h2>
        <p style={{ color: '#667085', marginTop: 0, fontSize: '0.85rem' }}>
          Codes must be unique. UPPER_SNAKE_CASE is enforced server-side. Default flags
          are smart starting values the Route Builder pre-applies when this area is on
          either side of a route — operators can always override per row.
        </p>
        <form onSubmit={submitForm} style={{ display: 'grid', gap: '0.75rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
            <FieldText
              label="Code *"
              value={form.code}
              onChange={(v) => setForm((f) => ({ ...f, code: v }))}
              placeholder="AMM"
              monospace
              required
            />
            <FieldText
              label="Name *"
              value={form.name}
              onChange={(v) => setForm((f) => ({ ...f, name: v }))}
              placeholder="Amman City"
              required
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>Type *</span>
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
                background: '#ecfdf3',
                color: '#067647',
                border: '1px solid #abefc6',
                borderRadius: 6,
                padding: '0.5rem 0.7rem',
                fontSize: '0.88rem',
                margin: 0,
              }}
            >
              {success}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" className="primary-button" disabled={busy}>
              {busy ? 'Saving…' : editingId ? 'Save changes' : 'Add area'}
            </button>
            {editingId ? (
              <button type="button" className="secondary-button" onClick={cancelEdit} disabled={busy}>
                Cancel edit
              </button>
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
      <section style={{ background: '#ffffff', border: '1px solid #e4e7ec', borderRadius: 10, padding: '1rem' }}>
        <h2 style={{ marginTop: 0 }}>
          {visibleAreas.length} of {areas.length} areas
        </h2>
        {visibleAreas.length === 0 ? (
          <p style={{ color: '#667085' }}>No matches. Try adjusting the filters or clearing the search.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>Code</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>Name</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>Type</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>City</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>Region</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>Defaults</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}>Active</th>
                  <th style={{ padding: '0.5rem', borderBottom: '1px solid #e4e7ec' }}></th>
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
                    <tr key={a.id} style={{ borderBottom: '1px solid #f2f4f7' }}>
                      <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>
                        <strong>{a.code}</strong>
                      </td>
                      <td style={{ padding: '0.5rem' }}>{a.name}</td>
                      <td style={{ padding: '0.5rem', color: '#475467' }}>{a.type.replace(/_/g, ' ')}</td>
                      <td style={{ padding: '0.5rem' }}>{a.city}</td>
                      <td style={{ padding: '0.5rem', color: '#475467' }}>{a.region || <em style={{ color: '#98a2b3' }}>—</em>}</td>
                      <td style={{ padding: '0.5rem', color: '#475467', fontSize: '0.78rem' }}>
                        {flags.length > 0 ? flags.join(' · ') : <em style={{ color: '#98a2b3' }}>—</em>}
                      </td>
                      <td style={{ padding: '0.5rem' }}>
                        <span
                          style={{
                            background: a.isActive ? '#ecfdf3' : '#f2f4f7',
                            color: a.isActive ? '#067647' : '#475467',
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
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475467' }}>{label}</span>
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
        border: '1px solid #e4e7ec',
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
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#101828', lineHeight: 1.3 }}>{label}</div>
        <div style={{ fontSize: '0.76rem', color: '#667085', lineHeight: 1.35, marginTop: '0.1rem' }}>{helper}</div>
      </div>
    </div>
  );
}
