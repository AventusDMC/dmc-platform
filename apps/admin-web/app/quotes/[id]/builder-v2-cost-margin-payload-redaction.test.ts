import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — Slice 2A-2: the page.tsx wiring that sanitizes the
// server-to-client hydration payload for restricted roles. The redaction logic
// itself is unit-tested in lib/quote-v2-cost-redaction.test.ts; this source-grep
// test pins that the page actually applies it (with the same canViewCostMargin
// predicate) and forwards the sanitized quote — not the raw one.

const pageSrc = readFileSync(new URL('./builder-v2/page.tsx', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

describe('Quote Builder V2 — cost/margin payload redaction wiring (Slice 2A-2)', () => {
  it('page.tsx imports the redactor and applies it with the canViewCostMargin predicate', () => {
    contains(pageSrc, [
      'import { redactQuoteV2CostMargin }',
      'const safeQuote = redactQuoteV2CostMargin(quote, canViewCostMargin)',
    ]);
  });

  it('the sanitized quote (not the raw quote) is forwarded to the client component', () => {
    contains(pageSrc, ['quote={safeQuote}']);
    assert.ok(
      !pageSrc.includes('<BuilderV2Client\n      quote={quote}'),
      'page must not pass the raw quote to BuilderV2Client',
    );
  });
});
