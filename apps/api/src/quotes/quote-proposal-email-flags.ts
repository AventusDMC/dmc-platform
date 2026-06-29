// Quote proposal email-send feature flag (PR #575). DEFAULT OFF.
//
// `QUOTE_PROPOSAL_EMAIL_SEND` gates the POST /quotes/:id/send-proposal-email
// endpoint. When OFF (the default), the endpoint composes/sends NOTHING and
// returns a safe blocked response (blockedReason: 'feature_disabled'). The flag
// only controls whether the send path runs at all — it does not change status,
// Mark-as-Sent, PDF, or public-link behavior.
//
// Independent of SMTP: even when this flag is ON, if SMTP is not configured the
// send runs in dry-run (stream) mode and delivers nothing (see common/mailer).

export const QUOTE_PROPOSAL_EMAIL_SEND_FLAG = 'quote.proposalEmailSend';

function readBooleanEnv(name: string): boolean {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on' || raw === 'yes';
}

// OFF unless QUOTE_PROPOSAL_EMAIL_SEND is explicitly truthy.
export function isQuoteProposalEmailSendEnabled(): boolean {
  return readBooleanEnv('QUOTE_PROPOSAL_EMAIL_SEND');
}
