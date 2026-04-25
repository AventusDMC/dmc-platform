'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TypeSelect } from '../components/TypeSelect';
import { getErrorMessage } from '../lib/api';
import { supplierTypes } from '../lib/reference-data';

type SupplierType = 'hotel' | 'transport' | 'activity' | 'guide' | 'other';

type SuppliersFormProps = {
  apiBaseUrl: string;
  supplierId?: string;
  submitLabel?: string;
  initialValues?: {
    name: string;
    type: SupplierType;
    email: string;
    phone: string;
    notes: string;
  };
};

export function SuppliersForm({ apiBaseUrl, supplierId, submitLabel, initialValues }: SuppliersFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialValues?.name || '');
  const [type, setType] = useState<SupplierType>(initialValues?.type || 'other');
  const [email, setEmail] = useState(initialValues?.email || '');
  const [phone, setPhone] = useState(initialValues?.phone || '');
  const [notes, setNotes] = useState(initialValues?.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const isEditing = Boolean(supplierId);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const response = await fetch(`${apiBaseUrl}/suppliers${supplierId ? `/${supplierId}` : ''}`, {
        method: supplierId ? 'PATCH' : 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          type,
          email: email || undefined,
          phone: phone || undefined,
          notes: notes || undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(await getErrorMessage(response, `Could not ${isEditing ? 'update' : 'create'} supplier.`));
      }

      if (!isEditing) {
        setName('');
        setType('other');
        setEmail('');
        setPhone('');
        setNotes('');
      }

      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : `Could not ${isEditing ? 'update' : 'create'} supplier.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="entity-form compact-form" onSubmit={handleSubmit}>
      <div className="form-row form-row-2">
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} required />
        </label>

        <TypeSelect
          label="Type"
          value={type}
          onChange={(value) => setType((value || 'other') as SupplierType)}
          options={supplierTypes}
          required
          allowCustom={false}
        />
      </div>

      <div className="form-row form-row-2">
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>

        <label>
          Phone
          <input value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
      </div>

      <label>
        Notes
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : submitLabel || (isEditing ? 'Save supplier' : 'Add supplier')}
      </button>

      {error ? <p className="form-error">{error}</p> : null}
    </form>
  );
}
