'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type SupplierOption = {
  id: string;
  name: string;
};

type Props = {
  bookingId: string;
  operationId: string;
  serviceLabel: string;
  assignedSupplierId?: string | null;
  supplierId?: string | null;
  assignmentNotes?: string | null;
  suppliers: SupplierOption[];
  compact?: boolean;
};

export function OperationSupplierAssignmentForm({
  bookingId,
  operationId,
  serviceLabel,
  assignedSupplierId,
  supplierId,
  assignmentNotes,
  suppliers,
  compact = false,
}: Props) {
  const router = useRouter();
  const [selectedSupplierId, setSelectedSupplierId] = useState(assignedSupplierId || supplierId || '');
  const [notes, setNotes] = useState(assignmentNotes || '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const endpoint = `/api/bookings/${bookingId}/operations/${operationId}/assign-supplier`;
    const payload = {
      bookingId,
      operationId,
      assignedSupplierId: selectedSupplierId || null,
      assignmentStatus: selectedSupplierId ? 'ASSIGNED' : 'UNASSIGNED',
      assignmentNotes: compact ? undefined : notes || null,
    };

    console.log('[booking-operation-assignment-ui] Save clicked', { bookingId, operationId });
    console.log('[booking-operation-assignment-ui] Payload sent', payload);
    setStatus('saving');
    setMessage(null);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'fetch',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      });
      const responsePayload = await response.json().catch(() => null);
      console.log('[booking-operation-assignment-ui] Endpoint response', {
        ok: response.ok,
        status: response.status,
        response: responsePayload,
      });

      if (!response.ok) {
        throw new Error(responsePayload?.message || responsePayload?.error || 'Failed to assign supplier.');
      }

      setStatus('saved');
      setMessage('Supplier assignment saved.');
      console.log('[booking-operation-assignment-ui] Save success', responsePayload);
      const currentUrl = new URL(window.location.href);
      currentUrl.searchParams.delete('warning');
      currentUrl.searchParams.delete('warningText');
      currentUrl.searchParams.delete('error');
      currentUrl.searchParams.delete('success');
      window.history.replaceState(null, '', currentUrl.toString());
      router.refresh();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to assign supplier.';
      setStatus('error');
      setMessage(errorMessage);
      console.error('[booking-operation-assignment-ui] Save failure', error);
    }
  }

  return (
    <form className={compact ? 'operations-inline-form operations-quick-form' : 'operations-inline-form'} onSubmit={handleSubmit}>
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="operationId" value={operationId} />
      <select
        name="assignedSupplierId"
        value={selectedSupplierId}
        onChange={(event) => setSelectedSupplierId(event.target.value)}
        aria-label={`Supplier for ${serviceLabel}`}
      >
        <option value="">Unassigned</option>
        {suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name}
          </option>
        ))}
      </select>
      <input type="hidden" name="assignmentStatus" value={selectedSupplierId ? 'ASSIGNED' : 'UNASSIGNED'} />
      {!compact ? (
        <input
          name="assignmentNotes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Notes"
          aria-label="Assignment notes"
        />
      ) : null}
      <button type="submit" className="button button-secondary" disabled={status === 'saving'}>
        {status === 'saving' ? 'Saving...' : 'Assign Supplier'}
      </button>
      {message ? <span className={`operations-inline-status operations-inline-status-${status}`}>{message}</span> : null}
    </form>
  );
}
