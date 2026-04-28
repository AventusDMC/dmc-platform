import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const queueSource = readFileSync(new URL('./ReconciliationQueueTable.tsx', import.meta.url), 'utf8');

describe('finance reconciliation queue regression', () => {
  it('uses admin-web proxy routes for payment proof actions and receipt previews', () => {
    assert.match(queueSource, /fetch\('\/api\/bookings\/reconciliation\/payment-proofs\/confirm'/);
    assert.match(queueSource, /fetch\('\/api\/bookings\/reconciliation\/payment-proofs\/remind'/);
    assert.match(queueSource, /return `\/api\$\{value\.startsWith\('\/'\) \? value : `\/\$\{value\}`\}`;/);
    assert.doesNotMatch(queueSource, /NEXT_PUBLIC_API_URL|dmcapi-production|railway\.app/i);
  });
});
