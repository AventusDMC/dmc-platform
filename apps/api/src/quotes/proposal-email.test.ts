import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import {
  sendProposalEmailCore,
  PROPOSAL_EMAIL_ALLOWED_STATUSES,
  type ProposalEmailDeps,
  type ProposalEmailQuote,
  type ProposalEmailAuditEntry,
} from './proposal-email.core';

const READY_QUOTE: ProposalEmailQuote = {
  id: 'q1',
  quoteNumber: 'Q-2026-0001',
  title: 'Jordan Highlights',
  statusCode: 'READY',
  contactEmail: 'client@example.com',
};

function makeDeps(over: Partial<ProposalEmailDeps> & {
  quote?: ProposalEmailQuote | null;
  smtp?: boolean;
  enabled?: boolean;
  sendThrows?: boolean;
  publicUrl?: string | null;
} = {}) {
  const calls = {
    sendMail: [] as Array<Record<string, unknown>>,
    audits: [] as ProposalEmailAuditEntry[],
    pdf: 0,
    ensureLink: 0,
  };
  const deps: ProposalEmailDeps = {
    isFeatureEnabled: () => over.enabled ?? true,
    isSmtpConfigured: () => over.smtp ?? false,
    loadQuote: async () => (over.quote === undefined ? READY_QUOTE : over.quote),
    ensurePublicProposalUrl: async () => {
      calls.ensureLink += 1;
      return over.publicUrl === undefined ? 'https://app.example/q/abc' : over.publicUrl;
    },
    getPdf: async () => {
      calls.pdf += 1;
      return Buffer.from('%PDF-1.4 fake');
    },
    resolveFrom: () => 'noreply@localhost',
    sendMail: async (mailOptions) => {
      calls.sendMail.push(mailOptions);
      if (over.sendThrows) throw new Error('SMTP connection refused');
      return { messageId: '<msg-123@localhost>' };
    },
    audit: async (entry) => {
      calls.audits.push(entry);
    },
    ...over,
  };
  return { deps, calls };
}

// ---- 1. Flag OFF blocks and sends nothing ----
test('flag OFF -> blocked feature_disabled, nothing composed/sent, no audit', async () => {
  const { deps, calls } = makeDeps({ enabled: false });
  const res = await sendProposalEmailCore('q1', { id: 'u', companyId: 'c' }, {}, deps);
  assert.equal(res.blocked, true);
  assert.equal(res.blockedReason, 'feature_disabled');
  assert.equal(res.sent, false);
  assert.equal(calls.sendMail.length, 0);
  assert.equal(calls.audits.length, 0);
});

// ---- 2. Missing contact email -> safe error, nothing sent, failure audit ----
test('missing contact email -> blocked, nothing sent, audit failure', async () => {
  const { deps, calls } = makeDeps({ quote: { ...READY_QUOTE, contactEmail: null } });
  const res = await sendProposalEmailCore('q1', undefined, {}, deps);
  assert.equal(res.blockedReason, 'missing_contact_email');
  assert.equal(res.recipient, null);
  assert.equal(calls.sendMail.length, 0);
  assert.equal(calls.audits.length, 1);
  assert.equal(calls.audits[0].success, false);
  assert.equal(calls.audits[0].reason, 'missing_contact_email');
});

// ---- 3 & 6. READY + email + no SMTP -> dry-run compose, not delivered ----
test('READY with contact email, SMTP missing -> dry-run composed, not delivered', async () => {
  const { deps, calls } = makeDeps({ smtp: false });
  const res = await sendProposalEmailCore('q1', { id: 'u', companyId: 'c' }, {}, deps);
  assert.equal(res.blocked, false);
  assert.equal(res.dryRun, true);
  assert.equal(res.delivered, false);
  assert.equal(res.sent, false);
  assert.equal(res.recipient, 'client@example.com');
  assert.equal(calls.sendMail.length, 1); // composed
  assert.equal(calls.audits.length, 1);
  assert.equal(calls.audits[0].success, true);
  assert.equal(calls.audits[0].dryRun, true);
  assert.equal(calls.audits[0].delivered, false);
});

// ---- 6b. SMTP configured -> real send path (delivered) ----
test('SMTP configured -> delivered (not dry-run)', async () => {
  const { deps } = makeDeps({ smtp: true });
  const res = await sendProposalEmailCore('q1', { id: 'u', companyId: 'c' }, {}, deps);
  assert.equal(res.dryRun, false);
  assert.equal(res.delivered, true);
  assert.equal(res.sent, true);
  assert.equal(res.messageId, '<msg-123@localhost>');
});

