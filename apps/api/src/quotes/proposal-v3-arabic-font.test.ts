import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Phase 3C.1 — guard that the proposal CSS embeds an Arabic web font so the
// Puppeteer PDF renders Arabic glyphs without relying on system fonts. Uses a
// cwd-relative path (NOT import.meta) because nest build compiles *.test.ts and
// ESM-only constructs would break the Railway image.
function readProposalCss(): string {
  const candidates = [
    resolve(process.cwd(), 'src', 'quotes', 'proposal-v3.css'),
    resolve(process.cwd(), 'apps', 'api', 'src', 'quotes', 'proposal-v3.css'),
  ];
  const path = candidates.find((c) => existsSync(c)) ?? candidates[0];
  return readFileSync(path, 'utf8');
}

test('proposal CSS embeds a Noto Naskh Arabic @font-face as an inline data URI', () => {
  const css = readProposalCss();
  // @font-face declared for the Arabic family
  assert.match(css, /@font-face\s*\{[^}]*font-family:\s*"Noto Naskh Arabic"/s, 'missing @font-face for Noto Naskh Arabic');
  // Embedded as a base64 woff2 data URI (no remote/relative fetch needed at render)
  assert.match(css, /src:\s*url\(data:font\/woff2;base64,[A-Za-z0-9+/=]{1000,}\)\s*format\("woff2"\)/, 'Arabic font is not inlined as a base64 woff2 data URI');
});

test('RTL proposal body + headings use the Arabic font family first', () => {
  const css = readProposalCss();
  // Body/container RTL stack leads with the Arabic font
  assert.match(css, /html\[dir="rtl"\]\s*\.proposal-v3\s*\{[^}]*font-family:\s*"Noto Naskh Arabic"/s, 'RTL container does not lead with Noto Naskh Arabic');
  // Headings (Playfair by default) are overridden under RTL to the Arabic font first
  assert.match(css, /html\[dir="rtl"\][^{]*h[123][^{]*\{[^}]*font-family:\s*"Noto Naskh Arabic"/s, 'RTL headings do not use Noto Naskh Arabic first');
});

test('Arabic font embedding does not alter the LTR (EN/PT/ES) base font stacks', () => {
  const css = readProposalCss();
  // Base body + heading stacks remain Inter / Playfair (unchanged for LTR proposals)
  assert.match(css, /font-family:\s*"Inter",\s*"Helvetica Neue",\s*Arial/, 'base Inter stack changed');
  assert.match(css, /font-family:\s*"Playfair Display",\s*Georgia/, 'base Playfair stack changed');
});
