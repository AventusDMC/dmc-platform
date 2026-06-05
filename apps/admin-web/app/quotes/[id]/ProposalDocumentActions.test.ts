import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PROPOSAL_LANGUAGES,
  isProposalLanguage,
  getDefaultProposalPreviewHref,
  getQuoteExportPdfHref,
  getDefaultProposalPdfHref,
} from './proposal-paths';

// Phase 3D.1I — proposal language selector. The backend already renders
// ?language=en|pt|es|ar; this phase adds the operator-facing selector that wires
// the chosen language into the proposal preview + Export PDF links.

function readComponentSource(): string {
  const candidates = [
    resolve(process.cwd(), 'app/quotes/[id]/ProposalDocumentActions.tsx'),
    resolve(process.cwd(), 'apps/admin-web/app/quotes/[id]/ProposalDocumentActions.tsx'),
  ];
  const path = candidates.find((c) => existsSync(c)) ?? candidates[0];
  return readFileSync(path, 'utf8');
}

describe('proposal-paths language helpers', () => {
  test('English / no language → no query param (default unchanged)', () => {
    assert.equal(getDefaultProposalPreviewHref('q1'), '/api/quotes/q1/proposal-v3/html');
    assert.equal(getDefaultProposalPreviewHref('q1', 'en'), '/api/quotes/q1/proposal-v3/html');
    assert.equal(getQuoteExportPdfHref('/api', 'q1'), '/api/quotes/q1/export');
    assert.equal(getQuoteExportPdfHref('/api', 'q1', 'en'), '/api/quotes/q1/export');
  });

  test('Portuguese appends ?language=pt to preview + export', () => {
    assert.equal(getDefaultProposalPreviewHref('q1', 'pt'), '/api/quotes/q1/proposal-v3/html?language=pt');
    assert.equal(getQuoteExportPdfHref('/api', 'q1', 'pt'), '/api/quotes/q1/export?language=pt');
  });

  test('Spanish appends ?language=es', () => {
    assert.equal(getDefaultProposalPreviewHref('q1', 'es'), '/api/quotes/q1/proposal-v3/html?language=es');
    assert.equal(getQuoteExportPdfHref('/api', 'q1', 'es'), '/api/quotes/q1/export?language=es');
  });

  test('Arabic appends ?language=ar (RTL handled by backend render)', () => {
    assert.equal(getDefaultProposalPreviewHref('q1', 'ar'), '/api/quotes/q1/proposal-v3/html?language=ar');
    assert.equal(getQuoteExportPdfHref('/api', 'q1', 'ar'), '/api/quotes/q1/export?language=ar');
    assert.equal(getDefaultProposalPdfHref('/api', 'q1', 'ar'), '/api/quotes/q1/pdf?language=ar');
  });

  test('unknown / null language is ignored (falls back to default)', () => {
    assert.equal(getDefaultProposalPreviewHref('q1', 'fr'), '/api/quotes/q1/proposal-v3/html');
    assert.equal(getDefaultProposalPreviewHref('q1', null), '/api/quotes/q1/proposal-v3/html');
    assert.equal(getQuoteExportPdfHref('/api', 'q1', 'xx'), '/api/quotes/q1/export');
  });

  test('exactly the four supported languages are offered', () => {
    assert.deepEqual(
      PROPOSAL_LANGUAGES.map((l) => l.code),
      ['en', 'pt', 'es', 'ar'],
    );
    assert.equal(isProposalLanguage('pt'), true);
    assert.equal(isProposalLanguage('ar'), true);
    assert.equal(isProposalLanguage('fr'), false);
    assert.equal(isProposalLanguage(null), false);
  });
});

describe('ProposalDocumentActions component', () => {
  test('renders a proposal-language selector with all four languages', () => {
    const src = readComponentSource();
    assert.match(src, /aria-label="Proposal language"/, 'language selector must be present and labelled');
    assert.match(src, /PROPOSAL_LANGUAGES\.map/, 'options must come from the shared language list');
  });

  test('preview link and export both pass the selected language', () => {
    const src = readComponentSource();
    assert.match(src, /getDefaultProposalPreviewHref\(quoteId, language\)/, 'Open proposal uses selected language');
    assert.match(src, /getQuoteExportPdfHref\(apiBaseUrl, quoteId, language\)/, 'Export PDF uses selected language');
  });

  test('defaults from initialLanguage (seeded from Quote.proposalLanguage)', () => {
    const src = readComponentSource();
    assert.match(src, /initialLanguage/, 'accepts an initial/default language');
    assert.match(src, /isProposalLanguage\(initialLanguage\)\s*\?\s*initialLanguage\s*:\s*'en'/, 'falls back to English');
  });

  test('is a read-only view switch — never mutates pricing or quote data', () => {
    const src = readComponentSource();
    assert.ok(!/method:\s*'POST'/.test(src), 'must not POST');
    assert.ok(!/method:\s*'PUT'/.test(src), 'must not PUT');
    assert.ok(!/method:\s*'PATCH'/.test(src), 'must not PATCH');
    assert.ok(!/method:\s*'DELETE'/.test(src), 'must not DELETE');
    // The only network call is a GET to the export endpoint to download the PDF.
    assert.match(src, /fetch\(getQuoteExportPdfHref/, 'export is a plain GET download');
  });
});
