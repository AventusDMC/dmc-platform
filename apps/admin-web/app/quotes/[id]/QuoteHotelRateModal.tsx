'use client';

import { useMemo, useState } from 'react';

type RoomCategoryOption = {
  id: string;
  name: string;
  code: string | null;
};

export type QuoteHotelRateDraftRow = {
  id: string;
  roomCategoryId: string;
  mealPlan: 'BB' | 'HB' | 'FB';
  occupancyType: 'SGL' | 'DBL' | 'TPL';
  cost: string;
  sell: string;
  notes: string;
};

type QuoteHotelRateModalProps = {
  hotelName: string;
  dayContextLabel: string;
  roomCategoryOptions: RoomCategoryOption[];
  initialRows: QuoteHotelRateDraftRow[];
  initialSelectedRowId: string | null;
  onClose: () => void;
  onSave: (row: QuoteHotelRateDraftRow, intent: 'save' | 'save-and-add') => void;
};

function createDraftRow(partial?: Partial<QuoteHotelRateDraftRow>): QuoteHotelRateDraftRow {
  return {
    id: `hotel-rate-${Math.random().toString(36).slice(2, 9)}`,
    roomCategoryId: partial?.roomCategoryId || '',
    mealPlan: partial?.mealPlan || 'BB',
    occupancyType: partial?.occupancyType || 'DBL',
    cost: partial?.cost || '',
    sell: partial?.sell || '',
    notes: partial?.notes || '',
  };
}

function countMissingFields(row: QuoteHotelRateDraftRow) {
  let count = 0;

  if (!row.roomCategoryId) {
    count += 1;
  }

  if (!row.mealPlan) {
    count += 1;
  }

  if (!row.occupancyType) {
    count += 1;
  }

  if (!row.cost.trim() || Number(row.cost) <= 0) {
    count += 1;
  }

  if (!row.sell.trim() || Number(row.sell) <= 0) {
    count += 1;
  }

  return count;
}

function isRowReady(row: QuoteHotelRateDraftRow) {
  return countMissingFields(row) === 0;
}

