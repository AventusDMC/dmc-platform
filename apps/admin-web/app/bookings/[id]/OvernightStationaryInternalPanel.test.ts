import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Phase 12F-3B1 — INTERNAL-ONLY overnight/stationary breakdown panel on the
// supplier-confirmation page. Source-grep assertions (admin-web has no DOM render
// harness): the panel is internal-only, read-only, reuses the 12F-3A shadow
// endpoint, and is structurally separate from the supplier email body + send path.

const panelSource = readFileSync(new URL('./OvernightStationaryInternalPanel.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('./supplier-confirmation/page.tsx', import.meta.url), 'utf8');
const previewSource = readFileSync(new URL('./SupplierConfirmationPreview.tsx', import.meta.url), 'utf8');
// Cross-workspace: the API supplier-confirmation email assembly (buildBody + the
// whitelisted PreviewServiceLine). Proves the supplier-visible body is unaware of OS.
const apiConfirmationSource = readFileSync(
  new URL('../../../../api/src/bookings/supplier-confirmation-preview.ts', import.meta.url),
  'utf8',
);

function expectContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}
function expectAbsent(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(!source.includes(fragment), `Expected source to NOT contain: ${fragment}`);
  }
}

describe('12F-3B1 — internal overnight/stationary panel', () => {
  it('1. renders the internal OS breakdown fields (cost delta, per-day rows, amounts)', () => {
    expectContains(panelSource, [
      'overnightStationaryLiveApply',
      'costDelta',
      'wouldApplyCost',
      'sellDelta',
      'osMoney(l.amount, l.currency)',
    ]);
  });

  it('2. has a safe no-adjustment / hidden state when the breakdown is absent', () => {
    expectContains(panelSource, [
      'No overnight/stationary adjustment for this booking.',
      'if (!enabled) return null', // diagnostic preview OFF → render nothing
      'const hasBreakdown =',
    ]);
  });

  it('3. is clearly marked Internal only — not sent to supplier', () => {
    expectContains(panelSource, ['Internal only — not sent to supplier']);
    // The page mounts it with that guarantee in a comment too.
    expectContains(pageSource, ['INTERNAL-ONLY', 'NEVER part of the supplier email']);
  });

  it('4. shows the would-apply / preview status when the live-apply flag is OFF', () => {
    expectContains(panelSource, [
      'Would apply / preview',
      'overnightStationaryLiveApplyEnabled',
      '(live apply flag is OFF)',
    ]);
  });

  it('5. renders per-day OS rows (day, kind, city, supplier, vehicle class/name, outcome, amount)', () => {
    expectContains(panelSource, [
      'Day {l.dayNumber} ({l.kind})',
      '{l.city',
      'supplier {l.supplierId}',
      '{l.vehicleClass',
      '{l.vehicleName',
      '{l.outcome',
      'Internal cost only — not added to client sell total.',
    ]);
  });

  it('6. the supplier email body assembly is unaware of OS data (no leak into the email)', () => {
    // buildBody / PreviewServiceLine in the API must never reference any OS field.
    expectAbsent(apiConfirmationSource, [
      'overnightStationary',
      'costDelta',
      'wouldApplyCost',
      'Internal cost only',
      'package-pricing-shadow',
    ]);
  });

  it('7. read-only: the panel only does a GET to the existing shadow endpoint (no writes)', () => {
    expectContains(panelSource, ['/api/transport-pricing/quotes/', 'package-pricing-shadow', "cache: 'no-store'"]);
    // No mutation verbs / methods anywhere in the panel.
    expectAbsent(panelSource, ["method: 'POST'", "method: 'PUT'", "method: 'PATCH'", "method: 'DELETE'", 'supplier-confirmation/send']);
  });

  it('8. gated by the same diagnostic preview flag as 12F-3A (default OFF → no fetch)', () => {
    expectContains(panelSource, ['NEXT_PUBLIC_TRANSPORT_PACKAGE_OPTIONS_PREVIEW', 'if (!enabled || !quoteId) return;']);
  });

  it('9. the page mounts the panel separately from the preview, keyed by the source quoteId', () => {
    expectContains(pageSource, [
      "import { OvernightStationaryInternalPanel } from '../OvernightStationaryInternalPanel'",
      '<OvernightStationaryInternalPanel quoteId={',
      'booking.quoteId || booking.sourceQuoteId',
    ]);
  });

  it('10. the send/preview component (SupplierConfirmationPreview) is untouched by 12F-3B1', () => {
    // The send path component must not know about the OS panel/breakdown.
    expectAbsent(previewSource, ['OvernightStationaryInternalPanel', 'overnightStationary', 'package-pricing-shadow']);
    // Send action + scoped body remain (proof it still exists, unchanged here).
    expectContains(previewSource, ['supplier-confirmation/send', 'Send confirmation request']);
  });
});
