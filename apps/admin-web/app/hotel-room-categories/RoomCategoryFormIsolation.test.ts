import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// RoomCategoryForm freeze hunt — source-grep tests for the
// ROOM_CATEGORY_FORM_SAFE isolation flag + render instrumentation.

const managerSource = readFileSync(new URL('./RoomCategoriesManager.tsx', import.meta.url), 'utf8');
const sectionSource = readFileSync(new URL('../hotels/RoomCategoriesSection.tsx', import.meta.url), 'utf8');
const pageSource = readFileSync(new URL('../hotels/page.tsx', import.meta.url), 'utf8');

describe('RoomCategoryForm — instrumentation', () => {
  it('mounts useRenderCounter so the perf overlay sees the form', () => {
    assert.match(managerSource, /useRenderCounter\('RoomCategoryForm'\)/);
  });

  it('mounts a tight hard-render guard (50 renders / 2 seconds)', () => {
    assert.match(managerSource, /useHardRenderGuard\('RoomCategoryForm',\s*\{\s*limit:\s*50,\s*windowMs:\s*2000\s*\}\)/);
  });
});

describe('RoomCategoryForm — safe (uncontrolled) variant', () => {
  it('exports a separate RoomCategoryFormSafe component using defaultValue + FormData', () => {
    assert.match(managerSource, /function RoomCategoryFormSafe/);
    assert.match(managerSource, /new FormData\(event\.currentTarget\)/);
    assert.match(managerSource, /defaultValue=/);
  });

  it('safe variant has NO controlled-input state for field values', () => {
    // Slice the manager source from "function RoomCategoryFormSafe"
    // to the next top-level "function " declaration, then assert.
    const startIdx = managerSource.indexOf('function RoomCategoryFormSafe');
    assert.ok(startIdx >= 0, 'RoomCategoryFormSafe not found');
    const afterStart = managerSource.slice(startIdx + 'function RoomCategoryFormSafe'.length);
    const endRelative = afterStart.search(/\nfunction /);
    const safeBlock = endRelative >= 0 ? afterStart.slice(0, endRelative) : afterStart;
    // The only useState calls in the safe variant should be for
    // isSubmitting + error — NEVER for name/code/description/hotelId.
    assert.doesNotMatch(safeBlock, /useState\([^)]*initialValues\?\.name/);
    assert.doesNotMatch(safeBlock, /useState\([^)]*initialValues\?\.code/);
    assert.doesNotMatch(safeBlock, /useState\([^)]*initialValues\?\.description/);
    assert.doesNotMatch(safeBlock, /useState\([^)]*initialValues\?\.hotelId/);
    assert.match(safeBlock, /setIsSubmitting/);
    assert.match(safeBlock, /setError/);
  });

  it('safe variant carries a stable data-form-mode="safe" attribute for inspection', () => {
    assert.match(managerSource, /data-testid="room-category-form-safe"/);
    assert.match(managerSource, /data-form-mode="safe"/);
  });

  it('safe variant submits via FormData, not via per-field state', () => {
    // FormData reads happen inside RoomCategoryFormSafe's handleSubmit.
    // Confirm all four field names are read from the FormData payload.
    assert.match(managerSource, /formData\.get\('name'\)/);
    assert.match(managerSource, /formData\.get\('code'\)/);
    assert.match(managerSource, /formData\.get\('description'\)/);
    assert.match(managerSource, /formData\.get\('isActive'\)/);
  });
});

describe('RoomCategoryForm — dispatch wrapper', () => {
  it('chooses safe vs controlled variant based on formSafeMode prop', () => {
    assert.match(managerSource, /if \(formSafeMode\) \{\s*return\s*\(\s*<RoomCategoryFormSafe/);
    assert.match(managerSource, /<RoomCategoryFormControlled/);
  });

  it('passes formSafeMode through both top form + inline edit form', () => {
    // Top "Add room category" form passes the flag.
    assert.match(managerSource, /submitLabel="Add room category"\s*\n\s*formSafeMode=\{formSafeMode\}/);
    // Inline edit form passes the flag too.
    assert.match(managerSource, /submitLabel="Save category"\s*\n\s*formSafeMode=\{formSafeMode\}/);
  });
});

describe('formSafe flag plumbing', () => {
  it('page.tsx reads ?formSafe=1 and passes to RoomCategoriesSection', () => {
    assert.match(pageSource, /formSafe\?:\s*string/);
    assert.match(pageSource, /formSafeMode: params\?\.formSafe === '1'/);
  });

  it('RoomCategoriesSection accepts + threads formSafeMode to Manager', () => {
    assert.match(sectionSource, /formSafeMode\?:\s*boolean/);
    assert.match(sectionSource, /formSafeMode=\{formSafeMode\}/);
  });

  it('isolation ladder includes a Form: SAFE toggle so operators can flip without typing URLs', () => {
    assert.match(sectionSource, /data-testid="room-categories-form-safe-toggle"/);
    assert.match(sectionSource, /Form: SAFE/);
  });

  it('toggle link preserves the current isolation mode + flips formSafe', () => {
    assert.match(sectionSource, /if \(!formSafeMode\) params\.set\('formSafe', '1'\)/);
    assert.match(sectionSource, /params\.set\('cats', currentMode\)/);
  });
});
