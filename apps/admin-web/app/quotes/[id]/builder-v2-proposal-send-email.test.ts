import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const apiProxySrc = read('../../api/quotes/[id]/send-proposal-email/route.ts');
const pageSrc = read('./builder-v2/page.tsx');
const clientSrc = read('./builder-v2/builder-v2-client.tsx');
const shellSrc = read('../../../components/quote/v2/quote-builder-v2.tsx');
const proposalSrc = read('../../../components/quote/v2/steps/proposal-step.tsx');
const adapterSrc = read('../../../lib/quote-v2-adapter.ts');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(!src.includes(f), `Expected source NOT to contain: ${f}`);
}

describe('Quote Builder V2 — Send to client (proposal email) UI (PR #576)', () => {
  // ---- 1. Proxy is POST-only and forwards to the backend endpoint ----
  it('proxy is POST-only and forwards to backend /quotes/:id/send-proposal-email', () => {
    contains(apiProxySrc, [
      'export async function POST',
      '`${API_BASE_URL}/quotes/${id}/send-proposal-email`',
      "method: 'POST'",
      'buildActorHeaders(request)',
      'JSON.stringify(body',
    ]);
    excludes(apiProxySrc, ['export async function GET', 'export async function PATCH', 'export async function DELETE']);
  });

  // ---- 2 & 7. Button + handler are flag-gated (default OFF) ----
  it('affordance is gated on the frontend flag (default OFF) and admin/operations role', () => {
    contains(pageSrc, ["process.env.NEXT_PUBLIC_QUOTE_PROPOSAL_EMAIL_SEND === 'true'", 'proposalEmailSendEnabled']);
    // client only wires the handler when flag ON + admin/operations signal
    contains(clientSrc, ['proposalEmailSendEnabled && canViewPricingApplyAudit', 'handleSendProposalEmail']);
    // shell gates the button capability on flag + status
    contains(shellSrc, [
      'const canSendProposalEmail = Boolean(onSendProposalEmail) && proposalEmailSendEnabled && proposalEmailStatusOk',
    ]);
    // proposal step renders button only when capable + handler present
    contains(proposalSrc, ['canSendProposalEmail && onSendProposalEmail', 'Send to client']);
  });

  // ---- 3. Status policy READY/SENT (mirrors backend) ----
  it('button status policy is READY + SENT', () => {
    contains(shellSrc, ['const PROPOSAL_EMAIL_STATUSES = new Set(["READY", "SENT"])']);
  });

  // ---- 4. Missing recipient disables send ----
  it('missing recipient disables the send button with a clear message', () => {
    contains(proposalSrc, [
      'const hasRecipient = recipient.length > 0',
      'disabled={!hasRecipient}',
      'No client email on file',
    ]);
  });

  // ---- 5. Confirmation modal shows recipient + dry-run messaging ----
  it('confirmation modal shows recipient and dry-run / response messaging', () => {
    contains(proposalSrc, [
      'role="dialog"',
      'Recipient',
      '{recipient || "—"}',
      'Email composed in dry-run mode; no real email was sent.',
      'Attach the proposal PDF',
      'is separate from', // explains Mark as Sent is separate
    ]);
  });

  // ---- 6. feature_disabled response handled ----
  it('feature_disabled response shows a clear message', () => {
    contains(proposalSrc, ['Proposal email sending is not enabled.', "res.blockedReason === \"feature_disabled\""]);
  });

  // ---- 8. Mark as Sent remains status-only + #574 note kept ----
  it('Mark as Sent stays status-only and the PR #574 note is kept', () => {
    contains(proposalSrc, [
      'onClick={onSend}',
      'status-only change',
      'It does not email the client.',
      'Use Classic Builder if you need the email-send workflow.',
    ]);
  });

  // ---- 9. PDF + share-link UI unchanged ----
  it('PDF download and public share-link affordances remain', () => {
    contains(proposalSrc, ['Download PDF', 'onDownloadPdf', 'onEnablePublicLink', 'onDisablePublicLink']);
  });

  // ---- recipient sourcing: adapter maps contact email (FE-only, no backend change) ----
  it('adapter maps the client contact email into meta.contactEmail', () => {
    contains(adapterSrc, ['contactEmail: q.contact?.email ?? null', 'contactEmail: asTextOrNull(raw.contactEmail)']);
  });
});
