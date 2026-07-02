/**
 * Booking Operations V2 — Phase 2D voucher preview view model (pure).
 *
 * The SANITIZER for read-only voucher preview. The backend operational-voucher
 * read returns the raw Voucher record (with the full `supplier` object incl.
 * transportDiscountPercent, and the raw `snapshotJson`). This module maps an
 * explicit ALLOWLIST of display-safe OPERATIONAL fields off the cost-free
 * snapshot and NOTHING else — so no cost/sell/payable/margin/price, no
 * discount, no payment/invoice/bank, no reference codes, no portal tokens, and
 * no raw snapshot ever reach the browser (allowlist by construction, same
 * principle as ops-view-model / ops-documents-vm).
 *
 * Pure module: no React, no I/O.
 */

/** Loose shape of the backend operational-voucher read (only what we sanitize). */
export type RawVoucherRecord = {
  type?: string | null;
  status?: string | null;
  snapshotJson?: unknown;
  [key: string]: unknown;
};

export type VoucherPreviewVM = {
  voucherType: string;
  status: string;
  serviceName: string | null;
  serviceType: string | null;
  /** Supplier NAME only — never the full supplier object / discount / contacts. */
  supplierName: string | null;
  date: string | null;
  time: string | null;
  paxCount: number | null;
  meetingPoint: string | null;
  operationalNotes: string | null;
  transport: {
    route: string | null;
    vehicleType: string | null;
    pickup: string | null;
    pickupTime: string | null;
    dropoff: string | null;
  } | null;
  hotel: {
    checkIn: string | null;
    checkOut: string | null;
    nights: number | null;
    mealPlan: string | null;
    occupancy: string | null;
    roomingSummary: string | null;
  } | null;
  activity: {
    meetingPoint: string | null;
    startTime: string | null;
    inclusions: string | null;
  } | null;
};

/** Voucher statuses that may be previewed read-only (a voucher exists). */
export const PREVIEWABLE_VOUCHER_STATUSES = ['GENERATED', 'READY', 'ISSUED', 'SENT'];

export function isPreviewableVoucherStatus(status: unknown): boolean {
  return typeof status === 'string' && PREVIEWABLE_VOUCHER_STATUSES.includes(status.toUpperCase());
}

const s = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);
const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * Map the raw operational-voucher record → the safe preview VM. Reads ONLY the
 * allowlisted operational fields from the cost-free snapshot; every other field
 * (supplier object, discount, cost/sell/payable, references, tokens, raw
 * snapshot) is structurally excluded.
 */
export function buildVoucherPreviewVM(raw: RawVoucherRecord): VoucherPreviewVM {
  const snap = obj(raw?.snapshotJson) ?? {};
  const supplier = obj(snap.supplier);
  const t = obj(snap.transport);
  const h = obj(snap.hotel);
  const a = obj(snap.activity);
  const pickup = obj(snap.pickup);
  const rooming = obj(snap.rooming);
  const roomingSummary = rooming
    ? `${num(rooming.roomCount) ?? 0} room(s), ${num(rooming.assignedPax) ?? 0} pax`
    : null;

  return {
    voucherType: s(raw?.type) ?? s(snap.voucherType) ?? 'VOUCHER',
    status: s(raw?.status) ?? 'GENERATED',
    serviceName: s(snap.serviceName),
    serviceType: s(snap.serviceType),
    supplierName: supplier ? s(supplier.name) : null,
    date: s(snap.date),
    time: s(snap.time),
    paxCount: num(snap.paxCount),
    meetingPoint: s(snap.meetingPoint),
    operationalNotes: s(snap.operationalNotes),
    transport: t
      ? {
          route: s(t.routeName),
          vehicleType: s(t.vehicleType),
          pickup: pickup ? s(pickup.location) : null,
          pickupTime: pickup ? s(pickup.time) : null,
          dropoff: s(snap.dropoff),
        }
      : null,
    hotel: h
      ? {
          checkIn: s(h.checkIn),
          checkOut: s(h.checkOut),
          nights: num(h.nights),
          mealPlan: s(h.mealPlan),
          occupancy: s(h.occupancy),
          roomingSummary,
        }
      : null,
    activity: a
      ? {
          meetingPoint: s(a.meetingPoint),
          startTime: s(a.startTime),
          inclusions: s(a.inclusions),
        }
      : null,
  };
}