// ---- 4. SENT is allowed for resend; ACCEPTED is blocked ----
test('SENT resend allowed; ACCEPTED blocked by status policy', async () => {
  assert.ok(PROPOSAL_EMAIL_ALLOWED_STATUSES.has('READY'));
  assert.ok(PROPOSAL_EMAIL_ALLOWED_STATUSES.has('SENT'));

  const sent = makeDeps({ quote: { ...READY_QUOTE, statusCode: 'SENT' } });
  const r1 = await sendProposalEmailCore('q1', undefined, {}, sent.deps);
  assert.equal(r1.blocked, false);
  assert.equal(sent.calls.sendMail.length, 1);

  const accepted = makeDeps({ quote: { ...READY_QUOTE, statusCode: 'ACCEPTED' } });
  const r2 = await sendProposalEmailCore('q1', undefined, {}, accepted.deps);
  assert.equal(r2.blocked, true);
  assert.equal(r2.blockedReason, 'status');
  assert.equal(accepted.calls.sendMail.length, 0);
});

// ---- 5. DRAFT is blocked (V1 policy) ----
test('DRAFT -> blocked by status policy, nothing sent', async () => {
  const { deps, calls } = makeDeps({ quote: { ...READY_QUOTE, statusCode: 'DRAFT' } });
  const res = await sendProposalEmailCore('q1', undefined, {}, deps);
  assert.equal(res.blockedReason, 'status');
  assert.equal(calls.sendMail.length, 0);
  assert.equal(calls.audits.length, 0);
});

// ---- 7. SMTP failure -> safe error + failure audit ----
test('send failure -> safe error and failure audit (no secret leak)', async () => {
  const { deps, calls } = makeDeps({ smtp: true, sendThrows: true });
  const res = await sendProposalEmailCore('q1', undefined, {}, deps);
  assert.equal(res.blockedReason, 'send_failed');
  assert.equal(res.sent, false);
  assert.equal(res.delivered, false);
  assert.equal(calls.audits.length, 1);
  assert.equal(calls.audits[0].success, false);
  assert.equal(calls.audits[0].reason, 'send_failed');
});

// ---- 8. Success writes quote.proposal.email audit ----
test('success writes quote.proposal.email audit', async () => {
  const { deps, calls } = makeDeps({ smtp: true });
  await sendProposalEmailCore('q1', { id: 'u', companyId: 'c' }, {}, deps);
  assert.equal(calls.audits.length, 1);
  assert.equal(calls.audits[0].action, 'quote.proposal.email');
  assert.equal(calls.audits[0].success, true);
  assert.equal(calls.audits[0].quoteId, 'q1');
});

// ---- 9. Audit metadata excludes public tokens/secrets ----
test('audit entry never contains public token / url / secrets', async () => {
  const { deps, calls } = makeDeps({ smtp: false, publicUrl: 'https://app.example/q/SECRET-TOKEN-123' });
  await sendProposalEmailCore('q1', undefined, {}, deps);
  const entry = calls.audits[0];
  const serialized = JSON.stringify(entry);
  assert.ok(!serialized.includes('SECRET-TOKEN-123'), 'audit must not contain the public token/url');
  assert.equal(entry.publicLinkIncluded, true); // boolean only
  const bag = entry as unknown as Record<string, unknown>;
  assert.ok(!('publicUrl' in bag));
  assert.ok(!('token' in bag));
});

// ---- optional PDF attachment path ----
test('attachPdf -> calls getPdf and marks attachedPdf', async () => {
  const { deps, calls } = makeDeps({ smtp: false });
  const res = await sendProposalEmailCore('q1', undefined, { attachPdf: true }, deps);
  assert.equal(calls.pdf, 1);
  assert.equal(calls.audits[0].attachedPdf, true);
  assert.equal(res.blocked, false);
  // default (no attachPdf) does not call getPdf
  const noPdf = makeDeps({ smtp: false });
  await sendProposalEmailCore('q1', undefined, {}, noPdf.deps);
  assert.equal(noPdf.calls.pdf, 0);
});

// ---- quote not found ----
test('missing quote -> blocked quote_not_found', async () => {
  const { deps, calls } = makeDeps({ quote: null });
  const res = await sendProposalEmailCore('nope', undefined, {}, deps);
  assert.equal(res.blockedReason, 'quote_not_found');
  assert.equal(calls.sendMail.length, 0);
});
