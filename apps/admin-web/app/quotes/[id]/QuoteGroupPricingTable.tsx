'use client';

import { GroupPricingEditorRow, formatSlabLabel } from './group-pricing';

type QuoteGroupPricingTableProps = {
  rows: GroupPricingEditorRow[];
  validationErrors: string[];
  onUpdateRow: (clientId: string, field: keyof GroupPricingEditorRow, value: string) => void;
  onDuplicateRow: (clientId: string) => void;
  onDeleteRow: (clientId: string) => void;
  onAddRow: () => void;
  onAutoBuild: () => void;
};

export function QuoteGroupPricingTable({
  rows,
  validationErrors,
  onUpdateRow,
  onDuplicateRow,
  onDeleteRow,
  onAddRow,
  onAutoBuild,
}: QuoteGroupPricingTableProps) {
  return (
    <div className="section-stack">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Group Slabs</p>
          <h3>Build group pricing tiers</h3>
        </div>
      </div>

      <div className="inline-actions">
        <button type="button" className="secondary-button" onClick={onAddRow}>
          Add slab
        </button>
        <button type="button" className="secondary-button" onClick={onAutoBuild}>
          Auto Build tiers
        </button>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>From Pax</th>
              <th>To Pax</th>
              <th>FOC</th>
              <th>Per Guest Price</th>
              <th>Notes</th>
              <th>Label Preview</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const minPax = row.minPax.trim() ? Number(row.minPax) : 0;
              const maxPax = row.maxPax.trim() ? Number(row.maxPax) : null;
              const focPax = row.focPax.trim() ? Number(row.focPax) : 0;

              return (
                <tr key={row.clientId}>
                  <td>
                    <input
                      value={row.minPax}
                      onChange={(event) => onUpdateRow(row.clientId, 'minPax', event.target.value)}
                      type="number"
                      min="1"
                      step="1"
                    />
                  </td>
                  <td>
                    <input
                      value={row.maxPax}
                      onChange={(event) => onUpdateRow(row.clientId, 'maxPax', event.target.value)}
                      type="number"
                      min={row.minPax || '1'}
                      step="1"
                      placeholder="Open ended"
                    />
                  </td>
                  <td>
                    <input
                      value={row.focPax}
                      onChange={(event) => onUpdateRow(row.clientId, 'focPax', event.target.value)}
                      type="number"
                      min="0"
                      step="1"
                    />
                  </td>
                  <td>
                    <input
                      value={row.price}
                      onChange={(event) => onUpdateRow(row.clientId, 'price', event.target.value)}
                      type="number"
                      min="0.01"
                      step="0.01"
                    />
                  </td>
                  <td>
                    <input
                      value={row.notes}
                      onChange={(event) => onUpdateRow(row.clientId, 'notes', event.target.value)}
                      placeholder="Optional note"
                    />
                  </td>
                  <td>
                    {minPax > 0
                      ? formatSlabLabel(minPax, Number.isFinite(maxPax as number) ? maxPax : null, Math.max(0, focPax || 0))
                      : 'Awaiting range'}
                  </td>
                  <td>
                    <div className="inline-actions">
                      <button type="button" className="secondary-button" onClick={() => onDuplicateRow(row.clientId)}>
                        Duplicate
                      </button>
                      <button type="button" className="secondary-button" onClick={() => onDeleteRow(row.clientId)}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {validationErrors.length > 0 ? (
        <div className="section-stack">
          {validationErrors.map((message) => (
            <p key={message} className="form-error">
              {message}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
