import { resolveServiceTaxonomyGroup } from '../common/service-taxonomy';

/**
 * Supplier Voucher Packet V2 — S2 grouping engine (pure, deterministic).
 *
 * Groups a booking's operational services into supplier-facing packets. PURE:
 * no DB, no I/O, no mutation, no time/random — identical input yields identical
 * output. Unit-testable in isolation (see voucher-packet-grouping.test.ts).
 *
 * S2 is READ-ONLY: this computes groups for display; it never creates a
 * VoucherPacket / VoucherPacketItem, generates, previews, or sends anything.
 */

export type PackableService = {
  id: string;
  assignedSupplierId?: string | null;
  assignedSupplierName?: string | null;
  assignmentStatus?: string | null;
  serviceType?: string | null;
  operationType?: string | null;
  category?: string | null;
  /** ISO date-time (or date). Either may be present. */
  serviceDate?: string | null;
  operationalDate?: string | null;
  bookingDayId?: string | null;
  dayNumber?: number | null;
  nights?: number | null;
  /** PII-safe display label (service description / route / hotel name). */
  label?: string | null;
};

export type VoucherPacketGroupType =
  | 'TRANSPORT'
  | 'HOTEL'
  | 'ACTIVITY'
  | 'GUIDE'
  | 'MEAL'
  | 'TICKET'
  | 'EXTERNAL_PACKAGE'
  | 'SERVICE';

export type VoucherPacketGroup = {
  groupingKey: string;
  groupingType: VoucherPacketGroupType;
  supplierId: string;
  supplierName: string | null;
  serviceIds: string[];
  serviceCount: number;
  dateRange: { start: string | null; end: string | null };
  dayNumbers: number[];
  memberLabels: string[];
  // S5 enrichment (populated by the service, only when the backend packet flag is
  // ON): the id + status of an already-generated packet for this group, so the UI
  // can offer a download. Null when not generated or the flag is OFF. The pure
  // engine never sets these.
  existingPacketId?: string | null;
  packetStatus?: string | null;
  // S6 stale detection (populated by the service, read-only, flag-gated): true when
  // this group has a generated packet whose stored contentHash no longer matches the
  // current group's recomputed contentHash (member field/add/remove/supplier change),
  // or when the packet's group no longer exists (orphaned). Never persisted — the
  // packet status stays GENERATED. `orphaned` marks a packet whose groupingKey maps
  // to no live group (surfaced as a synthetic, non-regeneratable entry). The pure
  // engine never sets these.
  isStale?: boolean;
  orphaned?: boolean;
};

/** Stable display/sort order of the group types. */
const TYPE_ORDER: VoucherPacketGroupType[] = [
  'TRANSPORT',
  'HOTEL',
  'ACTIVITY',
  'GUIDE',
  'MEAL',
  'TICKET',
  'EXTERNAL_PACKAGE',
  'SERVICE',
];

const TAXONOMY_TO_TYPE: Record<string, VoucherPacketGroupType> = {
  transport: 'TRANSPORT',
  hotel: 'HOTEL',
  activity: 'ACTIVITY',
  guide: 'GUIDE',
  meal: 'MEAL',
  ticketing: 'TICKET',
  externalPackage: 'EXTERNAL_PACKAGE',
  operationalAssistance: 'SERVICE',
  other: 'SERVICE',
};

/** Reuse the shared taxonomy classifier (already unit-tested) for parity. */
function classify(service: PackableService): VoucherPacketGroupType {
  const group = resolveServiceTaxonomyGroup({
    category: service.category ?? service.serviceType ?? null,
    serviceType: {
      code: service.operationType ?? service.serviceType ?? null,
      name: service.serviceType ?? null,
    },
  });
  return TAXONOMY_TO_TYPE[group] ?? 'SERVICE';
}

/** Assigned = a resolved supplier AND assignmentStatus not UNASSIGNED. */
function isAssigned(service: PackableService): boolean {
  return (
    Boolean(service.assignedSupplierId) &&
    String(service.assignmentStatus || '').toUpperCase() !== 'UNASSIGNED'
  );
}

