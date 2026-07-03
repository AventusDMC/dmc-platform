// Operations V2 Phase 2F-B — PURE orchestration for the actual voucher SEND.
//
// Dependency-injected (no Nest, no Prisma, no real transport) so every gate is
// unit-testable with fakes. BookingsService.sendOperationalVoucherEmail wires the
// real deps (2F-A readiness, #598 PDF, Resend HTTP, audit).
//
// SAFETY INVARIANTS (all enforced below, in order):
//  - Backend flag OFF        -> 'feature_disabled', nothing composed/sent, NO audit.
//  - Allowlist missing/empty -> 'recipient_allowlist_required' (fail closed).
//  - Resend not configured   -> 'transport_not_configured' (NO SMTP fallback).
//  - Sender missing          -> 'transport_not_configured'.
//  - Readiness != READY      -> 'not_ready', nothing sent.
//  - Recipient not allowed   -> 'recipient_not_allowed' (never rewrite silently).
//  - Duplicate within 60s    -> 'duplicate_recent'.
//  - PDF generation fails    -> 'pdf_failed', no email, NO audit.
//  - Send fails              -> 'send_failed', NO audit, NO status change.
//  - Success                 -> audit 'operational_voucher_emailed' AFTER send only.
// Recipient/subject/body/attachment are 100% server-resolved — never client input.
// No voucher status change, no sentAt/issuedAt, ever.

import { isRecipientAllowed } from './ops-voucher-send-flags';
import { isValidEmail, type VoucherSendPreview } from './voucher-send-preview';

export type VoucherSendBlockedReason =
  | 'feature_disabled'
  | 'recipient_allowlist_required'
  | 'transport_not_configured'
  | 'not_ready'
  | 'recipient_not_allowed'
  | 'duplicate_recent'
  | 'pdf_failed'
  | 'send_failed';

export interface VoucherSendAuditEntry {
  action: 'operational_voucher_emailed';
  bookingId: string;
  bookingServiceId: string;
  voucherId: string | null;
  supplierName: string | null;
  recipientDomains: string[];
  recipientCount: number;
  messageId: string | null;
  attachedPdf: true;
}

export interface VoucherSendDeps {
  isFeatureEnabled(): boolean;
  /** Parsed allowlist (exact emails + @domains); empty => fail closed. */
  getAllowlist(): string[];
  /** Verified Resend sender, or null when unset. */
  getSender(): string | null;
  /** True only when Resend HTTP is the active provider (never SMTP). */
  isResendConfigured(): boolean;
  /** 2F-A readiness + server-resolved recipient (throws NotFound if op missing). */
  loadReadiness(): Promise<VoucherSendPreview>;
  /** Voucher id for the audit (null if somehow absent). */
  loadVoucherId(): Promise<string | null>;
  /** #598 finance-free operational voucher PDF (null/throw => pdf_failed). */
  getPdf(): Promise<Buffer | null>;
  /** True if an identical send (same op/voucher/recipient set) happened < 60s ago. */
  recentDuplicateExists(key: { recipientDomains: string[]; recipientCount: number }): Promise<boolean>;
  /** Resend HTTP send — throws on failure. NEVER SMTP. */
  sendMail(mailOptions: Record<string, unknown>): Promise<{ messageId?: string | null }>;
  /** Write BookingAuditLog — called ONLY after a successful send. */
  audit(entry: VoucherSendAuditEntry): Promise<void>;
}

export interface VoucherSendResult {
  sent: boolean;
  blocked: boolean;
  blockedReason: VoucherSendBlockedReason | null;
  readiness: string | null;
  recipientCount: number;
  recipientDomains: string[];
  supplierName: string | null;
  messageId: string | null;
}

function domainsOf(emails: string[]): string[] {
  const out: string[] = [];
  for (const e of emails) {
    const at = e.lastIndexOf('@');
    const d = at >= 0 ? e.slice(at).toLowerCase() : '';
    if (d && !out.includes(d)) out.push(d);
  }
  return out;
}

