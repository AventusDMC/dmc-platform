'use client';

import { GroupPricingPreview } from './group-pricing';

type QuoteGroupPricingPreviewProps = {
  sampleGroupSize: string;
  preview: GroupPricingPreview;
  onSampleGroupSizeChange: (value: string) => void;
};

function formatMoney(value: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

export function QuoteGroupPricingPreview({
  sampleGroupSize,
  preview,
  onSampleGroupSizeChange,
}: QuoteGroupPricingPreviewProps) {
  return (
    <div className="section-stack">
      <div className="workspace-section-head">
        <div>
          <p className="eyebrow">Live Preview</p>
          <h3>Check a sample group size</h3>
        </div>
      </div>

      <label>
        Group Size
        <input
          value={sampleGroupSize}
          onChange={(event) => onSampleGroupSizeChange(event.target.value)}
          type="number"
          min="1"
          step="1"
        />
      </label>

      <div className="quote-preview-total-list">
        <div>
          <span>Matched slab</span>
          <strong>{preview.matchedSlab ? preview.matchedSlab.label : 'Pricing to be confirmed'}</strong>
        </div>
        <div>
          <span>Paying guests after FOC</span>
          <strong>{preview.payingGuests ?? 'Pricing to be confirmed'}</strong>
        </div>
        <div>
          <span>Per guest price</span>
          <strong>{preview.pricePerGuest === null ? 'Pricing to be confirmed' : formatMoney(preview.pricePerGuest)}</strong>
        </div>
        <div>
          <span>Estimated total</span>
          <strong>{preview.estimatedTotal === null ? 'Pricing to be confirmed' : formatMoney(preview.estimatedTotal)}</strong>
        </div>
      </div>

      {preview.matchedSlab?.notes ? <p className="table-subcopy">{preview.matchedSlab.notes}</p> : null}
    </div>
  );
}