function dateOnly(value?: string | null): string | null {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function serviceDate(service: PackableService): string | null {
  return dateOnly(service.serviceDate) ?? dateOnly(service.operationalDate);
}

/** Deterministic grouping key. Supplier id is always part of the key, so
 *  different suppliers can never merge. */
function groupingKey(type: VoucherPacketGroupType, supplierId: string, service: PackableService): string {
  if (type === 'TRANSPORT') {
    // One packet per supplier across the whole booking.
    return `TRANSPORT:${supplierId}`;
  }
  if (type === 'HOTEL') {
    // Per supplier + stay-start date (stay block; contiguous-merge is later).
    return `HOTEL:${supplierId}:${serviceDate(service) ?? 'no-date'}`;
  }
  // Activity / guide / meal / ticket / external / service: per supplier + day.
  const day = service.bookingDayId || serviceDate(service) || 'no-day';
  return `${type}:${supplierId}:${day}`;
}

type Accumulator = {
  groupingKey: string;
  groupingType: VoucherPacketGroupType;
  supplierId: string;
  supplierName: string | null;
  members: PackableService[];
};

/**
 * Compute supplier packet groups from a booking's services. Unassigned services
 * are excluded; different suppliers never merge; output is deterministic.
 */
export function computeVoucherPacketGroups(services: PackableService[]): VoucherPacketGroup[] {
  const byKey = new Map<string, Accumulator>();

  for (const service of services) {
    if (!isAssigned(service)) continue;
    const supplierId = String(service.assignedSupplierId);
    const type = classify(service);
    const key = groupingKey(type, supplierId, service);

    const existing = byKey.get(key);
    if (existing) {
      existing.members.push(service);
      if (!existing.supplierName && service.assignedSupplierName) {
        existing.supplierName = service.assignedSupplierName;
      }
    } else {
      byKey.set(key, {
        groupingKey: key,
        groupingType: type,
        supplierId,
        supplierName: service.assignedSupplierName ?? null,
        members: [service],
      });
    }
  }

  const groups: VoucherPacketGroup[] = [];
  for (const acc of byKey.values()) {
    const members = acc.members.slice().sort((a, b) => {
      const ad = a.dayNumber ?? Number.MAX_SAFE_INTEGER;
      const bd = b.dayNumber ?? Number.MAX_SAFE_INTEGER;
      if (ad !== bd) return ad - bd;
      const as = serviceDate(a) ?? '';
      const bs = serviceDate(b) ?? '';
      if (as !== bs) return as < bs ? -1 : 1;
      return String(a.id).localeCompare(String(b.id));
    });

    const dates = members.map(serviceDate).filter((d): d is string => Boolean(d)).sort();
    const dayNumbers = Array.from(
      new Set(members.map((m) => m.dayNumber).filter((n): n is number => typeof n === 'number')),
    ).sort((a, b) => a - b);

    groups.push({
      groupingKey: acc.groupingKey,
      groupingType: acc.groupingType,
      supplierId: acc.supplierId,
      supplierName: acc.supplierName,
      serviceIds: members.map((m) => m.id),
      serviceCount: members.length,
      dateRange: { start: dates[0] ?? null, end: dates[dates.length - 1] ?? null },
      dayNumbers,
      memberLabels: members.map((m) => (m.label ?? '').trim()).filter(Boolean),
    });
  }

  // Deterministic group order: by type order, then supplier name, then key.
  return groups.sort((a, b) => {
    const at = TYPE_ORDER.indexOf(a.groupingType);
    const bt = TYPE_ORDER.indexOf(b.groupingType);
    if (at !== bt) return at - bt;
    const an = (a.supplierName ?? '').toLowerCase();
    const bn = (b.supplierName ?? '').toLowerCase();
    if (an !== bn) return an < bn ? -1 : 1;
    return a.groupingKey.localeCompare(b.groupingKey);
  });
}
