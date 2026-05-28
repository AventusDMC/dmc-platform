import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Hotel Contract Correction Workspace v1 — source-grep tests.
// Locks in the behavioural invariants of the page + component +
// wiring of the deep-links from the Health Dashboard.

const workspaceSource = readFileSync(new URL('./CorrectionWorkspace.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');

describe('Correction Workspace page wiring', () => {
  it('loads the composite workspace endpoint in a single round trip', () => {
    assert.match(pageSource, /\/api\/hotel-contract-health\/contracts\/\$\{contractId\}\/correction-workspace/);
  });

  it('returns notFound when the endpoint cannot load', () => {
    assert.match(pageSource, /notFound\(\)/);
  });

  it('uses Next.js dynamic="force-dynamic" so per-contract data is always fresh', () => {
    assert.match(pageSource, /export const dynamic = 'force-dynamic'/);
  });
});

describe('Correction Workspace component — required sections', () => {
  it('renders the top summary card with health score + confidence status', () => {
    assert.match(workspaceSource, /Health score/);
    assert.match(workspaceSource, /Confidence/);
  });

  it('shows an Operational Impact panel with active quote items + future bookings', () => {
    assert.match(workspaceSource, /Operational impact/);
    assert.match(workspaceSource, /Active quote items/);
    assert.match(workspaceSource, /Future bookings/);
  });

  it('surfaces VERIFIED gating with blockers + warnings', () => {
    assert.match(workspaceSource, /Mark Verified/);
    assert.match(workspaceSource, /Blockers \(resolve before Verify\)/);
    assert.match(workspaceSource, /Move to Needs Review/);
  });

  it('allows reverting a VERIFIED contract back to NEEDS_REVIEW (safe downgrade)', () => {
    assert.match(workspaceSource, /Revert VERIFIED → Needs Review/);
  });

  it('renders all four repair sections (room mapping, supplements, seasons, pricing)', () => {
    assert.match(workspaceSource, /Room Mapping Suggestions/);
    assert.match(workspaceSource, /Supplement Conflicts/);
    assert.match(workspaceSource, /Season Conflicts/);
    assert.match(workspaceSource, /Pricing Completeness/);
  });

  it('includes the Pricing Interpretation Preview panel', () => {
    assert.match(workspaceSource, /Pricing Interpretation/);
    assert.match(workspaceSource, /Read-only view of how the ERP interprets/);
  });

  it('renders a visual season timeline when seasons exist', () => {
    assert.match(workspaceSource, /SeasonTimeline/);
    assert.match(workspaceSource, /data-testid="season-timeline"/);
  });

  it('offers a Re-upload Diff section pointing operators to the existing import flow', () => {
    assert.match(workspaceSource, /Side-by-side Diff/);
    assert.match(workspaceSource, /\/contracts\/import\?contractId=/);
  });
});

describe('Correction Workspace mutations — safe + narrow', () => {
  it('supplement repairs go through the dedicated PATCH /supplements/:id endpoint', () => {
    assert.match(workspaceSource, /\/api\/hotel-contract-health\/supplements\//);
    assert.match(workspaceSource, /method: 'PATCH'/);
  });

  it('confidence changes go through the existing safe PATCH /confidence endpoint', () => {
    assert.match(workspaceSource, /\/confidence/);
  });

  it('never issues DELETE or PUT — no destructive overwrite', () => {
    assert.doesNotMatch(workspaceSource, /method:\s*'DELETE'/);
    assert.doesNotMatch(workspaceSource, /method:\s*'PUT'/);
  });

  it('never references pricing engine internals', () => {
    const forbidden = ['quoteItem.update', 'quoteItem.delete', 'hotelRate.update', 'hotelRate.delete', 'sellPrice', 'costPrice'];
    for (const banned of forbidden) {
      assert.ok(!workspaceSource.includes(banned), `CorrectionWorkspace.tsx must not reference "${banned}"`);
    }
  });

  it('supplement repair actions are limited to the four safe operations', () => {
    assert.match(workspaceSource, /'DEACTIVATE'/);
    assert.match(workspaceSource, /'SET_CHARGE_BASIS'/);
    assert.match(workspaceSource, /'SET_AMOUNT'|SET_AMOUNT/);
    assert.match(workspaceSource, /'MARK_INTENTIONAL'/);
  });
});

describe('Open Correction Workspace deep links', () => {
  it('Health Dashboard correction queue row has a deep link', () => {
    const dashboardSource = readFileSync(
      new URL('../../../hotel-contract-health/HotelContractHealthDashboard.tsx', import.meta.url),
      'utf8',
    );
    assert.match(dashboardSource, /Open Correction Workspace/);
    assert.match(dashboardSource, /\/hotel-contracts\/\$\{row\.contractId\}\/correction/);
  });

  it('Health Dashboard validation drill-down also offers the deep link', () => {
    const dashboardSource = readFileSync(
      new URL('../../../hotel-contract-health/HotelContractHealthDashboard.tsx', import.meta.url),
      'utf8',
    );
    // Two Link occurrences total (queue row + validation panel).
    const matches = dashboardSource.match(/Open Correction Workspace/g) || [];
    assert.ok(matches.length >= 2, 'expected at least two Open Correction Workspace deep-links');
  });

  // Legacy hero-deep-link assertion removed: the
  // /hotels/contracts/[contractId]/HotelContractWorkspace.tsx file was
  // deleted during the v1 → v2 cutover. The correction-queue deep link
  // is still surfaced from the Contract Health dashboard (see the two
  // "Open Correction Workspace" link occurrences asserted above), which
  // is the operator entry point for triaging contracts.
});
