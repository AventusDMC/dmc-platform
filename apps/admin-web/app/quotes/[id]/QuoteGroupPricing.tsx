'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InlineRowEditorShell } from '../../components/InlineRowEditorShell';
import { getApiError } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
import {
  buildAutoSlabRows,
  buildGroupPricingPreview,
  createGroupPricingRow,
  normalizeGroupPricingRows,
  parseGroupPricingRows,
  validateSlabs,
  type GroupPricingEditorRow,
  type QuotePricingMode,
} from './group-pricing';
import { QuoteGroupPricingPreview } from './QuoteGroupPricingPreview';
import { QuoteGroupPricingTable } from './QuoteGroupPricingTable';

type QuoteSlab = {
  id?: string;
  minPax: number;
  maxPax: number | null;
  focPax?: number | null;
  price: number;
  notes?: string | null;
};

type MarkupMode = 'percent' | 'fixed';

type QuoteGroupPricingProps = {
  apiBaseUrl: string;
  quoteId: string;
  initialMode: QuotePricingMode;
  initialSlabs: QuoteSlab[];
  initialFixedPricePerPerson: number;
  initialGroupSize: number;
  packageTotalCost: number;
  costCurrency: string;
};

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function formatPackageMoney(value: number, currency: string) {
  const safeCurrency = currency && currency.trim() ? currency.trim() : 'USD';
  return `${safeCurrency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function QuoteGroupPricing({
  apiBaseUrl,
  quoteId,
  initialMode,
  initialSlabs,
  initialFixedPricePerPerson,
  initialGroupSize,
  packageTotalCost,
  costCurrency,
}: QuoteGroupPricingProps) {
  const router = useRouter();
  const [pricingMode, setPricingMode] = useState<QuotePricingMode>(initialMode);
  const [fixedPricePerPerson, setFixedPricePerPerson] = useState(
    initialFixedPricePerPerson > 0 ? String(initialFixedPricePerPerson) : '',
  );
  const [markupMode, setMarkupMode] = useState<MarkupMode>('percent');
  const [markupValue, setMarkupValue] = useState('');
  const [rows, setRows] = useState<GroupPricingEditorRow[]>(
    initialSlabs.length > 0
      ? normalizeGroupPricingRows(
          initialSlabs.map((slab) =>
            createGroupPricingRow({
              id: slab.id,
              minPax: String(slab.minPax),
              maxPax: slab.maxPax === null ? '' : String(slab.maxPax),
              focPax: String(slab.focPax ?? 0),
              price: String(slab.price),
              notes: slab.notes || '',
            }),
          ),
        )
      : buildAutoSlabRows(initialGroupSize),
  );
  const [sampleGroupSize, setSampleGroupSize] = useState(String(Math.max(initialGroupSize, 1)));
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const validation = useMemo(() => (pricingMode === 'SLAB' ? validateSlabs(rows) : { errors: [], parsedRows: [] }), [pricingMode, rows]);
  const preview = useMemo(
    () => buildGroupPricingPreview(Number(sampleGroupSize) || 1, rows),
    [rows, sampleGroupSize],
  );
  const parsedRows = useMemo(() => parseGroupPricingRows(rows), [rows]);

  const paxForCost = Math.max(1, Math.floor(initialGroupSize || 1));
  const costPerPax = packageTotalCost > 0 ? roundMoney(packageTotalCost / paxForCost) : 0;
  const computedSell = useMemo(() => {
    if (costPerPax <= 0) {
      return null;
    }
    const trimmed = markupValue.trim();
    if (!trimmed) {
      return null;
    }
    const value = Number(trimmed);
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    const sell = markupMode === 'percent' ? costPerPax * (1 + value / 100) : costPerPax + value;
    return roundMoney(sell);
  }, [costPerPax, markupMode, markupValue]);

  function applyComputedSell() {
    if (computedSell === null) {
      return;
    }
    setFixedPricePerPerson(String(computedSell));
  }

  function updateRow(clientId: string, field: keyof GroupPricingEditorRow, value: string) {
    setRows((current) =>
      normalizeGroupPricingRows(current.map((row) => (row.clientId === clientId ? { ...row, [field]: value } : row))),
    );
  }

  function addRow() {
    setRows((current) => normalizeGroupPricingRows([...current, createGroupPricingRow()]));
  }

  function duplicateRow(clientId: string) {
    setRows((current) => {
      const source = current.find((row) => row.clientId === clientId);
      if (!source) {
        return current;
      }

      return normalizeGroupPricingRows([
        ...current,
        createGroupPricingRow({
          minPax: source.minPax,
          maxPax: source.maxPax,
          focPax: source.focPax,
          price: source.price,
          notes: source.notes,
        }),
      ]);
    });
  }

  function removeRow(clientId: string) {
    setRows((current) => {
      const next = current.filter((row) => row.clientId !== clientId);
      return next.length > 0 ? normalizeGroupPricingRows(next) : [createGroupPricingRow()];
    });
  }

  function autoBuild() {
    setRows(buildAutoSlabRows(Number(sampleGroupSize) || initialGroupSize || 1));
  }

  async function savePricingModel() {
    setIsSaving(true);
    setError('');

    try {
      if (pricingMode === 'SLAB' && validation.errors.length > 0) {
        throw new Error(validation.errors[0]);
      }

      const payload =
        pricingMode === 'SLAB'
          ? {
              pricingMode: 'SLAB',
              pricingType: 'group',
              fixedPricePerPerson: null,
              pricingSlabs: parsedRows.map((row) => ({
                minPax: row.minPax,
                maxPax: row.maxPax,
                focPax: row.focPax,
                price: row.price,
                notes: row.notes,
              })),
            }
          : {
              pricingMode: 'FIXED',
              pricingType: 'simple',
              fixedPricePerPerson: fixedPricePerPerson.trim() ? Number(fixedPricePerPerson) : null,
              pricingSlabs: [],
            };

      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}`, {
        method: 'PATCH',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const apiError = await getApiError(response, 'Could not save group pricing.');
        throw new Error(apiError.message);
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not save group pricing.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="section-stack">
      <InlineRowEditorShell>
        <div className="section-stack">
          <div className="workspace-section-head">
            <div>
              <p className="eyebrow">Group Pricing</p>
              <h2>Set package or slab pricing</h2>
            </div>
          </div>
          <p className="table-subcopy">
            FOC reduces paying guests for this slab. Group pricing stays separate from service-level cost and sell editing.
          </p>
          <label>
            Pricing Mode
            <select value={pricingMode} onChange={(event) => setPricingMode(event.target.value as QuotePricingMode)}>
              <option value="FIXED">Package price</option>
              <option value="SLAB">Group slabs</option>
            </select>
          </label>
        </div>
      </InlineRowEditorShell>

      {pricingMode === 'SLAB' ? (
        <>
          <InlineRowEditorShell>
            <QuoteGroupPricingTable
              rows={rows}
              validationErrors={validation.errors}
              onUpdateRow={updateRow}
              onDuplicateRow={duplicateRow}
              onDeleteRow={removeRow}
              onAddRow={addRow}
              onAutoBuild={autoBuild}
            />
          </InlineRowEditorShell>

          <InlineRowEditorShell>
            <QuoteGroupPricingPreview
              sampleGroupSize={sampleGroupSize}
              preview={preview}
              onSampleGroupSizeChange={setSampleGroupSize}
            />
          </InlineRowEditorShell>
        </>
      ) : (
        <InlineRowEditorShell>
          <div className="section-stack">
            <div className="workspace-section-head">
              <div>
                <p className="eyebrow">Package Pricing</p>
                <h3>Set the package sell basis</h3>
              </div>
            </div>

            <div className="quote-package-markup-helper section-stack">
              <p className="eyebrow">Quick markup</p>
              {costPerPax > 0 ? (
                <p className="table-subcopy">
                  Package cost per pax is{' '}
                  <strong>{formatPackageMoney(costPerPax, costCurrency)}</strong> ({paxForCost} pax). Add your
                  margin and we&apos;ll work out the sell price per person.
                </p>
              ) : (
                <p className="table-subcopy">
                  Add service costs to the quote first — once there is a package cost we can calculate the sell
                  price from your margin.
                </p>
              )}
              <div className="quote-package-markup-controls">
                <label>
                  Markup type
                  <select
                    value={markupMode}
                    onChange={(event) => setMarkupMode(event.target.value as MarkupMode)}
                    disabled={costPerPax <= 0}
                  >
                    <option value="percent">Percentage of cost</option>
                    <option value="fixed">Fixed amount per pax</option>
                  </select>
                </label>
                <label>
                  {markupMode === 'percent' ? 'Markup %' : `Margin per pax (${costCurrency})`}
                  <input
                    value={markupValue}
                    onChange={(event) => setMarkupValue(event.target.value)}
                    type="number"
                    min="0"
                    step={markupMode === 'percent' ? '1' : '0.01'}
                    inputMode="decimal"
                    placeholder={markupMode === 'percent' ? 'e.g. 20' : 'e.g. 150'}
                    disabled={costPerPax <= 0}
                  />
                </label>
              </div>
              {computedSell !== null ? (
                <div className="quote-package-markup-result">
                  <div>
                    <span>Sell price per person</span>
                    <strong>{formatPackageMoney(computedSell, costCurrency)}</strong>
                  </div>
                  <button type="button" className="secondary-button" onClick={applyComputedSell}>
                    Use this price
                  </button>
                </div>
              ) : null}
            </div>

            <label>
              Package sell price per person
              <input
                value={fixedPricePerPerson}
                onChange={(event) => setFixedPricePerPerson(event.target.value)}
                type="number"
                min="0"
                step="0.01"
                placeholder="Set package sell price"
              />
            </label>
          </div>
        </InlineRowEditorShell>
      )}

      <div className="inline-actions">
        <button type="button" className="primary-button" onClick={savePricingModel} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save group pricing'}
        </button>
      </div>

      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
