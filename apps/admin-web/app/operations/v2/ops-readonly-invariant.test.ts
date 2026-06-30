import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * READ-ONLY INVARIANT (highest-priority guardrail for Round 1).
 *
 * Scans all SHIPPED Booking Operations V2 source (app/operations/v2 +
 * components/ops/v2) and asserts it contains NO mutation, form-submit, or
 * document-download affordance. Round 1 is read-only by construction; if a
 * later change wires a POST/PATCH/PUT/DELETE, a <form action>, a PDF/export
 * link, or a print/blob download into the V2 surface, this test fails.
 *
 * Test + fixture files are intentionally excluded (they legitimately reference
 * these tokens, including this file which lists the forbidden patterns).
 */

const V2_APP_DIR = fileURLToPath(new URL('.', import.meta.url)); // app/operations/v2/
const V2_COMPONENTS_DIR = fileURLToPath(new URL('../../../components/ops/v2/', import.meta.url));

const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

function isExcluded(file: string): boolean {
  return (
    file.endsWith('.test.ts') ||
    file.endsWith('.test.tsx') ||
    file.endsWith('.fixtures.ts')
  );
}

function collectSourceFiles(dir: string): string[] {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir, { recursive: true }) as unknown as string[];
  } catch {
    return [];
  }
  return entries
    .map((rel) => path.join(dir, rel))
    .filter((abs) => SCANNED_EXTENSIONS.has(path.extname(abs)) && !isExcluded(abs));
}

// Patterns that would indicate a mutation or a document download/print.
const FORBIDDEN: Array<{ pattern: string; why: string }> = [
  { pattern: '<form', why: 'HTML form (Classic uses POST forms for mutations)' },
  { pattern: '<input', why: 'form input (V2 is read-only — no edit controls)' },
  { pattern: '<select', why: 'form select (V2 is read-only — no edit controls)' },
  { pattern: '<textarea', why: 'form textarea (V2 is read-only — no edit controls)' },
  { pattern: 'method="POST"', why: 'POST form' },
  { pattern: 'method="PATCH"', why: 'PATCH form' },
  { pattern: 'method="PUT"', why: 'PUT form' },
  { pattern: 'method="DELETE"', why: 'DELETE form' },
  { pattern: "method: 'POST'", why: 'POST fetch' },
  { pattern: "method: 'PATCH'", why: 'PATCH fetch' },
  { pattern: "method: 'PUT'", why: 'PUT fetch' },
  { pattern: "method: 'DELETE'", why: 'DELETE fetch' },
  { pattern: 'method:"POST"', why: 'POST fetch' },
  { pattern: 'action={', why: 'form action handler' },
  { pattern: 'action="/api', why: 'form posting to the API' },
  { pattern: 'window.print', why: 'document print' },
  { pattern: 'createObjectURL', why: 'blob download' },
  { pattern: 'download=', why: 'download attribute' },
  { pattern: '.pdf', why: 'PDF download/export' },
  { pattern: '/export', why: 'data export' },
];

describe('Booking Operations V2 — read-only invariant', () => {
  const files = [...collectSourceFiles(V2_APP_DIR), ...collectSourceFiles(V2_COMPONENTS_DIR)];

  it('scans a non-empty set of V2 source files', () => {
    assert.ok(files.length >= 5, `expected to scan V2 source files, found ${files.length}`);
  });

  it('contains no mutation, form-submit, or download affordance', () => {
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const { pattern, why } of FORBIDDEN) {
        if (source.includes(pattern)) {
          violations.push(`${path.basename(file)} contains "${pattern}" (${why})`);
        }
      }
    }
    assert.deepEqual(violations, [], `read-only invariant violated:\n${violations.join('\n')}`);
  });
});
