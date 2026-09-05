import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  canWriteQuote,
  canExportQuote,
  canPerformOperationalQuoteWrites,
  canReadQuoteAsViewer,
  canViewFullPassengerPii,
  canAccessFinance,
  type SessionRole,
} from '../../lib/auth-session';

// CP-N4b — strict read-only Viewer, frontend gating. Behavioral tests for the canonical
// permission helpers (they must mirror the deployed CP-N4a backend allowlists and fail
// closed) + source-wiring tests proving the quote UI gates every write/capability/export
// control on those helpers / trusted role booleans. The backend gate remains
// authoritative; these are UX-defense checks.

const workspaceSrc = readFileSync(new URL('./ClassicQuoteWorkspace.tsx', import.meta.url), 'utf8');
const plannerSrc = readFileSync(new URL('./QuoteServicePlanner.tsx', import.meta.url), 'utf8');
const roomingSrc = readFileSync(new URL('./QuoteRoomingPanel.tsx', import.meta.url), 'utf8');
const itineraryWsSrc = readFileSync(new URL('./QuoteItineraryWorkspace.tsx', import.meta.url), 'utf8');
const listPageSrc = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');
const listTableSrc = readFileSync(new URL('../QuotesTable.tsx', import.meta.url), 'utf8');
const builderV2PageSrc = readFileSync(new URL('./builder-v2/page.tsx', import.meta.url), 'utf8');
const authSessionSrc = readFileSync(new URL('../../lib/auth-session.ts', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

// Whitespace-normalized containment — robust to JSX indentation/line-wrapping.
function nz(s: string) {
  return s.replace(/\s+/g, ' ');
}
function containsLoose(src: string, fragments: string[]) {
  const n = nz(src);
  for (const f of fragments) {
    assert.ok(n.includes(nz(f)), `Expected source to contain (loose): ${f}`);
  }
}

const ALL_ROLES: (SessionRole | null | undefined)[] = [
  'admin', 'super_admin', 'finance', 'operations', 'viewer', 'agent', 'agent_admin', null, undefined,
];

describe('CP-N4b — canonical permission helpers (behavioral, fail-closed)', () => {
  it('canWriteQuote = admin/super_admin/finance only', () => {
    for (const r of ALL_ROLES) {
      const expected = r === 'admin' || r === 'super_admin' || r === 'finance';
      assert.equal(canWriteQuote(r as SessionRole), expected, `canWriteQuote(${r})`);
    }
  });
  it('canPerformOperationalQuoteWrites = admin/super_admin/operations only', () => {
    for (const r of ALL_ROLES) {
      const expected = r === 'admin' || r === 'super_admin' || r === 'operations';
      assert.equal(canPerformOperationalQuoteWrites(r as SessionRole), expected, `ops(${r})`);
    }
  });
  it('canExportQuote = admin/super_admin/finance/operations only', () => {
    for (const r of ALL_ROLES) {
      const expected = r === 'admin' || r === 'super_admin' || r === 'finance' || r === 'operations';
      assert.equal(canExportQuote(r as SessionRole), expected, `export(${r})`);
    }
  });
  it('viewer is read-only: reads yes, all action helpers no', () => {
    assert.equal(canReadQuoteAsViewer('viewer'), true);
    assert.equal(canWriteQuote('viewer'), false);
    assert.equal(canExportQuote('viewer'), false);
    assert.equal(canPerformOperationalQuoteWrites('viewer'), false);
    assert.equal(canViewFullPassengerPii('viewer'), false);
    assert.equal(canAccessFinance('viewer'), false);
  });
  it('agent / agent_admin / missing / unknown fail closed for every action helper', () => {
    for (const r of ['agent', 'agent_admin', null, undefined, 'marketing-unknown']) {
      assert.equal(canWriteQuote(r as SessionRole), false, `write(${r})`);
      assert.equal(canExportQuote(r as SessionRole), false, `export(${r})`);
      assert.equal(canPerformOperationalQuoteWrites(r as SessionRole), false, `ops(${r})`);
    }
  });
});

describe('CP-N4b — Classic workspace gates every write/capability/export control', () => {
  it('computes the role booleans from the trusted session role', () => {
    contains(workspaceSrc, [
      'const canWrite = canWriteQuote(sessionRole)',
      'const canExport = canExportQuote(sessionRole)',
      'const canOpsWrite = canPerformOperationalQuoteWrites(sessionRole)',
      'const showWriteControls = canWrite && !quoteReadOnly',
      "import { readSessionActor, canAccessFinance, canViewFullPassengerPii, canWriteQuote, canExportQuote, canPerformOperationalQuoteWrites",
    ]);
  });

  it('Save version / Send / status / cancel require a write role (showWriteControls)', () => {
    contains(workspaceSrc, [
      '{showWriteControls ? <SaveQuoteVersionButton',
      '{showWriteControls ? <SendQuoteButton',
      '{showWriteControls ? <CancelQuoteButton',
    ]);
    containsLoose(workspaceSrc, ['{showWriteControls ? ( <RowDetailsPanel']);
    // No write control is left gated by status alone (quoteReadOnly) without a role gate.
    assert.ok(!workspaceSrc.includes('{!quoteReadOnly ? <SaveQuoteVersionButton'), 'SaveQuoteVersion must be role-gated');
    assert.ok(!workspaceSrc.includes('{!quoteReadOnly ? <SendQuoteButton'), 'Send must be role-gated');
    assert.ok(!workspaceSrc.includes('{!quoteReadOnly ? <CancelQuoteButton'), 'Cancel must be role-gated');
  });

  it('booking conversion + revise + edit/delete + hotel-options + group-pricing + invoice require canWrite', () => {
    contains(workspaceSrc, [
      ') : !canWrite ? null : quoteReadOnly ? (', // Convert gated (header/review/sidebar)
      '{canWrite ? <ReviseQuoteButton',
      'Read-only access — quote setup cannot be edited with your role.', // edit/delete gate
      '{canWrite ? <QuoteInvoiceSection',
    ]);
    containsLoose(workspaceSrc, [
      '{canWrite ? ( <QuoteHotelOptionSets',
      '{canWrite ? ( <QuoteTransportBulkAssign',
      '{canWrite ? ( <QuoteGroupPricing',
    ]);
  });

  it('Share/public-link must NOT mount for read-only roles (capability control)', () => {
    containsLoose(workspaceSrc, ['{canWrite ? ( <ShareQuoteButton']);
    // Every ShareQuoteButton mount is canWrite-gated (count of mounts == count of gated mounts).
    const n = nz(workspaceSrc);
    const total = (n.match(/<ShareQuoteButton/g) || []).length;
    const gated = (n.match(/canWrite \? \( <ShareQuoteButton/g) || []).length;
    assert.ok(total >= 1, 'expected ShareQuoteButton mounts to exist');
    assert.equal(total, gated, 'every ShareQuoteButton mount must be canWrite-gated');
  });

  it('PDF/export controls require canExport', () => {
    contains(workspaceSrc, ['{canExport ? <DownloadPdfButton']);
    containsLoose(workspaceSrc, ['{canExport ? ( <ProposalDocumentActions']);
    assert.ok(!/\n\s*<DownloadPdfButton\b/.test(workspaceSrc), 'DownloadPdfButton must be canExport-gated');
  });

  it('finance/cost margin% in the insights line is gated by canViewCost', () => {
    containsLoose(workspaceSrc, ['{canViewCost ? ` · ${quote.totalSell > 0']);
  });

  it('rooming edits are threaded to the operational-write gate', () => {
    contains(workspaceSrc, ['canEditRooming={canOpsWrite}']);
  });
});

describe('CP-N4b — child components gate on trusted booleans', () => {
  it('QuoteItineraryWorkspace forwards canEditRooming to the rooming panel', () => {
    contains(itineraryWsSrc, ['canEditRooming: boolean;', 'canEditRooming,', 'canEdit={canEditRooming}']);
  });
  it('QuoteRoomingPanel gates all mutations on canEdit (fail-closed default)', () => {
    contains(roomingSrc, ['canEdit = false', '{canEdit ? (', 'canEdit?: boolean;']);
  });
  it('QuoteServicePlanner derives canEditItems from the session role and gates item CRUD + editor drawer', () => {
    contains(plannerSrc, [
      "import { canWriteQuote } from '../../lib/auth-session'",
      'const canEditItems = canWriteQuote(plannerProps.sessionRole ?? null)',
      'canEditItems={canEditItems}',
      'open={canEditItems && Boolean(activeServicePanel)}',
      '{canEditItems && activeServicePanel ? (',
    ]);
    containsLoose(plannerSrc, ['{canEditItems ? ( <button type="button" className="secondary-button" onClick={() => onEdit(item)}']);
  });
  it('DayNarrativePanel (itinerary mutation) gates on canEdit', () => {
    contains(plannerSrc, ['canEdit: boolean;', 'canEdit={canEditItems}']);
  });
  it('template import / save-as-template require a write role', () => {
    contains(plannerSrc, ['canWriteQuote(props.sessionRole ?? null) ? (']);
  });
});

describe('CP-N4b — quote list create + row actions gate on canWrite', () => {
  it('list page computes canWrite from the trusted session role and gates create links', () => {
    contains(listPageSrc, [
      "import { readSessionActor, canWriteQuote } from '../lib/auth-session'",
      'const canWrite = canWriteQuote(readSessionActor(',
      'canWrite={canWrite}',
    ]);
    containsLoose(listPageSrc, ['{canWrite ? ( <Link href="/quotes/new"']);
  });
  it('QuotesTable gates edit/delete/convert on canWrite (fail-closed default)', () => {
    contains(listTableSrc, ['canWrite = false', 'canWrite?: boolean;', '{canWrite ? (', ') : canWrite && quoteId && (quote.status']);
  });
});

describe('CP-N4b — Builder V2 remains role-gated (reference; unchanged)', () => {
  it('builder-v2 computes capabilities from the trusted role + passes booleans to the client', () => {
    contains(builderV2PageSrc, ['canViewCostMargin', 'canSaveVersion', 'canCreateBooking']);
  });
});

describe('CP-N4b — auth-session helper source documents the fail-closed allowlists', () => {
  it('helpers exist with the exact role sets', () => {
    contains(authSessionSrc, [
      'export function canWriteQuote',
      'export function canPerformOperationalQuoteWrites',
      'export function canExportQuote',
      'export function canReadQuoteAsViewer',
    ]);
  });
});
