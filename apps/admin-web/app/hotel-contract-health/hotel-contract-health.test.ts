import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Hotel Contract Stabilization & Trustworthiness v2 — source-grep tests
// for the admin dashboard + dashboard component. Mirrors the established
// admin-web test pattern (no React DOM hosted in the runner; we assert
// behavioural invariants on the file source).

describe('Hotel Contract Health admin page wiring', () => {
  const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
  const dashboardSource = readFileSync(new URL('./HotelContractHealthDashboard.tsx', import.meta.url), 'utf8');
  const proxySource = readFileSync(
    new URL('../api/hotel-contract-health/[...path]/route.ts', import.meta.url),
    'utf8',
  );

  it('page lazy-loads dashboard + queue separately so a slow queue never blocks the dashboard', () => {
    assert.match(pageSource, /Promise\.all\(\[loadDashboard\(\), loadQueue\(\)\]\)/);
    assert.match(pageSource, /\/api\/hotel-contract-health\/dashboard/);
    assert.match(pageSource, /\/api\/hotel-contract-health\/correction-queue/);
  });

  it('dashboard surfaces all 7 health sections required by the spec', () => {
    assert.match(dashboardSource, /Imported but unverified/);
    assert.match(dashboardSource, /Missing meal plans/);
    assert.match(dashboardSource, /Suspicious pricing/);
    assert.match(dashboardSource, /Missing occupancy mapping/);
    assert.match(dashboardSource, /Supplement conflicts/);
    assert.match(dashboardSource, /Overlapping seasons/);
    assert.match(dashboardSource, /Missing child policy/);
  });

  it('dashboard renders all 6 confidence buckets with their canonical labels', () => {
    assert.match(dashboardSource, /'IMPORTED_UNVERIFIED'/);
    assert.match(dashboardSource, /'NEEDS_REVIEW'/);
    assert.match(dashboardSource, /'PRICING_INCOMPLETE'/);
    assert.match(dashboardSource, /'SUPPLEMENT_REVIEW_REQUIRED'/);
    assert.match(dashboardSource, /'SEASON_CONFLICT'/);
    assert.match(dashboardSource, /'VERIFIED'/);
  });

  it('dashboard updates confidence via the safe PATCH endpoint — never via bulk overwrite', () => {
    assert.match(dashboardSource, /method: 'PATCH'/);
    assert.match(dashboardSource, /\/confidence/);
    // Negative: no destructive contract replacement / blind overwrite.
    assert.doesNotMatch(dashboardSource, /method:\s*'DELETE'/);
    assert.doesNotMatch(dashboardSource, /method:\s*'PUT'/);
  });

  it('dashboard offers the Pricing Interpretation Preview before saving corrections', () => {
    assert.match(dashboardSource, /Pricing interpretation preview/);
    assert.match(dashboardSource, /Read-only view of how the ERP interprets/);
  });

  it('proxy wires the wildcard catch-all so all sub-paths route correctly', () => {
    assert.match(proxySource, /\$\{API_BASE_URL\}\/hotel-contract-health/);
    assert.match(proxySource, /export async function GET/);
    assert.match(proxySource, /export async function POST/);
    assert.match(proxySource, /export async function PATCH/);
  });
});

describe('Hotel Contract Health is safe (no destructive operations from admin)', () => {
  const dashboardSource = readFileSync(new URL('./HotelContractHealthDashboard.tsx', import.meta.url), 'utf8');
  const proxySource = readFileSync(
    new URL('../api/hotel-contract-health/[...path]/route.ts', import.meta.url),
    'utf8',
  );

  it('dashboard never references pricing engine internals', () => {
    const forbidden = ['quoteItem.update', 'quoteItem.delete', 'hotelRate.update', 'hotelRate.delete', 'sellPrice', 'costPrice'];
    for (const banned of forbidden) {
      assert.ok(!dashboardSource.includes(banned), `HotelContractHealthDashboard.tsx must not reference "${banned}"`);
    }
  });

  it('proxy does not expose DELETE — no destructive contract replacement', () => {
    assert.doesNotMatch(proxySource, /export async function DELETE/);
  });
});
