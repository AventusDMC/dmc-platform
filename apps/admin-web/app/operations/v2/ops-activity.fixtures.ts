/**
 * Fixtures for the Activity view model + render tests.
 *
 * Covers: a safe text change, a missing actor, a missing old/new value, a free-
 * text note, and several entries whose values MUST be redacted to "Value
 * updated" (financial keyword, decimal amount, JSON blob, reference/long
 * number). Timestamps are intentionally out of order to test newest-first sort.
 */
import type { RawBookingActivity } from './ops-activity-vm';

/** Raw values that must NEVER appear verbatim in the VM or rendered HTML. */
export const REDACTED_RAW = ['1200.00', '1450.00', '500', 'REF-AB12345', '{"foo"', 'IBAN', 'deposit'];

export const SAMPLE_ACTIVITY: RawBookingActivity = {
  auditLogs: [
    {
      id: 'a-text',
      entityType: 'booking_service',
      action: 'pickup_time_updated',
      oldValue: '08:00',
      newValue: '09:00',
      note: null,
      actor: 'ops@dmc',
      createdAt: '2026-06-28T11:00:00Z',
    },
    {
      id: 'a-financial-action',
      entityType: 'booking',
      action: 'payment_marked_paid',
      oldValue: 'PENDING',
      newValue: 'PAID',
      note: null,
      actor: 'finance@dmc',
      createdAt: '2026-06-28T14:00:00Z', // newest
    },
    {
      id: 'a-amount',
      entityType: 'booking_service',
      action: 'total_sell_updated',
      oldValue: '1200.00',
      newValue: '1450.00',
      note: null,
      actor: 'ops@dmc',
      createdAt: '2026-06-28T10:00:00Z',
    },
    {
      id: 'a-json',
      entityType: 'booking',
      action: 'snapshot_updated',
      oldValue: null,
      newValue: '{"foo":"bar","amount":50}',
      note: null,
      actor: 'system',
      createdAt: '2026-06-28T09:00:00Z',
    },
    {
      id: 'a-reference',
      entityType: 'booking_service',
      action: 'confirmation_reference_set',
      oldValue: null,
      newValue: 'REF-AB12345',
      note: null,
      actor: null, // missing actor → "System"
      createdAt: '2026-06-27T16:00:00Z',
    },
    {
      id: 'a-status',
      entityType: 'booking',
      action: 'status_updated',
      oldValue: 'draft',
      newValue: 'confirmed',
      note: null,
      actor: 'ops@dmc',
      createdAt: '2026-06-27T09:00:00Z',
    },
    {
      id: 'a-note',
      entityType: 'booking',
      action: 'note_added',
      oldValue: null,
      newValue: null,
      note: 'Guest requested early check-in',
      actor: 'ops@dmc',
      createdAt: '2026-06-26T12:00:00Z',
    },
    {
      id: 'a-note-financial',
      entityType: 'booking',
      action: 'note_added',
      oldValue: null,
      newValue: null,
      note: 'Paid 500 USD deposit via IBAN',
      actor: 'finance@dmc',
      createdAt: '2026-06-26T08:00:00Z',
    },
    {
      id: 'a-rejected',
      entityType: 'booking_service',
      action: 'supplier_confirmation_rejected',
      oldValue: 'REQUESTED',
      newValue: 'REJECTED',
      note: null,
      actor: 'ops@dmc',
      createdAt: '2026-06-25T15:00:00Z',
    },
  ],
};

export const EMPTY_ACTIVITY: RawBookingActivity = { auditLogs: [] };

/** A real internal supplier UUID that must never appear verbatim in Activity. */
export const SUPPLIER_ASSIGN_UUID = '7f126af7-7982-4c02-a3d8-074c699f54ab';

/**
 * Supplier-assignment audit entries whose backend values embed internal UUIDs:
 * a named assignment ("Name (uuid)"), a value that is ONLY a bare UUID, and a
 * free-text note containing a UUID. Used to verify UUIDs are stripped while
 * human-readable names/text stay visible.
 */
export const SUPPLIER_ASSIGN_ACTIVITY: RawBookingActivity = {
  auditLogs: [
    {
      id: 'sa-named',
      entityType: 'booking_service',
      action: 'booking_service_supplier_assigned',
      oldValue: `ASSIGNED: Almushtari Logistics Services (${SUPPLIER_ASSIGN_UUID})`,
      newValue: 'UNASSIGNED: unassigned',
      note: null,
      actor: 'ops@dmc',
      createdAt: '2026-06-28T12:00:00Z',
    },
    {
      id: 'sa-bare',
      entityType: 'booking_service',
      action: 'booking_service_supplier_assigned',
      oldValue: null,
      newValue: SUPPLIER_ASSIGN_UUID, // only an internal reference
      note: null,
      actor: 'ops@dmc',
      createdAt: '2026-06-28T11:00:00Z',
    },
    {
      id: 'sa-note',
      entityType: 'booking_service',
      action: 'note_added',
      oldValue: null,
      newValue: null,
      note: `Assigned via ${SUPPLIER_ASSIGN_UUID} portal request`,
      actor: 'ops@dmc',
      createdAt: '2026-06-28T10:00:00Z',
    },
  ],
};
