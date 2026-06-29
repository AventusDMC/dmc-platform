// Pure orchestration for sending a proposal email — PR #575 backend foundation.
//
// Dependency-injected (no Nest, no Prisma, no real SMTP) so it is fully unit-
// testable: flag gate, status/role policy, recipient resolution, public-link +
// optional PDF, dry-run send, and audit. QuotesService.sendProposalEmail wires
// the real deps; tests inject fakes.
//
// SAFETY INVARIANTS:
// - Flag OFF  -> blocked 'feature_disabled', nothing composed/sent, no audit.
// - Missing recipient -> blocked 'missing_contact_email', nothing sent, audit failure.
// - SMTP not configured -> dryRun: composed but NOT delivered (delivered=false).
// - Never returns/audits public tokens or secrets (only booleans + recipient).
// - Never changes quote status (kept separate from Mark-as-Sent in V1).

/** Statuses allowed to send (V1 conservative policy): READY (first send) + SENT (resend). */
export const PROPOSAL_EMAIL_ALLOWED_STATUSES = new Set(['READY', 'SENT']);

export type ProposalEmailBlockedReason =
  | 'feature_disabled'
  | 'quote_not_found'
  | 'status'
  | 'missing_contact_email'
  | 'send_failed';

export interface ProposalEmailQuote {
  id: string;
  quoteNumber: string | null;
  title: string | null;
  /** Raw backend status, UPPERCASED by the caller. */
  statusCode: string;
  contactEmail: string | null;
}

export interface ProposalEmailActor {
  id?: string | null;
  companyId?: string | null;
}

export interface ProposalEmailOptions {
  /** Attach a freshly-generated PDF (default false in V1 — link-only email). */
  attachPdf?: boolean;
  language?: string;
}

export interface ProposalEmailAuditEntry {
  action: 'quote.proposal.email';
  quoteId: string;
  recipient: string | null;
  statusCode: string | null;
  dryRun: boolean;
  delivered: boolean;
  success: boolean;
  messageId: string | null;
  publicLinkIncluded: boolean;
  attachedPdf: boolean;
  reason: ProposalEmailBlockedReason | null;
}

export interface ProposalEmailDeps {
  isFeatureEnabled(): boolean;
  /** True only when a real SMTP host is configured; false => dry-run. */
  isSmtpConfigured(): boolean;
  loadQuote(id: string): Promise<ProposalEmailQuote | null>;
  /** Enable (idempotent) / resolve the public proposal URL; null if unavailable. */
  ensurePublicProposalUrl(id: string): Promise<string | null>;
  /** Generate a fresh proposal PDF buffer (only called when attachPdf is requested). */
  getPdf?: (language?: string) => Promise<Buffer | null>;
  resolveFrom(): string;
  /** Send (or dry-run capture) — throws on real failure. */
  sendMail(mailOptions: Record<string, unknown>): Promise<{ messageId?: string | null }>;
  audit(entry: ProposalEmailAuditEntry): Promise<void>;
}

export interface ProposalEmailResult {
  sent: boolean; // actually delivered (false in dry-run)
  dryRun: boolean;
  delivered: boolean;
  blocked: boolean;
  blockedReason: ProposalEmailBlockedReason | null;
  recipient: string | null;
  messageId: string | null;
  statusCode: string | null;
}

function blocked(
  reason: ProposalEmailBlockedReason,
  statusCode: string | null = null,
  recipient: string | null = null,
): ProposalEmailResult {
  return {
    sent: false,
    dryRun: false,
    delivered: false,
    blocked: true,
    blockedReason: reason,
    recipient,
    messageId: null,
    statusCode,
  };
}

export async function sendProposalEmailCore(
  id: string,
  actor: ProposalEmailActor | undefined,
  opts: ProposalEmailOptions,
  deps: ProposalEmailDeps,
): Promise<ProposalEmailResult> {
  // 1) Flag gate — compose/send nothing, no audit.
  if (!deps.isFeatureEnabled()) {
    return blocked('feature_disabled');
  }

  const quote = await deps.loadQuote(id);
  if (!quote) {
    return blocked('quote_not_found');
  }
  const statusCode = (quote.statusCode || '').toUpperCase();

  // 2) Status gate (conservative V1: READY + SENT only).
  if (!PROPOSAL_EMAIL_ALLOWED_STATUSES.has(statusCode)) {
    return blocked('status', statusCode);
  }

  // 3-4) Recipient resolution + missing-email guard (send nothing; audit the attempt).
  const recipient = (quote.contactEmail || '').trim();
  if (!recipient) {
    await deps.audit({
      action: 'quote.proposal.email',
      quoteId: id,
      recipient: null,
      statusCode,
      dryRun: !deps.isSmtpConfigured(),
      delivered: false,
      success: false,
      messageId: null,
      publicLinkIncluded: false,
      attachedPdf: false,
      reason: 'missing_contact_email',
    });
    return blocked('missing_contact_email', statusCode);
  }

  // 5) Public proposal link (idempotent enable/resolve). Included as link text only.
  const publicUrl = await deps.ensurePublicProposalUrl(id);

  // 6) Optional fresh PDF attachment (default off in V1).
  let attachedPdf = false;
  let attachments: Array<Record<string, unknown>> | undefined;
  if (opts.attachPdf && deps.getPdf) {
    const pdf = await deps.getPdf(opts.language);
    if (pdf) {
      attachedPdf = true;
      attachments = [
        {
          filename: `${quote.quoteNumber || 'proposal'}.pdf`,
          content: pdf,
          contentType: 'application/pdf',
        },
      ];
    }
  }

  // 7-8) Compose + send (dry-run when SMTP not configured).
  const dryRun = !deps.isSmtpConfigured();
  const label = quote.quoteNumber || quote.title || 'your trip';
  const bodyLines = [
    'Hello,',
    `Please find your travel proposal for ${label} below.`,
    publicUrl ? `View your proposal online: ${publicUrl}` : null,
    'Thank you.',
  ].filter((line): line is string => Boolean(line));

  let messageId: string | null = null;
  try {
    const info = await deps.sendMail({
      from: deps.resolveFrom(),
      to: recipient,
      subject: `Your travel proposal – ${label}`,
      text: bodyLines.join('\n\n'),
      ...(attachments ? { attachments } : {}),
    });
    messageId = info?.messageId ?? null;
  } catch {
    // 7) SMTP failure -> safe error + failure audit (no secret/body details).
    await deps.audit({
      action: 'quote.proposal.email',
      quoteId: id,
      recipient,
      statusCode,
      dryRun,
      delivered: false,
      success: false,
      messageId: null,
      publicLinkIncluded: Boolean(publicUrl),
      attachedPdf,
      reason: 'send_failed',
    });
    return {
      sent: false,
      dryRun,
      delivered: false,
      blocked: false,
      blockedReason: 'send_failed',
      recipient,
      messageId: null,
      statusCode,
    };
  }

  // 9) Success audit (no tokens/secrets — only booleans + recipient + messageId).
  await deps.audit({
    action: 'quote.proposal.email',
    quoteId: id,
    recipient,
    statusCode,
    dryRun,
    delivered: !dryRun,
    success: true,
    messageId,
    publicLinkIncluded: Boolean(publicUrl),
    attachedPdf,
    reason: null,
  });

  return {
    sent: !dryRun,
    dryRun,
    delivered: !dryRun,
    blocked: false,
    blockedReason: null,
    recipient,
    messageId,
    statusCode,
  };
}
