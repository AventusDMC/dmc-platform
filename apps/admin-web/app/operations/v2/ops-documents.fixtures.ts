/**
 * Fixtures for the Documents view model + render tests.
 *
 * Covers vouchers of varying status (ISSUED/DRAFT/SENT), a voucher missing
 * supplier + source service, passengers with/without passport. Injects values
 * that must NEVER leak: voucher snapshotJson, a sensitive voucher note, and
 * service-level cost/sell/payable fields.
 */
import type { RawBookingDocuments } from './ops-documents-vm';

/** Raw values that must NEVER appear in the VM or rendered HTML. */
export const DOCS_REDACTED_RAW = ['leak-7700', '{"secret"', 'TXN-998877', 'paid 500 USD', '9999', '1234', '5678', 'snapshotJson'];

export const SAMPLE_DOCS_DETAIL: RawBookingDocuments = {
  services: [
    {
      description: 'Petra transfer',
      // injected internal financials — the Documents VM must not read these:
      ...( { totalCost: 1234, totalSell: 5678, supplierPayableAmount: 9999 } as Record<string, unknown> ),
      vouchers: [
        {
          id: 'v1',
          type: 'TRANSPORT',
          status: 'ISSUED',
          issuedAt: '2026-06-20',
          notes: 'Internal: paid 500 USD ref TXN-998877', // → "Details recorded"
          supplier: { name: 'Alpha Transport' },
          bookingService: { description: 'Petra transfer', serviceType: 'TRANSPORT' },
          // injected snapshot — must never surface:
          ...( { snapshotJson: '{"secret":"leak-7700","amount":500}' } as Record<string, unknown> ),
        },
      ],
    },
    {
      description: 'Jerash tour',
      vouchers: [
        {
          id: 'v2',
          type: 'ACTIVITY',
          status: 'DRAFT',
          issuedAt: null,
          notes: null,
          supplier: { name: 'Jordan Select' },
          bookingService: { description: 'Jerash tour', serviceType: 'ACTIVITY' },
        },
        {
          // missing supplier + bookingService → must render safely
          id: 'v3',
          type: 'HOTEL',
          status: 'SENT',
          issuedAt: '2026-06-22',
          notes: null,
          supplier: null,
          bookingService: null,
        },
      ],
    },
    { description: 'Day at leisure', vouchers: [] },
  ],
  passengers: [{ passportNumberMasked: '55•••1' }, { passportNumberMasked: null }],
};

export const EMPTY_DOCS_DETAIL: RawBookingDocuments = { services: [], passengers: [] };
