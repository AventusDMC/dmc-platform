import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// R.1d-fix — the LIVE Day-by-day workspace (QuoteServicePlanner) must expose an
// obvious day TITLE + narrative editor, saving via the existing
// PATCH /itinerary/day/:id (scalar title/notes only — no QuoteItems, no pricing).

const source = readFileSync(new URL('./QuoteServicePlanner.tsx', import.meta.url), 'utf8');

function expectSourceContains(fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected QuoteServicePlanner to contain: ${fragment}`);
  }
}

describe('R.1d-fix — live day title & narrative editor', () => {
  it('1. exposes a clear "Edit title & narrative" affordance', () => {
    expectSourceContains(['Edit title &amp; narrative']);
  });

  it('2. the day drawer has a Day title input and a Day narrative / notes textarea', () => {
    expectSourceContains([
      'Day title',
      'quote-day-title-input',
      'Day narrative / notes',
      'quote-day-description-textarea',
      'onTitleChange',
      'titleDraft',
    ]);
  });

  it('3. the save button reads "Save title & narrative"', () => {
    expectSourceContains(['Save title & narrative']);
  });

  it('4. save goes through the existing PATCH /itinerary/day/:id with scalar title + notes only', () => {
    expectSourceContains([
      '/itinerary/day/${day.id}',
      "method: 'PATCH'",
      'title: nextTitle',
      'notes: nextContent',
      'titleOverride',
    ]);
  });

  it('5. the editor refreshes the workspace (router.refresh) so the left day list updates', () => {
    // saveDayContent calls router.refresh() after a successful PATCH
    assert.ok(/router\.refresh\(\)/.test(source), 'expected router.refresh() after save');
  });

  it('6. the day-edit save body carries no QuoteItem/pricing fields', () => {
    // The PATCH body for the day editor is exactly { dayNumber, title, notes }.
    const bodyIdx = source.indexOf('title: nextTitle');
    const window = source.slice(bodyIdx - 200, bodyIdx + 200);
    assert.ok(!/sellPrice|markup|totalSell|overrideCost|quoteItem/i.test(window), 'no pricing/item fields in the day-edit PATCH body');
  });
});
