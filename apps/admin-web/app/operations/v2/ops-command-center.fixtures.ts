/**
 * Fixtures for the Command Center view model + render tests.
 *
 * Bookings include active (confirmed/draft), cancelled, and completed states,
 * plus injected financial fields (pricePerPax 9999, pricingSnapshotJson 8888,
 * payment reference/notes) that the allowlist must drop.
 */
import type { RawBookingListItem, RawDashboard, RawDispatch } from './ops-command-center-vm';

export const CC_REDACTED_RAW = ['9999', '8888', 'TXN-7777', 'paid 500'];

export const SAMPLE_DISPATCH: RawDispatch = {
  range: { label: 'Today' },
  counters: {
    criticalIssuesCount: 2,
    missingSuppliersCount: 3,
    pendingConfirmationsCount: 5,
    vouchersPendingCount: 4,
    operationallyReadyCount: 8,
    todaysArrivalsCount: 1,
    inProgressCount: 2,
    delayedCount: 1,
    totalRows: 20,
    operationsReadyPct: 65,
  },
  lanes: {
    arrivals: { label: 'Arrivals', total: 2, critical: 0, actionRequired: 1, ready: 1 },
    transport: { label: 'Transport', total: 6, critical: 1, actionRequired: 2, ready: 3 },
    guides: { label: 'Guides', total: 3, critical: 0, actionRequired: 1, ready: 2 },
  },
};

export const SAMPLE_DASHBOARD: RawDashboard = {
  kpis: {
    bookingsInOperation: 6,
    operationalExceptions: 9,
    unassignedSuppliers: 3,
    servicesPendingConfirmation: 5,
    vouchersPending: 4,
    missingRooming: 1,
  },
};

export const SAMPLE_BOOKINGS: RawBookingListItem[] = [
  {
    id: 'b-high',
    bookingRef: 'BK-0001',
    status: 'confirmed',
    snapshotJson: {
      title: 'Amman + Petra',
      travelStartDate: '2026-07-02',
      nightCount: 7,
      adults: 2,
      children: 2,
      company: { name: 'Anderson Family' },
      ...( { pricePerPax: 9999 } as Record<string, unknown> ),
    },
    operations: { badge: { count: 5, breakdown: { pendingConfirmations: 3, missingExecutionDetails: 1, reconfirmationDue: 1 } } },
    rooming: { badge: { count: 2, breakdown: { unassignedPassengers: 2 } } },
    finance: { clientInvoiceStatus: 'invoiced', supplierPaymentStatus: 'unpaid', badge: { count: 1 } },
    ...( { pricingSnapshotJson: { totalSell: 8888 }, payments: [{ reference: 'TXN-7777', notes: 'paid 500' }] } as Record<string, unknown> ),
  },
  {
    id: 'b-draft',
    bookingRef: 'BK-0005',
    status: 'draft',
    snapshotJson: { title: 'Draft trip', travelStartDate: '2026-07-15', nightCount: 4, adults: 3, children: 1, company: { name: 'Group X' } },
    operations: { badge: { count: 2, breakdown: { pendingConfirmations: 2 } } },
    rooming: { badge: { count: 0, breakdown: {} } },
    finance: { clientInvoiceStatus: 'unbilled', supplierPaymentStatus: 'unpaid', badge: { count: 0 } },
  },
  {
    id: 'b-low',
    bookingRef: 'BK-0002',
    status: 'confirmed',
    snapshotJson: { title: 'Quick trip', travelStartDate: '2026-07-10', nightCount: 3, adults: 1, children: 0, company: { name: 'Solo' } },
    operations: { badge: { count: 0, breakdown: {} } },
    rooming: { badge: { count: 0, breakdown: {} } },
    finance: { clientInvoiceStatus: 'paid', supplierPaymentStatus: 'paid', badge: { count: 0 } },
  },
  // excluded — terminal statuses
  { id: 'b-cancelled', bookingRef: 'BK-0003', status: 'cancelled', snapshotJson: { title: 'Cancelled' }, operations: { badge: { count: 9 } } },
  { id: 'b-completed', bookingRef: 'BK-0004', status: 'completed', snapshotJson: { title: 'Done' } },
];

export const EMPTY_DISPATCH: RawDispatch = { range: { label: 'Today' }, counters: { totalRows: 0 }, lanes: {} };
