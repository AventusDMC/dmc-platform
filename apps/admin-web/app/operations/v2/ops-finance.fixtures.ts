/**
 * Fixtures for the Finance view model + render tests.
 *
 * Covers: client + supplier payments, PAID / PENDING / overdue, a safe short
 * note, a sensitive note, a long note, present + absent references. Includes an
 * injected service-level `supplierPayableAmount` (7700) that must be dropped by
 * the allowlist, plus raw reference/note values that must never render.
 */
import type { RawBookingFinance } from './ops-finance-vm';

/** Raw values that must NEVER appear verbatim in the VM or rendered HTML. */
export const FINANCE_REDACTED_RAW = ['TXN-9988776655', 'INV-2026-77', 'IBAN', '500 USD', '7700', 'supplierPayableAmount'];

const LONG_NOTE = 'Supplier agreed to hold the rate until the group manifest is finalized next week okay';

export const SAMPLE_FINANCE_DETAIL: RawBookingFinance = {
  finance: {
    quotedTotalSell: 8450,
    realizedTotalCost: 5980,
    quotedMargin: 2470,
    quotedMarginPercent: 29,
    realizedMargin: 2470,
    realizedMarginPercent: 29,
    clientInvoiceStatus: 'invoiced',
    supplierPaymentStatus: 'unpaid',
  },
  payments: [
    {
      id: 'pc1',
      type: 'CLIENT',
      amount: 4225,
      currency: 'USD',
      status: 'PAID',
      method: 'bank_transfer',
      reference: 'TXN-9988776655', // raw → "Reference recorded"
      dueDate: null,
      paidAt: '2026-06-10',
      overdue: false,
      notes: 'First installment', // safe short → shown
    },
    {
      id: 'pc2',
      type: 'CLIENT',
      amount: 4225,
      currency: 'USD',
      status: 'PENDING',
      method: 'bank_transfer',
      reference: null,
      dueDate: '2026-06-30',
      paidAt: null,
      overdue: true,
      notes: 'Paid 500 USD via IBAN JO12', // sensitive → "Notes recorded"
    },
    {
      // SUPPLIER + injected service-level financial field that must be dropped
      id: 'ps1',
      type: 'SUPPLIER',
      amount: 3000,
      currency: 'USD',
      status: 'PENDING',
      method: 'bank',
      reference: 'INV-2026-77', // raw → "Reference recorded"
      dueDate: '2026-07-05',
      paidAt: null,
      overdue: false,
      notes: LONG_NOTE, // long → "Notes recorded"
      ...( { supplierPayableAmount: 7700 } as Record<string, unknown> ),
    },
  ],
};

export const EMPTY_FINANCE_DETAIL: RawBookingFinance = { finance: null, payments: [] };
