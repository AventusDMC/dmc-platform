import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { QuoteItineraryService } from './quote-itinerary.service';

// Phase P.3X-5E-4B — notesLanguage capture rules on the day write paths. Tests the
// pure normalize/validation logic directly (no DB); the write sites pass
// normalized.notesLanguage straight to Prisma create/update.

function svc() {
  return new QuoteItineraryService({} as any);
}
const norm = (s: any) => (s as any) as {
  normalizeDayInput: (d: any) => any;
  normalizeDayUpdateInput: (d: any, existing: any) => any;
  normalizeNotesLanguage: (v: any) => string | null;
};

test('P.3X-5E-4B createDay: stores a valid notesLanguage when provided', () => {
  const s = norm(svc());
  assert.equal(s.normalizeDayInput({ dayNumber: 1, title: 'Day 1', notes: 'x', notesLanguage: 'es' }).notesLanguage, 'es');
  assert.equal(s.normalizeDayInput({ dayNumber: 1, title: 'Day 1', notes: 'x', notesLanguage: 'ar' }).notesLanguage, 'ar');
});

test('P.3X-5E-4B createDay: defaults notesLanguage to null when omitted/blank', () => {
  const s = norm(svc());
  assert.equal(s.normalizeDayInput({ dayNumber: 1, title: 'Day 1' }).notesLanguage, null);
  assert.equal(s.normalizeDayInput({ dayNumber: 1, title: 'Day 1', notesLanguage: '' }).notesLanguage, null);
  assert.equal(s.normalizeDayInput({ dayNumber: 1, title: 'Day 1', notesLanguage: null }).notesLanguage, null);
});

test('P.3X-5E-4B updateDay: notes changed + notesLanguage="es" → es', () => {
  const s = norm(svc());
  const existing = { dayNumber: 1, title: 'T', notes: 'old', notesLanguage: null, sortOrder: 0, isActive: true };
  assert.equal(s.normalizeDayUpdateInput({ notes: 'new', notesLanguage: 'es' }, existing).notesLanguage, 'es');
});

test('P.3X-5E-4B updateDay: notes changed + notesLanguage="ar" → ar', () => {
  const s = norm(svc());
  const existing = { dayNumber: 1, title: 'T', notes: 'old', notesLanguage: null, sortOrder: 0, isActive: true };
  assert.equal(s.normalizeDayUpdateInput({ notes: 'الوصول', notesLanguage: 'ar' }, existing).notesLanguage, 'ar');
});

test('P.3X-5E-4B updateDay: notes changed + no notesLanguage → null (protects manual/preset edits)', () => {
  const s = norm(svc());
  const existing = { dayNumber: 1, title: 'T', notes: 'old', notesLanguage: 'es', sortOrder: 0, isActive: true };
  assert.equal(s.normalizeDayUpdateInput({ notes: 'manually edited' }, existing).notesLanguage, null);
});

test('P.3X-5E-4B updateDay: notes NOT changed → notesLanguage left unchanged', () => {
  const s = norm(svc());
  const existing = { dayNumber: 1, title: 'T', notes: 'keep', notesLanguage: 'es', sortOrder: 0, isActive: true };
  // title-only update
  assert.equal(s.normalizeDayUpdateInput({ title: 'New title' }, existing).notesLanguage, 'es');
  // country-only update
  assert.equal(s.normalizeDayUpdateInput({ country: 'Jordan' }, existing).notesLanguage, 'es');
  // existing unknown stays unknown
  assert.equal(s.normalizeDayUpdateInput({ title: 'T2' }, { ...existing, notesLanguage: null }).notesLanguage, null);
});

test('P.3X-5E-4B: invalid notesLanguage is rejected explicitly', () => {
  const s = norm(svc());
  assert.throws(() => s.normalizeDayInput({ dayNumber: 1, title: 'D', notesLanguage: 'fr' }), /Invalid notesLanguage/);
  const existing = { dayNumber: 1, title: 'T', notes: 'old', notesLanguage: null, sortOrder: 0, isActive: true };
  assert.throws(() => s.normalizeDayUpdateInput({ notes: 'x', notesLanguage: 'de' }, existing), /Invalid notesLanguage/);
  assert.throws(() => s.normalizeDayUpdateInput({ notes: 'x', notesLanguage: 'english' }, existing), /Invalid notesLanguage/);
});

test('P.3X-5E-4B: notesLanguage is case-insensitive + trimmed', () => {
  const s = norm(svc());
  assert.equal(s.normalizeNotesLanguage('EN'), 'en');
  assert.equal(s.normalizeNotesLanguage('  es  '), 'es');
  assert.equal(s.normalizeNotesLanguage('Pt'), 'pt');
  assert.equal(s.normalizeNotesLanguage(undefined), null);
});
