'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiValidationError, getApiError } from '../lib/api';
import { CurrencySelect } from '../components/CurrencySelect';
import { normalizeSupportedCurrency, type SupportedCurrency } from '../lib/currencyOptions';
import { ACTIVITY_CATEGORIES, Activity, ActivityCompany, ActivityPricingBasis, ActivityRateVariant } from './types';

type ActivityFormProps = {
  apiBaseUrl: string;
  activityId?: string;
  companies: ActivityCompany[];
  existingActivities?: Pick<Activity, 'id' | 'code'>[];
  submitLabel?: string;
  initialValues?: Activity | null;
};

const ACTIVITY_CODE_PATTERN = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;

function toCodeTokens(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .split(/[\s_-]+/)
    .map((part) => part.toUpperCase())
    .filter(Boolean);
}

function generateActivityCode(city: string, category: string, name: string) {
  const cityTokens = toCodeTokens(city);
  const categoryTokens = toCodeTokens(category);
  let nameTokens = toCodeTokens(name);

  if (cityTokens.length > 0 && cityTokens.every((token, index) => nameTokens[index] === token)) {
    nameTokens = nameTokens.slice(cityTokens.length);
  }

  return [...cityTokens, ...categoryTokens, ...nameTokens].join('_');
}

function toStringValue(value: string | number | null | undefined) {
  return value === null || value === undefined ? '' : String(value);
}

type ActivityRateVariantFormRow = {
  id?: string;
  name: string;
  supplierCompanyId: string;
  durationMinutes: string;
  currency: SupportedCurrency;
  costPrice: string;
  sellPrice: string;
  pricingBasis: ActivityPricingBasis;
  minPax: string;
  maxPax: string;
  maxPaxPerUnit: string;
  capacityPricing: boolean;
  active: boolean;
  notes: string;
  guideRequired: boolean;
  guideRequirement: string;
  meetingPoint: string;
  startPoint: string;
  endPoint: string;
  inclusions: string;
  exclusions: string;
  operationalNotes: string;
  seasonalNotes: string;
};

function toVariantRow(variant?: Partial<ActivityRateVariant>): ActivityRateVariantFormRow {
  return {
    id: variant?.id,
    name: variant?.name || '',
    supplierCompanyId: variant?.supplierCompanyId || '',
    durationMinutes: toStringValue(variant?.durationMinutes),
    currency: normalizeSupportedCurrency(variant?.currency),
    costPrice: toStringValue(variant?.costPrice),
    sellPrice: toStringValue(variant?.sellPrice),
    pricingBasis: variant?.pricingBasis || 'PER_GROUP',
    minPax: toStringValue(variant?.minPax),
    maxPax: toStringValue(variant?.maxPax),
    maxPaxPerUnit: toStringValue(variant?.maxPaxPerUnit),
    capacityPricing: Boolean(variant?.capacityPricing),
    active: variant?.active ?? true,
    notes: variant?.notes || '',
    guideRequired: Boolean(variant?.guideRequired),
    guideRequirement: variant?.guideRequirement || '',
    meetingPoint: variant?.meetingPoint || '',
    startPoint: variant?.startPoint || '',
    endPoint: variant?.endPoint || '',
    inclusions: variant?.inclusions || '',
    exclusions: variant?.exclusions || '',
    operationalNotes: variant?.operationalNotes || '',
    seasonalNotes: variant?.seasonalNotes || '',
  };
}

