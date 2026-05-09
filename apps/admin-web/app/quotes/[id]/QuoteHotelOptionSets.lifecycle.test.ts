import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const source = readFileSync(new URL('./QuoteHotelOptionSets.tsx', import.meta.url), 'utf8');

function expectSourceContains(fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('hotel option set row edit lifecycle', () => {
  it('edits saved accommodation rows through the scoped hotel-option endpoint', () => {
    expectSourceContains([
      'const [editingHotelOptionId, setEditingHotelOptionId] = useState',
      'function startEditingHotelAlternative(option: QuoteHotelOption)',
      'setEditingHotelOptionId(option.id);',
      'function updateHotelAlternative()',
      'options/${optionSet.id}/hotel-options/${editingHotelOptionId}',
      "method: 'PATCH'",
      'body: JSON.stringify(buildHotelAlternativePayload(editForm))',
      'router.refresh();',
    ]);
  });

  it('keeps editable hotel row fields explicit and persistent', () => {
    expectSourceContains([
      'hotelId: option.hotelId ||',
      'roomCategoryId: option.roomCategoryId ||',
      'mealPlanCode,',
      'nights: String(option.nights || 1)',
      'notes: option.notes ||',
      'aria-label="Edit hotel catalog"',
      'aria-label="Edit room category"',
      'aria-label="Edit meal plan"',
      'aria-label="Edit nights"',
      'aria-label="Edit notes"',
    ]);
  });

  it('preserves option set isolation and existing primary behavior', () => {
    expectSourceContains([
      'options/${optionSet.id}/hotel-options/${hotelOptionId}',
      'patchHotelAlternative(option.id, { isPrimary: true })',
      'buildHotelAlternativePayload(editForm)',
      '<button className="compact-button" type="button" onClick={() => startEditingHotelAlternative(option)}>Edit</button>',
      '<button className="compact-button" type="button" onClick={() => deleteHotelAlternative(option.id)}>Delete</button>',
    ]);
  });
});
