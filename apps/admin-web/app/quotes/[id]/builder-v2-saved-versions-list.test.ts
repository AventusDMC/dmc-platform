import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — VV-3 Slice 1: read-only "Saved versions" metadata list.
// Source-grep tests: the list uses the hardened GET /quotes/:id/versions LIST route
// (metadata only), renders versionNumber/label/createdAt + empty state, refreshes
// after Save version, and NEVER touches the raw detail endpoint or snapshotJson.

const stepSrc = readFileSync(new URL('../../../components/quote/v2/steps/proposal-step.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');
const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const typesSrc = readFileSync(new URL('../../../lib/quote-types.ts', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

describe('Quote Builder V2 — saved versions list (VV-3 Slice 1)', () => {
  it('SavedVersionSummary type is metadata-only', () => {
    contains(typesSrc, [
      'export interface SavedVersionSummary',
      'versionNumber',
      'label',
      'createdAt',
    ]);
    // The metadata type must not carry a snapshot field.
    const typeBlock = typesSrc.slice(
      typesSrc.indexOf('export interface SavedVersionSummary'),
      typesSrc.indexOf('export interface SavedVersionSummary') + 260,
    );
    assert.ok(!/snapshot/i.test(typeBlock), 'SavedVersionSummary must not include snapshot fields');
  });

  it('client fetches the LIST route (GET) and re-fetches after a successful save', () => {
    contains(clientSrc, [
      'const refreshSavedVersions = useCallback',
      '`/api/quotes/${quote.id}/versions`',
      'if (!quote?.id || !canSaveVersion) return',
      'void refreshSavedVersions()', // on load (effect) + after save
      'savedVersions={savedVersions}',
      'savedVersionsLoading={savedVersionsLoading}',
      'savedVersionsError={savedVersionsError}',
    ]);
    // The saved-versions fetch is GET (method appears right after the URL).
    assert.ok(
      /\/versions`,[\s\S]{0,40}method:\s*"GET"/.test(clientSrc),
      'saved-versions fetch must be GET on the list route',
    );
    // Never the raw detail endpoint, and never read a snapshotJson property.
    assert.ok(!/versions\/\$\{[^}]*\}\/\$\{/.test(clientSrc), 'must not build a versions/:versionId detail URL');
    assert.ok(!/\.snapshotJson/.test(clientSrc), 'client must not read a snapshotJson property');
    // The mapped row is metadata only (the map literal names exactly these fields).
    contains(clientSrc, ['const rows: SavedVersionSummary[] = Array.isArray(data)']);
  });

  it('builder threads saved-versions props to ProposalStep', () => {
    contains(builderSrc, [
      'savedVersions?: SavedVersionSummary[]',
      'savedVersions = [],',
      'savedVersions={savedVersions}',
      'savedVersionsLoading={savedVersionsLoading}',
      'savedVersionsError={savedVersionsError}',
    ]);
  });

  it('proposal step renders the metadata list + empty state, no snapshot/raw JSON/cost', () => {
    contains(stepSrc, [
      'savedVersions?: SavedVersionSummary[]',
      'Saved versions',
      'No saved versions yet.',
      'Version {v.versionNumber}',
      'formatSavedVersionDate(v.createdAt)',
    ]);
    // The list must show label metadata but never raw JSON / snapshot / cost.
    assert.ok(!/JSON\.stringify\([\s\S]*saved/i.test(stepSrc), 'no raw JSON dump of versions');
    assert.ok(!/savedVersions[\s\S]{0,400}snapshotJson/.test(stepSrc), 'saved-versions UI must not render snapshotJson');
    assert.ok(!/savedVersions[\s\S]{0,400}(totalCost|totalSell|netCost|margin)/.test(stepSrc), 'saved-versions UI must not render cost/margin');
  });

  it('list is read-only: no lifecycle actions in the saved-versions region', () => {
    // No restore/rollback/set-accepted/send controls tied to the versions list.
    const region = stepSrc.slice(stepSrc.indexOf('Saved versions'), stepSrc.indexOf('Saved versions') + 1200);
    assert.ok(!/restore|rollback|set-accepted|setAccepted/i.test(region), 'no restore/rollback/set-accepted in the list');
  });
});
