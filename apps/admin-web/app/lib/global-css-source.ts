import { readFileSync } from 'node:fs';

// globals.css was split into ordered chunks (design-system Phase 4). Tests that
// assert on the global CSS source must read the concatenation, in the SAME order
// layout.tsx imports them, so the cascade-equivalent source is matched. Concatenated
// (no separator) these are byte-for-byte the former single globals.css.
// Keep this list in sync with the CSS imports in app/layout.tsx.
const GLOBAL_CSS_FILES = [
  'globals.css',
  'globals-02-saas-refresh.css',
  'globals-03-quote-detail.css',
  'globals-04-quote-builder.css',
  'globals-05-platform-scale.css',
  'globals-06-responsive-audit.css',
] as const;

export const globalCssSource = GLOBAL_CSS_FILES.map((file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'),
).join('');
