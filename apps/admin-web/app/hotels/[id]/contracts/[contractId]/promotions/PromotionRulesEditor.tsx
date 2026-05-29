'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Hotels Engine — promotion applicability-rules editor (client).
//
// Lets a promotion carry ANY number of applicability rules (room / board
// / travel window / booking window / min-stay). The backend replaces a
// promotion's whole rule set on update and PRESERVES the core fields when
// `rules` is omitted — so this PATCHes only `{ rules }`, independent of
// the core edit form on the page.

type Room = { id: string; name: string; code: string | null };
type RuleRow = {
  roomCategoryId: string;
  boardBasis: string;
  travelDateFrom: string;
  travelDateTo: string;
  bookingDateFrom: string;
  bookingDateTo: string;
  minStay: string;
  isActive: boolean;
};
type ServerRule = {
  roomCategoryId: string | null;
  boardBasis: string | null;
  travelDateFrom: string | null;
  travelDateTo: string | null;
  bookingDateFrom: string | null;
  bookingDateTo: string | null;
  minStay: number | null;
  isActive: boolean;
};

const BOARDS = ['RO', 'BB', 'HB', 'FB', 'AI'];
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const toIso = (d: string) => (d ? new Date(`${d}T12:00:00.000Z`).toISOString() : undefined);

function fromServer(r: ServerRule): RuleRow {
  return {
    roomCategoryId: r.roomCategoryId ?? '',
    boardBasis: r.boardBasis ?? '',
    travelDateFrom: toDateInput(r.travelDateFrom),
    travelDateTo: toDateInput(r.travelDateTo),
    bookingDateFrom: toDateInput(r.bookingDateFrom),
    bookingDateTo: toDateInput(r.bookingDateTo),
    minStay: r.minStay != null ? String(r.minStay) : '',
    isActive: r.isActive,
  };
}

const emptyRule = (): RuleRow => ({
  roomCategoryId: '',
  boardBasis: '',
  travelDateFrom: '',
  travelDateTo: '',
  bookingDateFrom: '',
  bookingDateTo: '',
  minStay: '',
  isActive: true,
});

export function PromotionRulesEditor({
  promotionId,
  rooms,
  initialRules,
}: {
  promotionId: string;
  rooms: Room[];
  initialRules: ServerRule[];
}) {
  const router = useRouter();
  const [rules, setRules] = useState<RuleRow[]>(initialRules.map(fromServer));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function patch(i: number, change: Partial<RuleRow>) {
    setRules((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...change } : r)));
    setSaved(false);
  }

  async function onSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload = rules.map((r) => ({
        roomCategoryId: r.roomCategoryId || undefined,
        boardBasis: r.boardBasis || undefined,
        travelDateFrom: toIso(r.travelDateFrom),
        travelDateTo: toIso(r.travelDateTo),
        bookingDateFrom: toIso(r.bookingDateFrom),
        bookingDateTo: toIso(r.bookingDateTo),
        minStay: r.minStay ? Number(r.minStay) : undefined,
        isActive: r.isActive,
      }));
      const res = await fetch(`/api/promotions/${encodeURIComponent(promotionId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: payload }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Save failed: HTTP ${res.status} ${text.slice(0, 160)}`);
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: '0.8rem', borderTop: '1px solid #e2e8f0', paddingTop: '0.6rem' }}>
      <p className="table-subcopy" style={{ margin: '0 0 0.4rem', fontWeight: 650 }}>
        Applicability rules ({rules.length}) — blank = applies to the whole contract
      </p>
      {rules.map((r, i) => (
        <div
          key={i}
          style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.5rem', marginBottom: '0.5rem' }}
        >
          <div className="form-row form-row-4">
            <label>
              Room
              <select value={r.roomCategoryId} onChange={(e) => patch(i, { roomCategoryId: e.target.value })}>
                <option value="">All rooms</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.code ? `${room.name} (${room.code})` : room.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Board
              <select value={r.boardBasis} onChange={(e) => patch(i, { boardBasis: e.target.value })}>
                <option value="">Any</option>
                {BOARDS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Min stay
              <input type="number" min={1} step="1" value={r.minStay} onChange={(e) => patch(i, { minStay: e.target.value })} />
            </label>
            <label>
              Active
              <select value={r.isActive ? 'true' : 'false'} onChange={(e) => patch(i, { isActive: e.target.value === 'true' })}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          </div>
          <div className="form-row form-row-4">
            <label>
              Travel from
              <input type="date" value={r.travelDateFrom} onChange={(e) => patch(i, { travelDateFrom: e.target.value })} />
            </label>
            <label>
              Travel to
              <input type="date" value={r.travelDateTo} onChange={(e) => patch(i, { travelDateTo: e.target.value })} />
            </label>
            <label>
              Booking from
              <input type="date" value={r.bookingDateFrom} onChange={(e) => patch(i, { bookingDateFrom: e.target.value })} />
            </label>
            <label>
              Booking to
              <input type="date" value={r.bookingDateTo} onChange={(e) => patch(i, { bookingDateTo: e.target.value })} />
            </label>
          </div>
          <button
            type="button"
            className="compact-button"
            style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626', marginTop: '0.3rem' }}
            onClick={() => {
              setRules((prev) => prev.filter((_, idx) => idx !== i));
              setSaved(false);
            }}
          >
            Remove rule
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="compact-button" onClick={() => { setRules((p) => [...p, emptyRule()]); setSaved(false); }}>
          + Add rule
        </button>
        <button type="button" className="primary-button" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save rules'}
        </button>
        {saved ? <span style={{ color: '#16a34a', fontSize: '0.8rem' }}>Saved.</span> : null}
        {error ? <span style={{ color: '#b91c1c', fontSize: '0.8rem' }}>{error}</span> : null}
      </div>
    </div>
  );
}
