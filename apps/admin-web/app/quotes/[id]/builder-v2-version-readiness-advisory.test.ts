import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — VV-2 Slice B: version-readiness advisory. Source-grep tests
// (same convention as builder-v2-save-version): pin the non-blocking Proposal-step
// advisory that reads GET /quotes/:id/version-readiness (backend PR #795) and warns
// when the quote has no saved / no completeness-passing version — WITHOUT disabling
// Mark-as-Sent, and reusing the VV-1 save handler for "Save a version now".

const stepSrc = readFileSync(new URL('../../../components/quote/v2/steps/proposal-step.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');
const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const proxySrc = readFileSync(new URL('../../api/quotes/[id]/version-readiness/route.ts', import.meta.url), 'utf8');
const typesSrc = readFileSync(new URL('../../../lib/quote-types.ts', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

describe('Quote Builder V2 — version-readiness advisory (VV-2 Slice B)', () => {
  it('type VersionReadiness exposes the read-only readiness shape', () => {
    contains(typesSrc, [
      'export interface VersionReadiness',
      'versionCount',
      'hasSavedVersion',
      'hasCompleteVersion',
      'latestVersionNumber',
      'latestVersionComplete',
      'acceptWillSucceed',
      'reasons',
    ]);
  });

  it('proxy is a read-only GET forwarding to /quotes/:id/version-readiness', () => {
    contains(proxySrc, [
      'export async function GET(',
      '/version-readiness',
      'buildActorHeaders(request)',
    ]);
    // No write verbs in the proxy.
    assert.ok(!/export async function (POST|PATCH|PUT|DELETE)\(/.test(proxySrc), 'proxy must be GET-only');
  });

  it('client fetches readiness on load and re-fetches after a successful save', () => {
    contains(clientSrc, [
      'const refreshVersionReadiness = useCallback',
      '`/api/quotes/${quote.id}/version-readiness`',
      'if (!quote?.id || !canSaveVersion) return',
      'useEffect(() => {',
      'void refreshVersionReadiness()', // re-fetch after successful save + on load
      'versionReadiness={versionReadiness}',
      'versionReadinessLoading={versionReadinessLoading}',
      'versionReadinessError={versionReadinessError}',
    ]);
    // The readiness fetch uses GET (method appears immediately after the URL).
    assert.ok(
      /version-readiness`,[\s\S]{0,40}method:\s*"GET"/.test(clientSrc),
      'version-readiness fetch must be GET',
    );
  });

  it('builder threads readiness props to ProposalStep', () => {
    contains(builderSrc, [
      'versionReadiness?: VersionReadiness | null',
      'versionReadiness = null,',
      'versionReadiness={versionReadiness}',
      'versionReadinessLoading={versionReadinessLoading}',
      'versionReadinessError={versionReadinessError}',
    ]);
  });

  it('proposal step renders the advisory for no-saved-version and no-complete-version', () => {
    contains(stepSrc, [
      'versionReadiness?: VersionReadiness | null',
      'This quote has no saved proposal version. The client will not be able to Accept until one is saved.',
      'Saved versions do not yet pass completeness. Accept may fail until a complete version is saved.',
      'A saved proposal version is ready for the client to Accept',
      'Save a version now',
    ]);
  });

  it('“Save a version now” reuses the VV-1 save handler', () => {
    // The advisory button calls the same internal handleSaveVersion (VV-1), so a
    // save re-uses onSaveVersion and the client then re-fetches readiness.
    const advisoryButton = /Save a version now[\s\S]*?onClick=\{handleSaveVersion\}|onClick=\{handleSaveVersion\}[\s\S]*?Save a version now/;
    assert.ok(advisoryButton.test(stepSrc), 'advisory Save button must call handleSaveVersion');
  });

  it('advisory does NOT disable Mark-as-Sent', () => {
    // Mark-as-Sent stays gated only by canSend/saving — the advisory must not feed
    // versionReadiness into sendDisabled.
    contains(stepSrc, ['const sendDisabled = !canSend || saving']);
    assert.ok(
      !/sendDisabled[\s\S]{0,60}versionReadiness/.test(stepSrc),
      'Mark-as-Sent disabled state must not depend on versionReadiness',
    );
    // The step is presentational: it performs no direct network writes (all IO is
    // delegated via props), so the advisory cannot mutate status/invoice/booking.
    assert.ok(!stepSrc.includes('fetch('), 'proposal step must not call fetch directly');
  });
});
