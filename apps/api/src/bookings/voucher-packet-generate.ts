import { createHash } from 'crypto';
import type { PackableService, VoucherPacketGroup } from './voucher-packet-grouping';

/**
 * Supplier Voucher Packet V2 — S3 pure snapshot + content-hash helpers.
 *
 * PURE: no DB, no I/O, no time/random — deterministic and unit-testable. The
 * snapshots and hash are PII- and finance-free by construction (they carry only
 * service identity, type, dates, labels, and supplier name).
 */

/** Per-packet snapshot persisted at generation time. */
export function buildVoucherPacketSnapshot(
  group: VoucherPacketGroup,
  bookingRef: string | null,
  members: PackableService[],
) {
  return {
    supplierId: group.supplierId,
    supplierName: group.supplierName,
    groupingType: group.groupingType,
    groupingKey: group.groupingKey,
    bookingRef: bookingRef ?? null,
    dateRange: group.dateRange,
    dayNumbers: group.dayNumbers,
    serviceCount: members.length,
    services: members.map((m) => ({
      id: m.id,
      serviceType: m.serviceType ?? null,
      serviceDate: m.serviceDate ?? m.operationalDate ?? null,
      dayNumber: m.dayNumber ?? null,
      label: (m.label ?? '').trim() || null,
    })),
  };
}

/** Per-item snapshot (the service's state at generation time). */
export function buildVoucherPacketItemSnapshot(member: PackableService) {
  return {
    bookingServiceId: member.id,
    serviceType: member.serviceType ?? null,
    operationType: member.operationType ?? null,
    serviceDate: member.serviceDate ?? member.operationalDate ?? null,
    dayNumber: member.dayNumber ?? null,
    label: (member.label ?? '').trim() || null,
    supplierName: member.assignedSupplierName ?? null,
  };
}

/**
 * Deterministic content hash of the packet members — a stable fingerprint for
 * later stale-detection (unused in S3, set now). Order-independent: members are
 * sorted by id before hashing, so the same set yields the same hash.
 */
export function computeVoucherPacketContentHash(members: PackableService[]): string {
  const canonical = members
    .map((m) => ({
      id: m.id,
      serviceDate: m.serviceDate ?? m.operationalDate ?? null,
      label: (m.label ?? '').trim() || null,
      supplierId: m.assignedSupplierId ?? null,
    }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
