import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { detectNotesLanguageMismatch, proposalLanguageEnglishName } from './proposal-notes-language';

// Phase P.3X-5E-2.1 — non-blocking export notes-language advisory.

const ENGLISH_NOTES = [
  'Meet & assist at QAIA, transfer to Amman, overnight Amman.',
  'Visit Madaba and Mount Nebo, continue to Petra, overnight Petra.',
  'Transfer from Dead Sea to QAIA for your departure flight.',
];
const SPANISH_NOTES = [
  'Recepción y asistencia en el aeropuerto, traslado a Amman, noche en Amman.',
  'Visita de Madaba y Monte Nebo, continúe hacia Petra, noche en Petra.',
];
const ARABIC_NOTES = ['الاستقبال والمساعدة في المطار، النقل إلى عمّان، المبيت في عمّان.'];

describe('detectNotesLanguageMismatch', () => {
  test('1. English notes + Spanish → warns', () => {
    assert.equal(detectNotesLanguageMismatch(ENGLISH_NOTES, 'es'), true);
  });
  test('2. English notes + Portuguese → warns', () => {
    assert.equal(detectNotesLanguageMismatch(ENGLISH_NOTES, 'pt'), true);
  });
  test('3. Latin/English notes + Arabic → warns', () => {
    assert.equal(detectNotesLanguageMismatch(ENGLISH_NOTES, 'ar'), true);
  });
  test('4. Arabic notes + Arabic → no warning', () => {
    assert.equal(detectNotesLanguageMismatch(ARABIC_NOTES, 'ar'), false);
  });
  test('5. Spanish-looking notes + Spanish → no warning', () => {
    assert.equal(detectNotesLanguageMismatch(SPANISH_NOTES, 'es'), false);
  });
  test('6. Empty notes + Spanish → no warning', () => {
    assert.equal(detectNotesLanguageMismatch([], 'es'), false);
    assert.equal(detectNotesLanguageMismatch([null, '', '   '], 'es'), false);
  });
  test('7. Proper-noun-only note "Visit Petra" stays below threshold → no warning', () => {
    assert.equal(detectNotesLanguageMismatch(['Visit Petra'], 'es'), false);
    // ...but a real multi-word English phrase does warn.
    assert.equal(detectNotesLanguageMismatch(['Meet & assist on arrival'], 'es'), true);
    // ...and two distinct single markers warn.
    assert.equal(detectNotesLanguageMismatch(['Overnight in the hotel after breakfast'], 'es'), true);
  });
  test('8. English selected → never warns, regardless of notes', () => {
    assert.equal(detectNotesLanguageMismatch(ENGLISH_NOTES, 'en'), false);
    assert.equal(detectNotesLanguageMismatch(ENGLISH_NOTES, null), false);
    assert.equal(detectNotesLanguageMismatch(ENGLISH_NOTES, undefined), false);
    assert.equal(detectNotesLanguageMismatch(ENGLISH_NOTES, 'fr'), false);
  });

  test('Spanish word "Visita"/"noche" do not trip English markers (word boundaries)', () => {
    assert.equal(detectNotesLanguageMismatch(['Visita de Petra, noche en Petra'], 'es'), false);
  });

  test('proposalLanguageEnglishName maps codes to display names', () => {
    assert.equal(proposalLanguageEnglishName('es'), 'Spanish');
    assert.equal(proposalLanguageEnglishName('pt'), 'Portuguese');
    assert.equal(proposalLanguageEnglishName('ar'), 'Arabic');
    assert.equal(proposalLanguageEnglishName('en'), 'English');
    assert.equal(proposalLanguageEnglishName(null), 'English');
  });
});

function readComponentSource(): string {
  const candidates = [
    resolve(process.cwd(), 'app/quotes/[id]/ProposalDocumentActions.tsx'),
    resolve(process.cwd(), 'apps/admin-web/app/quotes/[id]/ProposalDocumentActions.tsx'),
  ];
  const path = candidates.find((c) => existsSync(c)) ?? candidates[0];
  return readFileSync(path, 'utf8');
}

describe('ProposalDocumentActions advisory wiring', () => {
  const src = readComponentSource();
  test('uses the detector and renders an advisory note', () => {
    assert.match(src, /detectNotesLanguageMismatch\(dayNotes, language\)/, 'computes the advisory from selected language + day notes');
    assert.match(src, /role="note"/, 'advisory is a non-blocking note');
    assert.match(src, /Route Planner/, 'points the operator to the Route Planner workflow');
  });
  test('remains non-blocking: export button has no warning-driven disable', () => {
    // The only disable is the in-flight download guard, never the warning.
    assert.match(src, /disabled=\{isDownloading\}/, 'export button disabled only while downloading');
    assert.ok(!/disabled=\{[^}]*showNotesLanguageWarning/.test(src), 'warning must not disable any control');
  });
  test('still a read-only view switch — no mutations', () => {
    assert.ok(!/method:\s*'(POST|PUT|PATCH|DELETE)'/.test(src), 'must not POST/PUT/PATCH/DELETE');
  });
});
