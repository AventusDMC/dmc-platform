import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const editorSource = readFileSync(new URL('./ExcursionTemplateEditor.tsx', import.meta.url), 'utf8');
const fillMissingRouteSource = readFileSync(new URL('../api/excursion-templates/[id]/fill-missing-metadata/route.ts', import.meta.url), 'utf8');

function expectSourceContains(source: string, fragments: string[]) {
  for (const fragment of fragments) {
    assert.ok(source.includes(fragment), `Expected source to contain: ${fragment}`);
  }
}

describe('excursion template admin UI', () => {
  it('exposes a safe fill missing operational metadata action', () => {
    expectSourceContains(editorSource, [
      'function fillMissingMetadata()',
      '`/api/excursion-templates/${template.id}/fill-missing-metadata`',
      'Fill Missing Metadata',
      'Fills only blank operational fields with safe defaults. Existing values and pricing are preserved.',
    ]);

    expectSourceContains(fillMissingRouteSource, [
      '/excursion-templates/${encodeURIComponent(id)}/fill-missing-metadata',
      "'POST'",
    ]);
  });
});
