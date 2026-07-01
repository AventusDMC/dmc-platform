/**
 * Fixtures for the Operations board view model + render tests.
 *
 * Covers all 5 phases. One row deliberately carries COST/SELL/PAYABLE fields
 * (1337 / 4242 / 7700) that do NOT exist on real grid rows — used to prove the
 * view-model allowlist drops them and they never reach the rendered board.
 */
import type { RawBookingReadiness, RawGridRow, RawOperationsGrid } from './ops-view-model';

const timing = { operationalDate: '2026-07-04', operationalTime: '09:00' };

const criticalRejected: RawGridRow = {
  id: 'row-critical',
  serviceType: 'ACTIVITY',
  description: 'Petra by Night entrance',
  dayNumber: 3,
  dayTitle: 'Petra',
  assignedSupplierId: 'sup-2',
  assignedSupplierName: 'Almushtari Logistics',
  assignmentStatus: 'ASSIGNED',
  supplierConfirmationStatus: 'REJECTED',
  voucherStatus: 'NOT_GENERATED',
  status: 'REJECTED',
  ...timing,
};

// Cost-laden row (Needs Assignment). The 1337/4242/7700 values must never render.
const needsAssignment = {
  id: 'row-unassigned',
  serviceType: 'TRANSPORT',
  description: 'Amman → Petra transfer',
  dayNumber: 3,
  dayTitle: 'Petra',
  assignedSupplierId: null,
  supplierId: null,
  assignmentStatus: 'UNASSIGNED',
  supplierConfirmationStatus: 'NOT_SENT',
  voucherStatus: 'NOT_GENERATED',
  status: 'PENDING',
  ...timing,
  // injected internal financials — NOT part of RawGridRow's allowlist:
  unitCost: 1337,
  totalSell: 4242,
  supplierPayableAmount: 7700,
} as unknown as RawGridRow;

const needsConfirmation: RawGridRow = {
  id: 'row-requested',
  serviceType: 'GUIDE',
  description: 'Licensed guide — Petra (EN)',
  dayNumber: 3,
  dayTitle: 'Petra',
  assignedSupplierId: 'sup-3',
  assignedSupplierName: 'Jordan Select Guides',
  assignmentStatus: 'ASSIGNED',
  supplierConfirmationStatus: 'REQUESTED',
  voucherStatus: 'NOT_GENERATED',
  status: 'REQUESTED',
  ...timing,
};

const readyForVoucher: RawGridRow = {
  id: 'row-voucher',
  serviceType: 'HOTEL',
  description: 'Mövenpick Petra · 2 nights',
  dayNumber: 3,
  dayTitle: 'Petra',
  assignedSupplierId: 'sup-4',
  assignedSupplierName: 'Mövenpick Resort Petra',
  assignmentStatus: 'ASSIGNED',
  supplierConfirmationStatus: 'CONFIRMED',
  voucherStatus: 'NOT_GENERATED',
  status: 'CONFIRMED',
  ...timing,
};

const operationallyReady: RawGridRow = {
  id: 'row-ready',
  serviceType: 'ACTIVITY',
  description: 'Jerash half-day tour',
  dayNumber: 2,
  dayTitle: 'Jerash',
  assignedSupplierId: 'sup-5',
  assignedSupplierName: 'Jordan Select Tours',
  assignmentStatus: 'ASSIGNED',
  supplierConfirmationStatus: 'CONFIRMED',
  voucherStatus: 'ISSUED',
  status: 'OPERATIONAL_READY',
  ...timing,
};

/**
 * Operationally UNASSIGNED, yet carries a catalog/source supplier (supplierId +
 * supplierName). Proves the confirmation gate keys off the RAW operational
 * assignment (assignedSupplierId), not the catalog fallback — while the Phase 2A
 * picker can still pre-select/display the source supplier.
 */
export const catalogSupplierOnlyRow: RawGridRow = {
  id: 'row-catalog-only',
  serviceType: 'HOTEL',
  description: 'Amman hotel (catalog supplier, not operationally assigned)',
  dayNumber: 1,
  dayTitle: 'Amman',
  assignedSupplierId: null,
  supplierId: 'cat-sup-9',
  supplierName: 'Catalog Hotel Co',
  assignmentStatus: 'UNASSIGNED',
  supplierConfirmationStatus: 'NOT_SENT',
  voucherStatus: 'NOT_GENERATED',
  status: 'PENDING',
  ...timing,
};

export const CATALOG_SUPPLIER_GRID: RawOperationsGrid = {
  booking: { id: 'bk-2', bookingRef: 'BK-2026-0009', title: 'Catalog supplier case' },
  rows: [catalogSupplierOnlyRow],
};

export const SAMPLE_GRID: RawOperationsGrid = {
  booking: { id: 'bk-1', bookingRef: 'BK-2026-0004', title: 'Jordan Explorer' },
  passengerManifest: {
    status: 'INCOMPLETE',
    expected: 4,
    received: 3,
    missingRecords: 1,
    incompleteRecords: 1,
    namesPending: false,
    voucherReady: false,
  },
  rows: [criticalRejected, needsAssignment, needsConfirmation, readyForVoucher, operationallyReady],
};

export const SAMPLE_READINESS: RawBookingReadiness = {
  status: 'confirmed',
  rooming: { badge: { count: 2 } },
};

/** Distinctive injected cost values that must never appear in VM or rendered HTML. */
export const COST_LEAK_VALUES = ['1337', '4242', '7700'];