function formatMoney(value: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 'Pricing to be confirmed';
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function QuoteHotelRateModal({
  hotelName,
  dayContextLabel,
  roomCategoryOptions,
  initialRows,
  initialSelectedRowId,
  onClose,
  onSave,
}: QuoteHotelRateModalProps) {
  const fallbackRow = useMemo(() => createDraftRow(), []);
  const [rows, setRows] = useState<QuoteHotelRateDraftRow[]>(initialRows.length > 0 ? initialRows : [fallbackRow]);
  const [selectedRowId, setSelectedRowId] = useState<string>(
    initialSelectedRowId || initialRows[0]?.id || fallbackRow.id,
  );

  const selectedRow = rows.find((row) => row.id === selectedRowId) || rows[0] || null;
  const totalMissingFields = useMemo(() => rows.reduce((sum, row) => sum + countMissingFields(row), 0), [rows]);
  const pricingReady = selectedRow ? isRowReady(selectedRow) : false;

  function updateRow(rowId: string, patch: Partial<QuoteHotelRateDraftRow>) {
    setRows((current) => current.map((row) => (row.id === rowId ? { ...row, ...patch } : row)));
  }

  function addRow(copyFromId?: string) {
    const source = copyFromId ? rows.find((row) => row.id === copyFromId) : null;
    const nextRow = createDraftRow(source ? { ...source, notes: '' } : undefined);
    setRows((current) => [...current, nextRow]);
    setSelectedRowId(nextRow.id);
  }

  function removeRow(rowId: string) {
    setRows((current) => {
      const nextRows = current.filter((row) => row.id !== rowId);
      if (nextRows.length > 0 && selectedRowId === rowId) {
        setSelectedRowId(nextRows[0].id);
      }
      return nextRows.length > 0 ? nextRows : [createDraftRow()];
    });
  }

  function handleSave(intent: 'save' | 'save-and-add') {
    if (!selectedRow || !isRowReady(selectedRow)) {
      return;
    }

    onSave(selectedRow, intent);
  }

  return (
    <div className="quote-client-modal-backdrop">
      <div className="detail-card quote-client-modal-card quote-hotel-rate-modal">
        <div className="quote-hotel-rate-modal-head">
          <div>
            <p className="eyebrow">Hotel Rate Entry</p>
            <h2 className="section-title">Set hotel pricing without leaving the quote</h2>
            <p className="detail-copy">
              <strong>{hotelName || 'Selected hotel'}</strong>
              {dayContextLabel ? ` · ${dayContextLabel}` : ''}
            </p>
          </div>
          <div className="quote-preview-total-list quote-hotel-rate-summary">
            <div>
              <span>Rows</span>
              <strong>{rows.length}</strong>
            </div>
            <div>
              <span>Missing fields</span>
              <strong>{totalMissingFields}</strong>
            </div>
            <div>
              <span>Status</span>
              <strong>{pricingReady ? 'Pricing Ready' : 'Not Ready'}</strong>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <table className="data-table quote-hotel-rate-table">
            <thead>
              <tr>
                <th>Use</th>
                <th>Room type</th>
                <th>Board basis</th>
                <th>Occupancy</th>
                <th>Cost</th>
                <th>Sell</th>
                <th>Notes</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const missingFields = countMissingFields(row);
                return (
                  <tr key={row.id}>
                    <td>
                      <input
                        type="radio"
                        name="quote-hotel-rate-row"
                        checked={selectedRowId === row.id}
                        onChange={() => setSelectedRowId(row.id)}
                        aria-label={`Use hotel rate row ${index + 1}`}
                      />
                    </td>
                    <td>
                      <select value={row.roomCategoryId} onChange={(event) => updateRow(row.id, { roomCategoryId: event.target.value })}>
                        <option value="">Select room type</option>
                        {roomCategoryOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                            {option.code ? ` (${option.code})` : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <select value={row.mealPlan} onChange={(event) => updateRow(row.id, { mealPlan: event.target.value as 'BB' | 'HB' | 'FB' })}>
                        <option value="BB">BB</option>
                        <option value="HB">HB</option>
                        <option value="FB">FB</option>
                      </select>
                    </td>
                    <td>
                      <select
                        value={row.occupancyType}
                        onChange={(event) => updateRow(row.id, { occupancyType: event.target.value as 'SGL' | 'DBL' | 'TPL' })}
                      >
                        <option value="SGL">SGL</option>
                        <option value="DBL">DBL</option>
                        <option value="TPL">TPL</option>
                      </select>
                    </td>
                    <td>
                      <input
                        value={row.cost}
                        onChange={(event) => updateRow(row.id, { cost: event.target.value })}
                        type="number"
                        min="0"
                        step="0.01"
                      />
                    </td>
                    <td>
                      <input
                        value={row.sell}
                        onChange={(event) => updateRow(row.id, { sell: event.target.value })}
                        type="number"
                        min="0"
                        step="0.01"
                      />
                    </td>
                    <td>
                      <input value={row.notes} onChange={(event) => updateRow(row.id, { notes: event.target.value })} placeholder="Optional note" />
                    </td>
                    <td>
                      <div className="quote-hotel-rate-row-actions">
                        <button type="button" className="secondary-button" onClick={() => addRow(row.id)}>
                          Copy
                        </button>
                        <button type="button" className="secondary-button" onClick={() => removeRow(row.id)} disabled={rows.length === 1}>
                          Remove
                        </button>
                        <div className="table-subcopy">{missingFields === 0 ? 'Ready' : `${missingFields} missing`}</div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="quote-hotel-rate-preview">
          <div>
            <p className="eyebrow">Selected row</p>
            <h3>{selectedRow ? 'Apply this hotel rate to the quote item' : 'Choose a row'}</h3>
          </div>
          <div className="quote-preview-total-list">
            <div>
              <span>Cost</span>
              <strong>{selectedRow ? formatMoney(selectedRow.cost) : 'Pricing to be confirmed'}</strong>
            </div>
            <div>
              <span>Sell</span>
              <strong>{selectedRow ? formatMoney(selectedRow.sell) : 'Pricing to be confirmed'}</strong>
            </div>
            <div>
              <span>Notes</span>
              <strong>{selectedRow?.notes || 'No notes'}</strong>
            </div>
          </div>
        </div>

        <div className="table-action-row quote-client-modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="secondary-button" onClick={() => addRow()}>
            Add row
          </button>
          <button type="button" className="secondary-button" onClick={() => handleSave('save')} disabled={!pricingReady}>
            Save
          </button>
          <button type="button" className="primary-button" onClick={() => handleSave('save-and-add')} disabled={!pricingReady}>
            Save &amp; Add to Day
          </button>
        </div>
      </div>
    </div>
  );
}
