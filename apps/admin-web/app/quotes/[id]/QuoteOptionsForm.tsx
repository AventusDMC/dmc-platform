'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HotelCategoryCombobox } from '../../components/HotelCategoryCombobox';
import { getErrorMessage } from '../../lib/api';
import { buildAuthHeaders } from '../../lib/auth-client';
import { HotelCategoryOption } from '../../lib/hotelCategories';

type QuoteOptionsFormProps = {
  apiBaseUrl: string;
  quoteId: string;
  hotelCategories: HotelCategoryOption[];
  optionId?: string;
  submitLabel?: string;
  initialValues?: {
    name: string;
    notes: string;
    hotelCategoryId: string;
    pricingMode: 'itemized' | 'package';
    packageMarginPercent: string;
    totalCost: number;
    totalSell: number;
    totalPax: number;
  };
};

export function QuoteOptionsForm({
  apiBaseUrl,
  quoteId,
  hotelCategories,
  optionId,
  submitLabel,
  initialValues,
}: QuoteOptionsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name || '');
  const [notes, setNotes] = useState(initialValues?.notes || '');
  const [hotelCategoryId, setHotelCategoryId] = useState(initialValues?.hotelCategoryId || '');
  const [pricingMode, setPricingMode] = useState<'itemized' | 'package'>(initialValues?.pricingMode || 'itemized');
  const [packageMarginPercent, setPackageMarginPercent] = useState(initialValues?.packageMarginPercent || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(optionId);
  const selectedHotelCategory = hotelCategories.find((category) => category.id === hotelCategoryId) || null;
  const totalCost = initialValues?.totalCost || 0;
  const totalPax = initialValues?.totalPax || 0;
  const normalizedMargin = packageMarginPercent === '' ? null : Number(packageMarginPercent);
  const packageTotalSell =
    pricingMode === 'package' && normalizedMargin !== null && !Number.isNaN(normalizedMargin)
      ? Number((totalCost * (1 + normalizedMargin / 100)).toFixed(2))
      : initialValues?.totalSell || 0;
  const packagePricePerPax = totalPax > 0 ? Number((packageTotalSell / totalPax).toFixed(2)) : 0;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim() && !hotelCategoryId) {
      setError('Option name or category is required.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/quotes/${quoteId}/options${optionId ? `/${optionId}` : ''}`, {
        method: optionId ? 'PATCH' : 'POST',
        headers: buildAuthHeaders({
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          name,
          notes,
          hotelCategoryId: hotelCategoryId || null,
          pricingMode,
          packageMarginPercent: pricingMode === 'package' && packageMarginPercent !== ''
            ? Number(packageMarginPercent)
            : null,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} quote option.`));
      }

      if (!isEditing) {
        setName('');
        setNotes('');
        setHotelCategoryId('');
        setPricingMode('itemized');
        setPackageMarginPercent('');
      }
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} quote option.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form" onSubmit={handleSubmit}>
      <label>
        Option name
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={selectedHotelCategory ? `${selectedHotelCategory.name} option` : 'Optional custom label'}
        />
      </label>

      <HotelCategoryCombobox
        label="Category"
        hotelCategories={hotelCategories}
        value={hotelCategoryId}
        onChange={setHotelCategoryId}
        placeholder="Search active categories"
      />

      {!name.trim() && selectedHotelCategory ? (
        <p className="form-helper">This option will use {selectedHotelCategory.name} as its label.</p>
      ) : null}

      <label>
        Notes
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="Optional notes"
        />
      </label>

      <label>
        Pricing mode
        <select value={pricingMode} onChange={(event) => setPricingMode(event.target.value as 'itemized' | 'package')}>
          <option value="itemized">Itemized</option>
          <option value="package">Package</option>
        </select>
      </label>

      {pricingMode === 'package' ? (
        <div className="stack-sm">
          <label>
            Package margin %
            <input
              type="number"
              step="0.01"
              value={packageMarginPercent}
              onChange={(event) => setPackageMarginPercent(event.target.value)}
              placeholder="15"
            />
          </label>
          <div className="form-helper">
            <p>Total cost: ${totalCost.toFixed(2)}</p>
            <p>Total sell: ${packageTotalSell.toFixed(2)}</p>
            <p>Per pax: ${packagePricePerPax.toFixed(2)}</p>
          </div>
        </div>
      ) : null}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save changes' : 'Create option')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
