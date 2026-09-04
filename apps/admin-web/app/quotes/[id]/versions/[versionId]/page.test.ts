import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

// CP-N3b2c3b — the Classic historical-version page renders ONLY the safe,
// whitelist-curated version summary. It must fetch exactly the /summary endpoint,
// never the raw version-detail route, never fall back to raw on any error, render
// only approved VersionSummary fields (no snapshotJson / PII / contact / company /
// supplier / notes / itinerary / items / slabs / scenarios / tokens / arbitrary
// JSON), show the cost block only when the backend includes it (never compute it),
// and stay read-only. The raw admin-web detail proxy is retired in this slice.

const pageSrc = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
// Comment-stripped view: the header comment legitimately NAMES the excluded fields
// (snapshotJson, PII, supplier, tokens…) to document the boundary, so the
// forbidden-token guards below must scan executable code only, not the prose.
const pageCode = pageSrc
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const summaryProxySrc = readFileSync(
  new URL('../../../../api/quotes/[id]/versions/[versionId]/summary/route.ts', import.meta.url),
  'utf8',
);
const classicWorkspaceSrc = readFileSync(new URL('../../ClassicQuoteWorkspace.tsx', import.meta.url), 'utf8');
const rawProxyPath = fileURLToPath(
  new URL('../../../../api/quotes/[id]/versions/[versionId]/route.ts', import.meta.url),
);

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

describe('CP-N3b2c3b — Classic version page (safe summary only)', () => {
  it('1. fetches EXACTLY the safe /summary endpoint', () => {
    contains(pageSrc, ['`/api/quotes/${id}/versions/${versionId}/summary`']);
  });

  it('2. never builds or fetches the raw version-detail URL', () => {
    // A raw version-detail URL is …/versions/${versionId}` with no /summary suffix.
    // (The /quotes/${id}` back-link is a page nav link, not an API fetch — allowed.)
    assert.ok(
      !/versions\/\$\{versionId\}`/.test(pageSrc),
      'page must not build a raw versions/:versionId URL',
    );
    assert.ok(
      !/versions\/\$\{versionId\}'/.test(pageSrc),
      'page must not build a raw versions/:versionId URL (single-quoted)',
    );
  });

  it('3. uses adminPageFetchJson with allow404 (single fetch, no fallback)', () => {
    contains(pageSrc, ['adminPageFetchJson<VersionSummary | null>', 'allow404: true']);
    // Exactly one summary fetch call — no second/fallback fetch anywhere.
    const summaryFetchCount = (pageSrc.match(/versions\/\$\{versionId\}\/summary/g) || []).length;
    assert.equal(summaryFetchCount, 1, 'exactly one /summary fetch (no fallback fetch)');
    assert.ok(!/\bfetch\(/.test(pageCode), 'page must not call fetch() directly');
  });

  it('4. null summary → notFound(), no raw retry', () => {
    contains(pageSrc, ['if (!summary) {', 'notFound();']);
    // No try/catch that could swallow a redirect or trigger a raw fallback.
    assert.ok(!/catch\s*\(/.test(pageSrc), 'page must not catch fetch errors (no raw fallback path)');
  });

  it('5. types the response as the safe VersionSummary contract', () => {
    contains(pageSrc, ["import type { VersionSummary } from '../../../../../lib/quote-types'"]);
  });

  it('6. renders the approved version-metadata / audit fields', () => {
    contains(pageSrc, [
      'summary.versionNumber',
      'summary.label',
      'formatDateTime(summary.createdAt)',
      'summary.statusAtSnapshot',
    ]);
  });

  it('7. renders the approved title / quote-number / trip / count fields', () => {
    contains(pageSrc, [
      'summary.title',
      'summary.quoteNumber',
      'formatDate(summary.travelStartDate)',
      'formatDate(summary.validUntil)',
      'summary.nightCount',
      'summary.roomCount',
      'summary.adults',
      'summary.children',
      'summary.itemCount',
      'summary.dayCount',
    ]);
  });

  it('8. renders the approved pricing fields (sell-side only)', () => {
    contains(pageSrc, [
      'summary.quoteCurrency',
      'summary.totalSell',
      'summary.pricePerPax',
      'summary.fixedPricePerPerson',
    ]);
  });

  it('9. renders the approved readiness fields', () => {
    contains(pageSrc, [
      'summary.hasInclusions',
      'summary.hasExclusions',
      'summary.completeness.ok',
      'summary.completeness.reasons',
      'summary.acceptWillSucceed',
    ]);
  });

  it('10. renders the cost block ONLY on backend presence and never computes it', () => {
    contains(pageSrc, ['{summary.cost ? (', 'summary.cost.totalCost', 'summary.cost.margin', 'summary.cost.marginPercent']);
    // No client-side cost derivation from sell-side figures.
    assert.ok(
      !/summary\.totalSell\s*[-*/]\s*summary\.cost|marginPercent\s*=|totalSell\s*-\s*totalCost/.test(pageSrc),
      'page must not compute cost/margin',
    );
  });

  it('11. renders NO snapshot / PII / supplier / itinerary / token / arbitrary-JSON fields', () => {
    for (const forbidden of [
      'snapshotJson',
      'JSON.stringify',
      'quoteItems',
      'quoteOptions',
      'itineraries',
      'scenarios',
      'pricingSlabs',
      'inclusionsText',
      'exclusionsText',
      'termsNotesText',
      'passenger',
      'passport',
      'contact',
      'company',
      'supplier',
      'baseCost',
      'unitCost',
      'overrideCost',
      'publicToken',
      'accessToken',
      'publicUrl',
      'firstName',
      'lastName',
    ]) {
      assert.ok(!pageCode.includes(forbidden), `page must not reference ${forbidden}`);
    }
  });

  it('12. stays read-only — no buttons / forms / mutations / downloads / client state / logging', () => {
    for (const forbidden of [
      'onClick',
      'onSubmit',
      '<button',
      '<form',
      "method: 'POST'",
      'method: "POST"',
      "method: 'PATCH'",
      "method: 'PUT'",
      "method: 'DELETE'",
      'download',
      "'use client'",
      'useState',
      'console.',
    ]) {
      assert.ok(!pageCode.includes(forbidden), `read-only page must not reference ${forbidden}`);
    }
  });

  it('13. keeps the back-link to the quote', () => {
    contains(pageSrc, ['href={`/quotes/${id}`}', 'className="back-link"', 'Back to quote']);
  });

  it('14. the raw version-detail admin proxy is DELETED', () => {
    assert.ok(!existsSync(rawProxyPath), 'raw versions/:versionId proxy route.ts must be removed');
  });

  it('15. the safe /summary proxy is retained (GET-only, forwards to /summary)', () => {
    contains(summaryProxySrc, ['export async function GET(', '/versions/${versionId}/summary']);
    assert.ok(
      !/export async function (POST|PATCH|PUT|DELETE)\(/.test(summaryProxySrc),
      'summary proxy stays GET-only',
    );
  });

  it('16. the Classic saved-version Link still targets the retained page URL', () => {
    contains(classicWorkspaceSrc, ['href={`/quotes/${quote.id}/versions/${version.id}`}']);
  });
});
