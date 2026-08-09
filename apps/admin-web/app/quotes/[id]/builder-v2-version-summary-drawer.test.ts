import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — VV-3 Slice 2B: read-only version summary drawer. Source-grep
// tests: the drawer uses the SAFE summary endpoint (Slice 2A), never the raw detail
// route, never renders snapshotJson/raw JSON/PII, renders the cost block only on
// payload presence, and exposes no lifecycle actions.

const stepSrc = readFileSync(new URL('../../../components/quote/v2/steps/proposal-step.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');
const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const proxySrc = readFileSync(new URL('../../api/quotes/[id]/versions/[versionId]/summary/route.ts', import.meta.url), 'utf8');
const typesSrc = readFileSync(new URL('../../../lib/quote-types.ts', import.meta.url), 'utf8');
const listProxySrc = readFileSync(new URL('../../api/quotes/[id]/versions/route.ts', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

describe('Quote Builder V2 — version summary drawer (VV-3 Slice 2B)', () => {
  it('VersionSummary type matches the safe curated payload (incl. optional cost)', () => {
    contains(typesSrc, [
      'export interface VersionSummary',
      'statusAtSnapshot',
      'totalSell',
      'pricePerPax',
      'itemCount',
      'dayCount',
      'hasInclusions',
      'hasExclusions',
      'completeness: { ok: boolean; reasons: string[] }',
      'acceptWillSucceed',
      'cost?: { totalCost: number | null; margin: number | null; marginPercent: number | null }',
    ]);
  });

  it('proxy forwards ONLY to the /summary endpoint, GET-only, never the raw detail', () => {
    contains(proxySrc, ['export async function GET(', '/versions/${versionId}/summary']);
    assert.ok(!/export async function (POST|PATCH|PUT|DELETE)\(/.test(proxySrc), 'summary proxy must be GET-only');
    // Must not forward to the raw detail route (…/versions/${versionId}` with no /summary suffix).
    assert.ok(!/versions\/\$\{versionId\}`/.test(proxySrc), 'summary proxy must not call the raw detail endpoint');
  });

  it('client fetches the summary proxy (GET) and never the raw detail endpoint', () => {
    contains(clientSrc, [
      'const handleViewVersionSummary = async',
      '`/api/quotes/${q.id}/versions/${versionId}/summary`',
      'onViewVersion={canSaveVersion ? (versionId: string) => handleViewVersionSummary(quote!, versionId) : undefined}',
    ]);
    assert.ok(/versions\/\$\{versionId\}\/summary`,[\s\S]{0,40}method:\s*"GET"/.test(clientSrc), 'summary fetch must be GET');
    // No raw detail URL anywhere in the client.
    assert.ok(!/versions\/\$\{versionId\}`/.test(clientSrc), 'client must not build a raw versions/:versionId URL');
    assert.ok(!/\.snapshotJson/.test(clientSrc), 'client must not read snapshotJson');
  });

  it('builder threads onViewVersion to ProposalStep', () => {
    contains(builderSrc, [
      'onViewVersion?: (versionId: string) => Promise<VersionSummary>',
      'onViewVersion={onViewVersion}',
    ]);
  });

  it('View button appears per saved-version row and opens the drawer', () => {
    contains(stepSrc, [
      'onViewVersion?: (versionId: string) => Promise<VersionSummary>',
      'const handleViewVersion = async (versionId: string)',
      'onClick={() => handleViewVersion(v.id)}',
      'View version ${v.versionNumber} summary',
      'role="dialog"',
      'Loading summary…',
    ]);
  });

  it('drawer renders curated fields + completeness badge, cost only on presence', () => {
    contains(stepSrc, [
      'Quote title',
      'Status at snapshot',
      'Total sell',
      'Price per pax',
      'Completeness',
      'Ready to accept',
      'Incomplete',
      'summary.completeness.reasons.map',
      '{summary.cost ? (',
      'Cost (internal)',
    ]);
    // Cost is never computed in the UI (rendered from payload only) and no null/zero placeholder.
    assert.ok(!/summary\.totalSell\s*-\s*summary\.cost|marginPercent\s*=/.test(stepSrc), 'drawer must not compute cost');
  });

  it('drawer renders NO snapshotJson / raw JSON / PII / lifecycle actions', () => {
    // The step is presentational (no fetch) and renders only whitelisted summary fields.
    assert.ok(!stepSrc.includes('fetch('), 'proposal step must not call fetch directly');
    const drawer = stepSrc.slice(stepSrc.indexOf('Version summary drawer'), stepSrc.indexOf('Version summary drawer') + 6000);
    for (const forbidden of ['snapshotJson', 'JSON.stringify', 'passenger', 'passport', 'contactEmail', 'clientCompany', 'brandCompany', 'workflowDiagnostics', 'publicToken', 'quoteItems', 'restore', 'rollback', 'setAccepted', 'set-accepted']) {
      assert.ok(!drawer.includes(forbidden), `drawer must not reference ${forbidden}`);
    }
  });

  it('saved-versions LIST proxy is unchanged (still metadata-only GET route)', () => {
    contains(listProxySrc, ['export async function GET(', '/quotes/${id}/versions']);
  });
});
