import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const proposalSrc = read('../../../components/quote/v2/steps/proposal-step.tsx');
const shellSrc = read('../../../components/quote/v2/quote-builder-v2.tsx');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(src.includes(f), `Expected source to contain: ${f}`);
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) assert.ok(!src.includes(f), `Expected source NOT to contain: ${f}`);
}

describe('Quote Builder V2 — READY send-workflow clarification (PR #574)', () => {
  // ---- 1. status-only clarification copy ----
  it('proposal step states Mark-as-Sent is status-only and does not email', () => {
    contains(proposalSrc, [
      'updates the quote status to Sent',
      'It does not email the client.',
      'Use Classic Builder if you need the email-send workflow.',
    ]);
  });

  // ---- 2. Classic email-send link points to /quotes/[id]/classic ----
  it('proposal step shows a Classic email-send link wired to classicHref', () => {
    contains(proposalSrc, [
      'Open Classic Builder to send email',
      'href={classicHref}',
      'classicHref?: string',
    ]);
    // shell passes the per-quote classic path
    contains(shellSrc, ['classicHref={`/quotes/${quote.id}/classic`}']);
  });

  // ---- 3. Mark as Sent action still exists (unchanged) ----
  it('Mark as Sent action is unchanged (status-only via onSend)', () => {
    contains(proposalSrc, ['Mark as Sent', 'onClick={onSend}', 'status → SENT']);
  });

  // ---- 4. no email endpoint / API call added ----
  it('does not add any email-send endpoint or network call', () => {
    excludes(proposalSrc, ['sendEmail', 'send-email', 'emailClient', 'mailto:', 'fetch(']);
  });

  // ---- 5. PDF + share-link behavior unchanged ----
  it('PDF download and public share-link affordances remain', () => {
    contains(proposalSrc, ['Download PDF', 'onDownloadPdf', 'onEnablePublicLink', 'onDisablePublicLink']);
  });

  // ---- guardrail: this is copy/link only — no ClassicGuidance banner added ----
  it('does not introduce a ClassicGuidance banner on the proposal step', () => {
    excludes(proposalSrc, ['ClassicGuidance']);
  });
});
