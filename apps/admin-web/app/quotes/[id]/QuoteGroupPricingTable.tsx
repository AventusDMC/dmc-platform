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

      <div className="quote-group-pricing-slab-list" aria-label="Group pricing tiers">
        {rows.map((row, index) => {
          const minPax = row.minPax.trim() ? Number(row.minPax) : 0;
          const maxPax = row.maxPax.trim() ? Number(row.maxPax) : null;
          const focPax = row.focPax.trim() ? Number(row.focPax) : 0;
          const labelPreview =
            minPax > 0
              ? formatSlabLabel(minPax, Number.isFinite(maxPax as number) ? maxPax : null, Math.max(0, focPax || 0))
              : 'Awaiting range';

          return (
            <article className="quote-group-pricing-slab-card" key={row.clientId}>
              <div className="quote-group-pricing-slab-head">
                <div className="quote-group-pricing-slab-title">
                  <h4>Slab {index + 1}</h4>
                  <span className="quote-group-pricing-slab-badge">{labelPreview}</span>
                </div>
                <div className="quote-group-pricing-actions" aria-label={`Actions for ${labelPreview}`}>
                  <button type="button" className="secondary-button" onClick={() => onDuplicateRow(row.clientId)}>
                    Duplicate
                  </button>
                  <button type="button" className="secondary-button" onClick={() => onDeleteRow(row.clientId)}>
                    Delete
                  </button>
                </div>
              </div>

              <div className="quote-group-pricing-input-grid">
                <label className="quote-group-pricing-field">
                  <span>From pax</span>
                  <input
                    value={row.minPax}
                    onChange={(event) => onUpdateRow(row.clientId, 'minPax', event.target.value)}
                    type="number"
                    min="1"
                    step="1"
                  />
                </label>
                <label className="quote-group-pricing-field">
                  <span>To pax</span>
                  <input
                    value={row.maxPax}
                    onChange={(event) => onUpdateRow(row.clientId, 'maxPax', event.target.value)}
                    type="number"
                    min={row.minPax || '1'}
                    step="1"
                    placeholder="Open ended"
                  />
                </label>
                <label className="quote-group-pricing-field">
                  <span>FOC</span>
                  <input
                    value={row.focPax}
                    onChange={(event) => onUpdateRow(row.clientId, 'focPax', event.target.value)}
                    type="number"
                    min="0"
                    step="1"
                  />
                </label>
                <label className="quote-group-pricing-field">
                  <span>Per guest price</span>
                  <input
                    value={row.price}
                    onChange={(event) => onUpdateRow(row.clientId, 'price', event.target.value)}
                    type="number"
                    min="0.01"
                    step="0.01"
                  />
                </label>
              </div>

              <label className="quote-group-pricing-field quote-group-pricing-notes-field">
                <span>Notes</span>
                <input
                  value={row.notes}
                  onChange={(event) => onUpdateRow(row.clientId, 'notes', event.target.value)}
                  placeholder="Optional note"
                />
              </label>
            </article>
          );
        })}
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
