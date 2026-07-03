// Phase 2F-A — PURE, read-only voucher SEND-PREVIEW / readiness builder.
//
// Describes WHAT a voucher email would contain IF a send existed. It does NOT
// send, mutate, generate a PDF, read cost data, or touch status/sentAt. Recipient
// is the ASSIGNED OPERATIONAL SUPPLIER only (bookingService.assignedSupplierId ->
// Supplier.email): NO catalog/source-supplier fallback, NO restaurant fallback,
// NO client-supplied recipient/subject/body. Finance-free by construction — the
// input types carry only supplier name/email + voucher type/status + bookingRef,
// so no cost/sell/payable/margin/token/snapshot can ever reach the output.

export type VoucherSendPreviewInput = {
  bookingId: string;
  operationId: string;
  bookingRef: string | null;
  // null when no operational voucher has been generated yet.
  voucher: { type: string | null; status: string | null } | null;
  // The OPERATIONAL assignment only (never the catalog supplierId).
  assignedSupplierId: string | null;
  assignedSupplier: { id: string; name: string | null; email: string | null } | null;
};

export type VoucherSendRecipientSource = 'assignedOperationalSupplier' | 'none';

export type VoucherSendReadiness =
  | 'READY'
  | 'NO_VOUCHER'
  | 'VOUCHER_CANCELLED'
  | 'UNSAFE_STATUS'
  | 'NO_SUPPLIER'
  | 'MISSING_EMAIL'
  | 'INVALID_EMAIL';

export type VoucherSendRecipient = {
  recipientSource: VoucherSendRecipientSource;
  supplierId: string | null;
  supplierName: string | null;
  // `email` is the comma-joined list of VALID parsed addresses (safe for a `to`),
  // or null when none are valid. `emails` is EVERY parsed address (for display).
  email: string | null;
  emails: string[];
  missingEmail: boolean;
  invalidEmail: boolean;
};

export type VoucherSendPreview = {
  bookingId: string;
  operationId: string;
  bookingRef: string | null;
  voucherType: string | null;
  voucherStatus: string | null;
  recipient: VoucherSendRecipient;
  subject: string;
  bodySummary: string;
  attachmentName: string | null;
  readiness: VoucherSendReadiness;
  readinessReason: string;
  blockingReasons: string[];
  note: 'Preview only. No email is sent.';
};

// Statuses from which a generated operational voucher could be sent later.
const SENDABLE_VOUCHER_STATUSES = new Set(['GENERATED', 'READY', 'ISSUED', 'SENT']);
// Lightweight format check (not RFC-exhaustive): one @, a dot in the domain, no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Lightweight email-format check (shared with Phase 2F-B send gating). Additive
// export — the readiness builder's behaviour is unchanged.
export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(String(email || '').trim());
}

// Parse a stored Supplier.email into a clean list. Accepts comma- OR semicolon-
// separated values, trims, drops empties/dupes. Read-only of master data.
export function parseSupplierEmails(raw: string | null | undefined): string[] {
  const out: string[] = [];
  for (const part of String(raw ?? '').split(/[;,]/)) {
    const value = part.trim();
    if (value && !out.includes(value)) out.push(value);
  }
  return out;
}

function normalizeStatus(status: string | null): string {
  return String(status ?? '').trim().toUpperCase();
}

export function buildVoucherSendPreview(input: VoucherSendPreviewInput): VoucherSendPreview {
  const bookingRef = input.bookingRef ? String(input.bookingRef).trim() || null : null;
  const voucherType = input.voucher ? input.voucher.type ?? null : null;
  const voucherStatus = input.voucher ? input.voucher.status ?? null : null;

  // Recipient — ASSIGNED operational supplier only. No catalog/source fallback.
  const supplierId = input.assignedSupplierId || null;
  const supplierName = supplierId ? input.assignedSupplier?.name?.trim() || null : null;
  const emails = supplierId ? parseSupplierEmails(input.assignedSupplier?.email) : [];
  const validEmails = emails.filter((e) => EMAIL_RE.test(e));
  const email = validEmails.length ? validEmails.join(', ') : null;

  const recipient: VoucherSendRecipient = {
    recipientSource: supplierId ? 'assignedOperationalSupplier' : 'none',
    supplierId,
    supplierName,
    email,
    emails,
    missingEmail: emails.length === 0,
    invalidEmail: emails.length > 0 && validEmails.length === 0,
  };

  // Readiness — voucher first, then the assigned supplier, then the email.
  let readiness: VoucherSendReadiness;
  let readinessReason: string;
  if (!input.voucher) {
    readiness = 'NO_VOUCHER';
    readinessReason = 'Generate the voucher before it can be sent.';
  } else if (normalizeStatus(voucherStatus) === 'CANCELLED') {
    readiness = 'VOUCHER_CANCELLED';
    readinessReason = 'Voucher is cancelled.';
  } else if (!SENDABLE_VOUCHER_STATUSES.has(normalizeStatus(voucherStatus))) {
    readiness = 'UNSAFE_STATUS';
    readinessReason = 'Voucher is not in a sendable state.';
  } else if (!supplierId) {
    readiness = 'NO_SUPPLIER';
    readinessReason = 'Assign an operational supplier first.';
  } else if (emails.length === 0) {
    readiness = 'MISSING_EMAIL';
    readinessReason = 'The assigned supplier has no email on file.';
  } else if (validEmails.length === 0) {
    readiness = 'INVALID_EMAIL';
    readinessReason = 'The assigned supplier email is not a valid address.';
  } else {
    readiness = 'READY';
    readinessReason = 'Assigned supplier has a valid email — a voucher email could be sent.';
  }

  const subject = `Operational voucher — ${bookingRef || 'Booking'} — ${supplierName || 'Assigned supplier'}`;
  const bodySummary =
    `The operational voucher for booking ${bookingRef || '(reference pending)'} would be emailed to the ` +
    `assigned operational supplier (${supplierName || 'unassigned'}) for service delivery. No cost or finance ` +
    `information is included. This is a preview only — no email is sent.`;
  const attachmentName = input.voucher ? `voucher-${input.operationId}.pdf` : null;

  return {
    bookingId: input.bookingId,
    operationId: input.operationId,
    bookingRef,
    voucherType,
    voucherStatus,
    recipient,
    subject,
    bodySummary,
    attachmentName,
    readiness,
    readinessReason,
    blockingReasons: readiness === 'READY' ? [] : [readinessReason],
    note: 'Preview only. No email is sent.',
  };
}
