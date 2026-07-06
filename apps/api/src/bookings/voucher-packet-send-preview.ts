// Supplier Voucher Packet V2 — S7 PURE, read-only packet SEND-PREVIEW / readiness.
//
// Describes WHAT a supplier packet email WOULD contain and WHETHER it COULD be
// sent — it does NOT send, mutate, generate a PDF, read cost data, or touch
// status/sentAt. Recipient is the packet's ASSIGNED SUPPLIER only
// (packet.supplierId -> Supplier.email): NO catalog/source fallback, NO
// client-supplied recipient/subject/body. Finance-free by construction — inputs
// carry only supplier name/email + labels/counts + bookingRef.
//
// Send-config (OPS_V2_VOUCHER_SEND_ENABLED + allowlist) is only READ here to
// REPORT blockers (SEND_DISABLED / RECIPIENT_NOT_ALLOWLISTED). S7 never enables
// or performs a send.

import { isValidEmail, parseSupplierEmails } from './voucher-send-preview';
import { isRecipientAllowed } from './ops-voucher-send-flags';

export type VoucherPacketSendReadiness =
  | 'READY'
  | 'NO_PACKET'
  | 'PACKET_STALE'
  | 'NO_PDF'
  | 'NO_SUPPLIER'
  | 'MISSING_EMAIL'
  | 'MULTIPLE_EMAILS'
  | 'INVALID_EMAIL'
  | 'SEND_DISABLED'
  | 'RECIPIENT_NOT_ALLOWLISTED';

export type VoucherPacketSendPreviewInput = {
  bookingId: string;
  packetId: string;
  bookingRef: string | null;
  /** null when there is no packet row; otherwise the packet status. */
  packetStatus: string | null;
  /** S6 stale computation (current-group contentHash vs stored). */
  isStale: boolean;
  /** The S4 PDF renders from snapshotJson — available iff a snapshot is present. */
  hasSnapshot: boolean;
  /** The packet's stored supplier (the single shared assigned supplier). */
  supplierId: string | null;
  supplierName: string | null;
  /** Raw Supplier.email (may be comma/semicolon separated or empty). */
  supplierEmail: string | null;
  serviceCount: number;
  memberLabels: string[];
  /** OPS_V2_VOUCHER_SEND_ENABLED — read only, to report SEND_DISABLED. */
  sendEnabled: boolean;
  /** Parsed OPS_V2_VOUCHER_SEND_RECIPIENT_ALLOWLIST — read only. */
  allowlist: string[];
};

export type VoucherPacketSendPreview = {
  bookingId: string;
  packetId: string;
  bookingRef: string | null;
  supplierId: string | null;
  supplierName: string | null;
  /** The single valid resolved recipient (only when exactly one valid email); else null. */
  recipientEmail: string | null;
  /** Every parsed supplier address (for display). */
  emails: string[];
  serviceCount: number;
  memberLabels: string[];
  readiness: VoucherPacketSendReadiness;
  readinessReason: string;
  blockingReasons: string[];
  note: 'Preview only. No email is sent.';
};

// Human copy per readiness code (mirrors the S7 plan blocker table).
const REASON: Record<VoucherPacketSendReadiness, string> = {
  READY: 'Assigned supplier has a single allowlisted email — a packet email could be sent.',
  NO_PACKET: 'Generate the packet before it can be sent.',
  PACKET_STALE: 'Packet is stale — regenerate before sending.',
  NO_PDF: 'Generate the packet before it can be sent.',
  NO_SUPPLIER: 'Assign a supplier to all packet services first.',
  MISSING_EMAIL: 'The assigned supplier has no email on file.',
  MULTIPLE_EMAILS: 'The supplier has multiple emails — packet send needs a single recipient.',
  INVALID_EMAIL: 'The supplier email is not a valid address.',
  SEND_DISABLED: 'Supplier sending is not enabled.',
  RECIPIENT_NOT_ALLOWLISTED: 'Supplier email is not on the send allowlist.',
};

function normalizeStatus(status: string | null): string {
  return String(status ?? '').trim().toUpperCase();
}

export function buildVoucherPacketSendPreview(
  input: VoucherPacketSendPreviewInput,
): VoucherPacketSendPreview {
  const bookingRef = input.bookingRef ? String(input.bookingRef).trim() || null : null;
  const supplierId = input.supplierId || null;
  const supplierName = supplierId ? input.supplierName?.trim() || null : null;

  const emails = supplierId ? parseSupplierEmails(input.supplierEmail) : [];
  const validEmails = emails.filter(isValidEmail);
  // A resolved single recipient only when exactly one parsed address is valid.
  const recipientEmail = emails.length === 1 && validEmails.length === 1 ? validEmails[0] : null;

  // Collect ALL applicable blockers (full picture), pushed in precedence order so
  // blockers[0] is the primary readiness. Dependent checks short-circuit sensibly.
  const blockers: VoucherPacketSendReadiness[] = [];

  const packetGenerated = normalizeStatus(input.packetStatus) === 'GENERATED';
  if (!packetGenerated) {
    blockers.push('NO_PACKET');
  } else {
    if (input.isStale) blockers.push('PACKET_STALE');
    if (!input.hasSnapshot) blockers.push('NO_PDF');
  }

  // Supplier / email chain (sequential — each depends on the prior).
  if (!supplierId) {
    blockers.push('NO_SUPPLIER');
  } else if (emails.length === 0) {
    blockers.push('MISSING_EMAIL');
  } else if (emails.length > 1) {
    blockers.push('MULTIPLE_EMAILS');
  } else if (validEmails.length === 0) {
    blockers.push('INVALID_EMAIL');
  }

  // Send-enabled is independent config — always reported when off.
  if (!input.sendEnabled) blockers.push('SEND_DISABLED');

  // Allowlist only meaningful once a single valid recipient is resolved.
  if (recipientEmail && !isRecipientAllowed(recipientEmail, input.allowlist)) {
    blockers.push('RECIPIENT_NOT_ALLOWLISTED');
  }

  const readiness: VoucherPacketSendReadiness = blockers.length === 0 ? 'READY' : blockers[0];

  return {
    bookingId: input.bookingId,
    packetId: input.packetId,
    bookingRef,
    supplierId,
    supplierName,
    recipientEmail,
    emails,
    serviceCount: input.serviceCount,
    memberLabels: input.memberLabels,
    readiness,
    readinessReason: REASON[readiness],
    blockingReasons: blockers.map((code) => REASON[code]),
    note: 'Preview only. No email is sent.',
  };
}
