import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Quote Builder V2 — VV-1: Save proposal version. Source-grep tests (same
// convention as builder-v2-add-activity-preview-confirm): pinning the V2
// save-version affordance that reuses the EXISTING createVersion route
// (POST /quotes/:id/versions) as a SNAPSHOT ONLY — no status change, no invoice,
// no booking, no send — plus the role/status gate and the success/error UI.

const stepSrc = readFileSync(new URL('../../../components/quote/v2/steps/proposal-step.tsx', import.meta.url), 'utf8');
const builderSrc = readFileSync(new URL('../../../components/quote/v2/quote-builder-v2.tsx', import.meta.url), 'utf8');
const clientSrc = readFileSync(new URL('./builder-v2/builder-v2-client.tsx', import.meta.url), 'utf8');
const pageSrc = readFileSync(new URL('./builder-v2/page.tsx', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}

describe('Quote Builder V2 — save proposal version (VV-1)', () => {
  it('client saves a version via the existing createVersion proxy (POST /versions), no status/invoice', () => {
    contains(clientSrc, [
      'const handleSaveVersion = async',
      '`/api/quotes/${q.id}/versions`',
      'method: "POST"',
      'versionNumber: typeof parsed?.versionNumber === "number" ? parsed.versionNumber : null',
      'onSaveVersion={canSaveVersion ? (label?: string) => handleSaveVersion(quote!, label) : undefined}',
    ]);
    // The save action must NOT touch status / sent / accept / booking.
    assert.ok(!/handleSaveVersion[\s\S]*?\/status|handleSaveVersion[\s\S]*?convert-to-booking|handleSaveVersion[\s\S]*?"SENT"/.test(clientSrc), 'save-version must not change status/booking');
  });

  it('builder threads onSaveVersion + canSaveVersion to ProposalStep', () => {
    contains(builderSrc, [
      'onSaveVersion?:',
      'canSaveVersion = false,',
      'onSaveVersion={onSaveVersion}',
      'canSaveVersion={canSaveVersion}',
    ]);
  });

  it('proposal step exposes the Save-version button + optional label + success state', () => {
    contains(stepSrc, [
      'onSaveVersion?: (label?: string) => Promise<{ versionNumber?: number | null }>',
      'canSaveVersion?: boolean',
      'const handleSaveVersion = async',
      'onSaveVersion(label || undefined)',
      'Save version',
      'Version label (optional)',
      'Saved proposal version {savedVersionNumber}',
    ]);
    // Snapshot-only messaging: no cost/margin, no "sent"/"invoice" mutation wording in the button.
    assert.ok(!/Projected (net )?cost|Projected margin/i.test(stepSrc), 'save-version UI must not show cost/margin');
  });

  it('page gates canSaveVersion by role (admin/viewer/finance) + editable status', () => {
    contains(pageSrc, [
      'const canSaveVersion =',
      'hasRequiredRole(role, ["admin", "viewer", "finance"])',
      'PREVIEW_EDITABLE_STATUSES.has(quoteStatusCode)',
      'canSaveVersion={canSaveVersion}',
    ]);
  });
});
