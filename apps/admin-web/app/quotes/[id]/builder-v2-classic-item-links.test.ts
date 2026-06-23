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

const MUTATION_TOKENS = [
  'fetch(',
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
    // Still pricing-inert: no mutation introduced in the experiences step.
    excludes(experiencesSrc, MUTATION_TOKENS);
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
    // No item-CRUD endpoints, no recalculation, no reorder are wired from these steps.
    excludes(experiencesSrc, ['/items', 'recalc', 'reorder', 'assign-service', 'detach-contract']);
    excludes(transportSrc, ['/items', 'recalc', 'reorder', 'assign-service', 'detach-contract']);
  });
});