export function ActivityForm({ apiBaseUrl, activityId, companies, existingActivities = [], submitLabel, initialValues }: ActivityFormProps) {
  const router = useRouter();
  const [code, setCode] = useState(initialValues?.code || '');
  const [codeManuallyEdited, setCodeManuallyEdited] = useState(Boolean(initialValues?.code));
  const [name, setName] = useState(initialValues?.name || '');
  const [category, setCategory] = useState(initialValues?.category || '');
  const [city, setCity] = useState(initialValues?.city || '');
  const [region, setRegion] = useState(initialValues?.region || '');
  const [description, setDescription] = useState(initialValues?.description || '');
  const [supplierCompanyId, setSupplierCompanyId] = useState(initialValues?.supplierCompanyId || '');
  const [pricingBasis, setPricingBasis] = useState<ActivityPricingBasis>(initialValues?.pricingBasis || 'PER_PERSON');
  const [costPrice, setCostPrice] = useState(toStringValue(initialValues?.costPrice));
  const [sellPrice, setSellPrice] = useState(toStringValue(initialValues?.sellPrice));
  const [durationMinutes, setDurationMinutes] = useState(toStringValue(initialValues?.durationMinutes));
  const [active, setActive] = useState(initialValues?.active ?? true);
  const [rateVariants, setRateVariants] = useState<ActivityRateVariantFormRow[]>(
    initialValues?.rateVariants?.map(toVariantRow) || [],
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<ApiValidationError[]>([]);
  const isEditing = Boolean(activityId);
  const generatedCode = useMemo(() => generateActivityCode(city, category, name), [category, city, name]);
  const codeIsUnusual = Boolean(code.trim()) && !ACTIVITY_CODE_PATTERN.test(code.trim());
  const hasLegacyCategory = Boolean(category) && !ACTIVITY_CATEGORIES.includes(category as (typeof ACTIVITY_CATEGORIES)[number]);
  const duplicateCodeActivity = code.trim()
    ? existingActivities.find(
        (activity) => activity.id !== activityId && activity.code?.trim().toUpperCase() === code.trim().toUpperCase(),
      )
    : null;

  useEffect(() => {
    if (!codeManuallyEdited) {
      setCode(generatedCode);
    }
  }, [codeManuallyEdited, generatedCode]);

  function updateVariant(index: number, updates: Partial<ActivityRateVariantFormRow>) {
    setSaveState('idle');
    setRateVariants((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, ...updates } : row)));
  }

  function duplicateVariant(index: number) {
    setSaveState('idle');
    setRateVariants((current) => {
      const source = current[index];
      if (!source) return current;

      const duplicatedVariant = {
        ...source,
        id: undefined,
        name: `${source.name || 'Variant'} Copy`,
        active: true,
      };

      return [...current.slice(0, index + 1), duplicatedVariant, ...current.slice(index + 1)];
    });
  }

  function moveVariant(index: number, direction: -1 | 1) {
    setSaveState('idle');
    setRateVariants((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.length) return current;

      const next = [...current];
      const [row] = next.splice(index, 1);
      next.splice(nextIndex, 0, row);
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setValidationErrors([]);
    setSaveState('idle');

    const normalizedCostPrice = Number(costPrice);
    const normalizedSellPrice = Number(sellPrice);

    if (!name.trim()) {
      setError('Activity name is required.');
      return;
    }
    if (code.trim() && duplicateCodeActivity) {
      setError(`Activity code ${code.trim().toUpperCase()} already exists.`);
      return;
    }
    if (!supplierCompanyId) {
      setError('Supplier company is required.');
      return;
    }
    if (!Number.isFinite(normalizedCostPrice) || normalizedCostPrice < 0 || !Number.isFinite(normalizedSellPrice) || normalizedSellPrice < 0) {
      setError('Cost price and sell price must be zero or greater.');
      return;
    }

    const normalizedRateVariants = [];

    for (const [index, variant] of rateVariants.entries()) {
      const variantCost = Number(variant.costPrice);
      const variantSell = Number(variant.sellPrice);
      const variantDuration = variant.durationMinutes.trim() ? Number(variant.durationMinutes) : null;
      const variantMinPax = variant.minPax.trim() ? Number(variant.minPax) : null;
      const variantMaxPax = variant.maxPax.trim() ? Number(variant.maxPax) : null;
      const variantMaxPaxPerUnit = variant.maxPaxPerUnit.trim() ? Number(variant.maxPaxPerUnit) : null;

      if (!variant.name.trim()) {
        setError(`Rate variant ${index + 1} name is required.`);
        return;
      }
      if (!Number.isFinite(variantCost) || variantCost < 0 || !Number.isFinite(variantSell) || variantSell < 0) {
        setError(`Rate variant ${index + 1} cost and sell must be zero or greater.`);
        return;
      }
      if (variantDuration !== null && (!Number.isFinite(variantDuration) || variantDuration < 0)) {
        setError(`Rate variant ${index + 1} duration must be zero or greater.`);
        return;
      }
      if (variantMinPax !== null && (!Number.isFinite(variantMinPax) || variantMinPax < 1)) {
        setError(`Rate variant ${index + 1} minimum pax must be one or greater.`);
        return;
      }
      if (variantMaxPax !== null && (!Number.isFinite(variantMaxPax) || variantMaxPax < 1)) {
        setError(`Rate variant ${index + 1} maximum pax must be one or greater.`);
        return;
      }
      if (variantMinPax !== null && variantMaxPax !== null && variantMinPax > variantMaxPax) {
        setError(`Rate variant ${index + 1} minimum pax cannot be greater than maximum pax.`);
        return;
      }
      if (variantMaxPaxPerUnit !== null && (!Number.isFinite(variantMaxPaxPerUnit) || variantMaxPaxPerUnit < 1)) {
        setError(`Rate variant ${index + 1} max pax per unit must be one or greater.`);
        return;
      }

      normalizedRateVariants.push({
        id: variant.id,
        name: variant.name.trim(),
        durationMinutes: variantDuration,
        pricingBasis: variant.pricingBasis,
        supplierCompanyId: variant.supplierCompanyId || null,
        currency: variant.currency,
        costPrice: variantCost,
        sellPrice: variantSell,
        minPax: variantMinPax,
        maxPax: variantMaxPax,
        maxPaxPerUnit: variantMaxPaxPerUnit,
        capacityPricing: variant.capacityPricing,
        active: variant.active,
        notes: variant.notes.trim() || null,
        guideRequired: variant.guideRequired,
        guideRequirement: variant.guideRequirement || null,
        meetingPoint: variant.meetingPoint.trim() || null,
        startPoint: variant.startPoint.trim() || null,
        endPoint: variant.endPoint.trim() || null,
        inclusions: variant.inclusions.trim() || null,
        exclusions: variant.exclusions.trim() || null,
        operationalNotes: variant.operationalNotes.trim() || null,
        seasonalNotes: variant.seasonalNotes.trim() || null,
      });
    }

    setIsSubmitting(true);
    setSaveState('saving');

    try {
      const payload = {
        code: code.trim() || null,
        name: name.trim(),
        category: category.trim() || null,
        city: city.trim() || null,
        region: region.trim() || null,
        description: description.trim() || null,
        supplierCompanyId,
        pricingBasis,
        costPrice: normalizedCostPrice,
        sellPrice: normalizedSellPrice,
        durationMinutes: durationMinutes.trim() ? Number(durationMinutes) : null,
        active,
        rateVariants: normalizedRateVariants,
      };

      const response = await fetch(`${apiBaseUrl}/activities${activityId ? `/${activityId}` : ''}`, {
        method: activityId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const apiError = await getApiError(response, `Could not ${isEditing ? 'update' : 'create'} activity.`);
        setValidationErrors(apiError.errors);
        throw new Error(apiError.message);
      }

      if (isEditing) {
        setSaveState('saved');
        router.refresh();
      } else {
        router.push('/activities');
        router.refresh();
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} activity.`);
      setSaveState('idle');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <section className="quote-hotel-step-panel">
        <div className="quote-hotel-step-head">
          <div>
            <h3>Activity master</h3>
            <p className="detail-copy">Operational container fields used to organize activity variants.</p>
          </div>
        </div>

        <div className="form-row form-row-3">
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label>
            Code
            <input
              value={code}
              onChange={(event) => {
                setCodeManuallyEdited(true);
                setCode(event.target.value.toUpperCase().replace(/\s+/g, '_'));
              }}
              placeholder={generatedCode || 'PETRA_CULTURAL_BY_NIGHT'}
            />
            <span className="form-helper">Suggested: {generatedCode || 'Add city, category, and name to generate a code.'}</span>
            {codeManuallyEdited ? (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setCodeManuallyEdited(false);
                  setCode(generatedCode);
                }}
              >
                Use generated code
              </button>
            ) : null}
            {codeIsUnusual ? <span className="form-helper">Code format is unusual. Use uppercase words separated by underscores.</span> : null}
            {duplicateCodeActivity ? <span className="form-error">This code is already used by another activity.</span> : null}
          </label>
          <label>
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)} required>
              <option value="">Select category</option>
              {hasLegacyCategory ? <option value={category}>{category} (legacy)</option> : null}
              {ACTIVITY_CATEGORIES.map((activityCategory) => (
                <option key={activityCategory} value={activityCategory}>
                  {activityCategory}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-row form-row-3">
          <label>
            City
            <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Petra" />
          </label>
          <label>
            Region
            <input value={region} onChange={(event) => setRegion(event.target.value)} placeholder="South Jordan" />
          </label>
          <label>
            Supplier company
            <select value={supplierCompanyId} onChange={(event) => setSupplierCompanyId(event.target.value)} required>
              <option value="">Select supplier company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                  {company.type ? ` (${company.type})` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          Description
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
        </label>
      </section>

      <section className="quote-hotel-step-panel">
        <div className="quote-hotel-step-head">
          <div>
            <h3>Legacy fallback pricing</h3>
            <p className="detail-copy">Used by existing quotes and only used for new activity quote items when no active variants exist.</p>
          </div>
        </div>

        <div className="form-row">
          <label>
            Pricing basis
            <select value={pricingBasis} onChange={(event) => setPricingBasis(event.target.value as ActivityPricingBasis)} required>
              <option value="PER_PERSON">Per person</option>
              <option value="PER_GROUP">Per group</option>
            </select>
          </label>
          <label>
            Cost price
            <input value={costPrice} onChange={(event) => setCostPrice(event.target.value)} type="number" min="0" step="0.01" required />
          </label>
          <label>
            Sell price
            <input value={sellPrice} onChange={(event) => setSellPrice(event.target.value)} type="number" min="0" step="0.01" required />
          </label>
        </div>

        <div className="form-row">
          <label>
            Duration minutes
            <input value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} type="number" min="0" />
          </label>
        </div>
      </section>

      <label className="checkbox-row">
        <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
        Active
      </label>

      <section className="quote-hotel-step-panel">
        <div className="quote-hotel-step-head">
          <div>
            <h3>Rate variants</h3>
            <p className="detail-copy">Use variants for duration or capacity-based options under this activity.</p>
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setSaveState('idle');
              setRateVariants((current) => [...current, toVariantRow()]);
            }}
          >
            Add variant
          </button>
        </div>

        {rateVariants.length === 0 ? (
          <p className="detail-copy">No variants. Quotes will use the simple activity price above.</p>
        ) : (
          <div className="quote-external-matrix-table">
            {rateVariants.map((variant, index) => (
              <div className="form-row form-row-3" key={variant.id || index}>
                <label>
                  Label
                  <input
                    value={variant.name}
                    onChange={(event) => updateVariant(index, { name: event.target.value })}
                    placeholder="2 Hours"
                    required
                  />
                </label>
                <label>
                  Duration minutes
                  <input
                    value={variant.durationMinutes}
                    onChange={(event) => updateVariant(index, { durationMinutes: event.target.value })}
                    type="number"
                    min="0"
                  />
                </label>
                <label>
                  Pricing basis
                  <select
                    value={variant.pricingBasis}
                    onChange={(event) => updateVariant(index, { pricingBasis: event.target.value as ActivityPricingBasis })}
                  >
                    <option value="PER_PERSON">Per person</option>
                    <option value="PER_GROUP">Per group</option>
                  </select>
                </label>
                <label>
                  Supplier
                  <select value={variant.supplierCompanyId} onChange={(event) => updateVariant(index, { supplierCompanyId: event.target.value })}>
                    <option value="">Use activity supplier</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Currency
                  <CurrencySelect
                    value={variant.currency}
                    onChange={(value) => updateVariant(index, { currency: (value || 'USD') as SupportedCurrency })}
                    required
                  />
                </label>
                <label>
                  Min pax
                  <input
                    value={variant.minPax}
                    onChange={(event) => updateVariant(index, { minPax: event.target.value })}
                    type="number"
                    min="1"
                    placeholder="1"
                  />
                </label>
                <label>
                  Max pax
                  <input
                    value={variant.maxPax}
                    onChange={(event) => updateVariant(index, { maxPax: event.target.value })}
                    type="number"
                    min="1"
                    placeholder="10"
                  />
                </label>
                <label>
                  Cost
                  <input
                    value={variant.costPrice}
                    onChange={(event) => updateVariant(index, { costPrice: event.target.value })}
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Sell
                  <input
                    value={variant.sellPrice}
                    onChange={(event) => updateVariant(index, { sellPrice: event.target.value })}
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </label>
                <label>
                  Max pax per unit
                  <input
                    value={variant.maxPaxPerUnit}
                    onChange={(event) => updateVariant(index, { maxPaxPerUnit: event.target.value })}
                    type="number"
                    min="1"
                    placeholder="6"
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={variant.capacityPricing}
                    onChange={(event) => updateVariant(index, { capacityPricing: event.target.checked })}
                  />
                  Capacity pricing
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={variant.guideRequired}
                    onChange={(event) => updateVariant(index, { guideRequired: event.target.checked })}
                  />
                  Guide required
                </label>
                <label>
                  Guide requirement
                  <select value={variant.guideRequirement} onChange={(event) => updateVariant(index, { guideRequirement: event.target.value })}>
                    <option value="">Not specified</option>
                    <option value="LOCAL_GUIDE_REQUIRED">Local guide required</option>
                    <option value="OFFICIAL_ACCOMPANYING_GUIDE_ALLOWED">Official accompanying guide allowed</option>
                    <option value="BOTH_ACCEPTED">Both accepted</option>
                    <option value="LOCAL_GUIDE_PLUS_ACCOMPANYING_GUIDE">Local plus accompanying guide</option>
                  </select>
                </label>
                <label>
                  Meeting point
                  <input value={variant.meetingPoint} onChange={(event) => updateVariant(index, { meetingPoint: event.target.value })} />
                </label>
                <label>
                  Start point
                  <input value={variant.startPoint} onChange={(event) => updateVariant(index, { startPoint: event.target.value })} />
                </label>
                <label>
                  End point
                  <input value={variant.endPoint} onChange={(event) => updateVariant(index, { endPoint: event.target.value })} />
                </label>
                <label>
                  Inclusions
                  <textarea
                    value={variant.inclusions}
                    onChange={(event) => updateVariant(index, { inclusions: event.target.value })}
                    rows={2}
                  />
                </label>
                <label>
                  Exclusions
                  <textarea
                    value={variant.exclusions}
                    onChange={(event) => updateVariant(index, { exclusions: event.target.value })}
                    rows={2}
                  />
                </label>
                <label>
                  Operational notes
                  <textarea
                    value={variant.operationalNotes}
                    onChange={(event) => updateVariant(index, { operationalNotes: event.target.value })}
                    rows={2}
                  />
                </label>
                <label>
                  Seasonal notes
                  <textarea
                    value={variant.seasonalNotes}
                    onChange={(event) => updateVariant(index, { seasonalNotes: event.target.value })}
                    rows={2}
                  />
                </label>
                <label>
                  Notes
                  <input
                    value={variant.notes}
                    onChange={(event) => updateVariant(index, { notes: event.target.value })}
                  />
                </label>
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={variant.active}
                    onChange={(event) => updateVariant(index, { active: event.target.checked })}
                  />
                  {variant.active ? 'Active' : 'Inactive'}
                </label>
                <div className="table-action-group">
                  <button type="button" className="secondary-button" onClick={() => moveVariant(index, -1)} disabled={index === 0}>
                    Move up
                  </button>
                  <button type="button" className="secondary-button" onClick={() => moveVariant(index, 1)} disabled={index === rateVariants.length - 1}>
                    Move down
                  </button>
                  <button type="button" className="secondary-button" onClick={() => duplicateVariant(index)}>
                    Duplicate
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setSaveState('idle');
                      setRateVariants((current) => current.filter((_, rowIndex) => rowIndex !== index));
                    }}
                  >
                    {variant.id ? 'Archive' : 'Remove'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save activity' : 'Create activity')}
      </button>
      {saveState === 'saving' ? <p className="detail-copy">Saving activity changes...</p> : null}
      {saveState === 'saved' ? <p className="status-text-success">Activity changes saved.</p> : null}

      {error ? <p className="form-error">{error}</p> : null}
      {validationErrors.length > 0 ? (
        <div className="form-error">
          {validationErrors.map((validationError) => (
            <p key={`${validationError.path}:${validationError.code}`}>{validationError.message}</p>
          ))}
        </div>
      ) : null}
    </form>
  );
}