function blocked(
  reason: VoucherSendBlockedReason,
  extra: Partial<VoucherSendResult> = {},
): VoucherSendResult {
  return {
    sent: false,
    blocked: true,
    blockedReason: reason,
    readiness: null,
    recipientCount: 0,
    recipientDomains: [],
    supplierName: null,
    messageId: null,
    ...extra,
  };
}

export async function sendOperationalVoucherEmailCore(
  input: { bookingId: string; operationId: string },
  deps: VoucherSendDeps,
): Promise<VoucherSendResult> {
  // 1) Backend flag — the independent kill-switch. Nothing composed/sent, no audit.
  if (!deps.isFeatureEnabled()) return blocked('feature_disabled');

  // 2) Allowlist REQUIRED while the flag is ON — fail closed.
  const allowlist = deps.getAllowlist();
  if (!allowlist || allowlist.length === 0) return blocked('recipient_allowlist_required');

  // 3) Transport: Resend HTTP + a verified sender. NO SMTP fallback.
  if (!deps.isResendConfigured()) return blocked('transport_not_configured');
  const from = deps.getSender();
  if (!from) return blocked('transport_not_configured');

  // 4) Re-run 2F-A readiness server-side; recipient re-resolved from the assigned
  //    operational supplier. (loadReadiness throws NotFound if the op is missing.)
  const preview = await deps.loadReadiness();
  const supplierName = preview.recipient?.supplierName ?? null;
  if (preview.readiness !== 'READY') {
    return blocked('not_ready', { readiness: preview.readiness, supplierName });
  }

  // 5) Recipients = the VALID parsed supplier emails only (server-resolved).
  const recipients = (preview.recipient?.emails ?? []).filter(isValidEmail);
  if (recipients.length === 0) return blocked('not_ready', { readiness: preview.readiness, supplierName });

  // 6) EVERY recipient must pass the allowlist — never rewrite silently.
  if (!recipients.every((e) => isRecipientAllowed(e, allowlist))) {
    return blocked('recipient_not_allowed', { supplierName });
  }

  const recipientDomains = domainsOf(recipients);
  const recipientCount = recipients.length;

  // 7) Soft duplicate guard (same op/voucher/recipient set within 60s).
  if (await deps.recentDuplicateExists({ recipientDomains, recipientCount })) {
    return blocked('duplicate_recent', { supplierName, recipientCount, recipientDomains });
  }

  // 8) Generate the finance-free operational voucher PDF (#598). Failure => no email.
  let pdf: Buffer | null = null;
  try {
    pdf = await deps.getPdf();
  } catch {
    pdf = null;
  }
  if (!pdf) return blocked('pdf_failed', { supplierName, recipientCount, recipientDomains });

  const voucherId = await deps.loadVoucherId();
  const attachmentName = preview.attachmentName || `voucher-${input.operationId}.pdf`;

  // 9) Send via Resend HTTP. On failure: safe error, NO audit, NO status change.
  let messageId: string | null = null;
  try {
    const info = await deps.sendMail({
      from,
      to: recipients,
      subject: preview.subject,
      text: preview.bodySummary,
      attachments: [{ filename: attachmentName, content: pdf, contentType: 'application/pdf' }],
    });
    messageId = info?.messageId ?? null;
  } catch {
    return blocked('send_failed', { supplierName, recipientCount, recipientDomains });
  }

  // 10) Success — audit AFTER the send succeeded. No raw body/PDF/finance data.
  await deps.audit({
    action: 'operational_voucher_emailed',
    bookingId: input.bookingId,
    bookingServiceId: input.operationId,
    voucherId,
    supplierName,
    recipientDomains,
    recipientCount,
    messageId,
    attachedPdf: true,
  });

  return {
    sent: true,
    blocked: false,
    blockedReason: null,
    readiness: 'READY',
    recipientCount,
    recipientDomains,
    supplierName,
    messageId,
  };
}
