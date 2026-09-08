import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const linkSrc = readFileSync(new URL('../../../components/quote/v2/steps/edit-in-classic-link.tsx', import.meta.url), 'utf8');
const experiencesSrc = readFileSync(new URL('../../../components/quote/v2/steps/experiences-step.tsx', import.meta.url), 'utf8');
const transportSrc = readFileSync(new URL('../../../components/quote/v2/steps/transport-step.tsx', import.meta.url), 'utf8');

function contains(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(src.includes(f), `Expected source to contain: ${f}`);
  }
}
function excludes(src: string, fragments: string[]) {
  for (const f of fragments) {
    assert.ok(!src.includes(f), `Expected source to NOT contain: ${f}`);
  }
}

// The step components remain mutation-inert: any item create/remove is delegated to
// handler PROPS (onAddItem/onPreviewAddItem/onRemoveItem/…), never a direct step fetch.
// The shipped Add-item forms DO perform GET-only reference reads (/api/activities,
// /api/services) to populate dropdowns — so a blanket "no fetch(" is superseded; the
// meaningful guard is "no mutation method + no item-mutation endpoint wiring".
const MUTATION_TOKENS = [
  "method: 'POST'",
  "method: 'PATCH'",
  "method: 'DELETE'",
  'method: "POST"',
  'method: "PATCH"',
  'method: "DELETE"',
];

describe('Quote Builder V2 — contextual "Edit in Classic" item links', () => {
  it('link helper exports a pure href builder and a presentational anchor', () => {
    contains(linkSrc, [
      'export function buildClassicItemHref',
      'export function EditInClassicLink',
      'Edit in Classic',
      // Stable Classic deep link: ?tab=services|transport + #quote-item-<id> anchor.
      '`${classicHref}?tab=${tab}`',
      '`${base}#quote-item-${quoteItemId}`',
      'href={href}',
    ]);
    // The link must be navigation-only — never a mutation/fetch.
    excludes(linkSrc, MUTATION_TOKENS);
  });

  it('Experiences rows render an "Edit in Classic" link to the services tab', () => {
    contains(experiencesSrc, [
      'import { EditInClassicLink, buildClassicItemHref } from "./edit-in-classic-link"',
      'buildClassicItemHref(classicHref, "services", exp.quoteItemId)',
      '<EditInClassicLink href={classicItemHref} />',
      'classicHref={classicHref}',
    ]);
    // Still mutation-inert: no mutation method in the experiences step (item create/
    // remove is delegated to handler props). Reference-data dropdowns are GET-only.
    excludes(experiencesSrc, MUTATION_TOKENS);
    contains(experiencesSrc, ['fetch("/api/activities"', 'fetch("/api/services"']);
    // The existing limited client-text editor must remain.
    contains(experiencesSrc, ['DisplayTextEditor', 'onUpdateDisplayText']);
  });

  it('Transport rows render an "Edit in Classic" link to the transport tab', () => {
    contains(transportSrc, [
      'import { EditInClassicLink, buildClassicItemHref } from "./edit-in-classic-link"',
      'buildClassicItemHref(classicHref, "transport", svc.quoteItemId)',
      '<EditInClassicLink href={classicItemHref} />',
      'classicHref={classicHref}',
    ]);
    // Still pricing-inert: no mutation introduced in the transport step.
    excludes(transportSrc, MUTATION_TOKENS);
    // The existing limited client-text editor (transportLabel) must remain.
    contains(transportSrc, ['DisplayTextEditor', 'transportLabel']);
  });

  it('does NOT add any service/transport add/edit/delete or rate/supplier controls', () => {
    // No item-CRUD endpoints, no recalculation CALL, no reorder ENDPOINT are wired from
    // these steps. Tokens target actual calls/endpoints, not the words "recalculation"/
    // "reordering" that appear in explanatory comments: 'recalculateQuoteTotals' (the
    // real recalc call) and 'items/reorder' (the real reorder endpoint).
    excludes(experiencesSrc, ['/items', 'recalculateQuoteTotals', 'items/reorder', 'assign-service', 'detach-contract']);
    excludes(transportSrc, ['/items', 'recalculateQuoteTotals', 'items/reorder', 'assign-service', 'detach-contract']);
  });
});
