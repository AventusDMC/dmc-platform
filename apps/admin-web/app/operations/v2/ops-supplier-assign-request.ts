/**
 * Booking Operations V2 — Phase 2A supplier-assignment request shape (pure).
 *
 * The single sanctioned mutation in V2 Phase 2A. Kept as a pure, React/Next-free
 * module so the exact endpoint, method, and body can be unit-tested and so the
 * read-only invariant can allowlist exactly this surface.
 *
 * Scope guardrails baked in:
 *  - method is ALWAYS PATCH.
 *  - assignmentStatus is ONLY 'ASSIGNED' (a supplier chosen) or 'UNASSIGNED'
 *    (cleared) — never the confirmation-flow statuses — so supplier confirmation
 *    state is left untouched.
 *  - body carries ONLY assignedSupplierId + assignmentStatus: no notes and no
 *    operational timing fields.
 */
export const SUPPLIER_ASSIGN_STATUS = {
  ASSIGNED: 'ASSIGNED',
  UNASSIGNED: 'UNASSIGNED',
} as const;

export type SupplierAssignStatus = (typeof SUPPLIER_ASSIGN_STATUS)[keyof typeof SUPPLIER_ASSIGN_STATUS];

export function supplierAssignPath(bookingId: string, operationId: string): string {
  return `/api/bookings/${bookingId}/operations/${operationId}/assign-supplier`;
}

export type SupplierAssignRequest = {
  url: string;
  method: 'PATCH';
  body: { assignedSupplierId: string | null; assignmentStatus: SupplierAssignStatus };
};

/**
 * Build the request to assign (supplierId given) or unassign (null) a supplier
 * on one operations row.
 */
export function buildSupplierAssignRequest(
  bookingId: string,
  operationId: string,
  assignedSupplierId: string | null,
): SupplierAssignRequest {
  const normalizedSupplierId = assignedSupplierId ? String(assignedSupplierId) : null;
  return {
    url: supplierAssignPath(bookingId, operationId),
    method: 'PATCH',
    body: {
      assignedSupplierId: normalizedSupplierId,
      assignmentStatus: normalizedSupplierId ? SUPPLIER_ASSIGN_STATUS.ASSIGNED : SUPPLIER_ASSIGN_STATUS.UNASSIGNED,
    },
  };
}
