import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Phase R.1d — make editing a tailor-made itinerary day's TITLE and NARRATIVE
// obvious in the Day-by-day workspace. These are source-grep assertions over the
// existing day-edit components (no new endpoint; reuses PATCH /itinerary/day/:id).

const formSource = readFileSync(new URL('./QuoteItineraryDayForm.tsx', import.meta.url), 'utf8');
const tabSource = readFileSync(new URL('./QuoteItineraryTab.tsx', import.meta.url), 'utf8');
const actionsSource = readFileSync(new URL('../../components/InlineEntityActions.tsx', import.meta.url), 'utf8');

function expectSourceContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('Phase R.1d — editable day title & narrative controls', () => {
  it('1. the day form renders clearly-labelled title input + narrative textarea', () => {
    expectSourceContains(formSource, [
      'Day title',
      'Day narrative / notes',
      'Edit day title & narrative',
      '<input value={title}',
      '<textarea',
      'value={notes}',
    ]);
  });

  it('2. Save uses the existing PATCH /itinerary/day/:id update endpoint and refreshes', () => {
    expectSourceContains(formSource, [
      '/itinerary/day/${dayId}',
      "method: dayId ? 'PATCH'",
      'router.refresh()',
      'Save title & narrative',
    ]);
  });

  it('3. the editor only sends day scalar fields — no QuoteItems, no pricing, no relation writes', () => {
    // body posts only the day shell fields
    expectSourceContains(formSource, ['dayNumber:', 'title,', 'notes,', 'sortOrder:', 'isActive,']);
    assert.ok(!/\/items\b/.test(formSource), 'day form must not call the /items endpoint');
    assert.ok(!/markup|totalSell|totalCost|overrideCost|sellPrice/i.test(formSource), 'no pricing fields');
    assert.ok(!/dayItems|poiAssignments/.test(formSource), 'editor does not touch services/POIs');
  });

  it('4. the day card exposes an explicit "Edit title & narrative" affordance with the form + initial values', () => {
    expectSourceContains(tabSource, [
      'editLabel="Edit title & narrative"',
      '<QuoteItineraryDayForm',
      'dayId={day.id}',
      'title: day.title,',
      "notes: day.notes || '',",
    ]);
  });

  it('5. the inline actions support a custom edit label and keep a Cancel toggle', () => {
    expectSourceContains(actionsSource, [
      'editLabel',
      "isEditing ? 'Cancel' : editLabel || 'Edit'",
    ]);
  });
});
