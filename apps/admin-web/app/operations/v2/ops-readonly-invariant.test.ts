import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

/**
 * READ-ONLY INVARIANT (highest-priority guardrail).
 *
 * Scans all SHIPPED Booking Operations V2 source (app/operations/v2 +
 * components/ops/v2) and asserts it contains NO mutation, form-submit, or
 * document-download affordance — with ONE narrowly allowlisted exception:
 * Phase 2A supplier assignment.
 *
 * Phase 2A introduces the FIRST (and only) sanctioned mutation: a supplier
 * assignment via `PATCH /api/bookings/[id]/operations/[operationId]/assign-supplier`.
 * Two files implement it — the client control and the pure request builder. They
 * are exempt from the blanket ban but held to a NARROWER ban that still forbids
 * every other mutation, any confirmation/voucher/finance/document/export/print
 * mechanic, and the out-of-scope assignment statuses + notes. Everything else in
 * V2 stays fully read-only.
 *
 * Test + fixture files are intentionally excluded (they legitimately reference
 * these tokens, including this file which lists the forbidden patterns).
 */

const V2_APP_DIR = fileURLToPath(new URL('.', import.meta.url)); // app/operations/v2/
const V2_COMPONENTS_DIR = fileURLToPath(new URL('../../../components/ops/v2/', import.meta.url));

const SCANNED_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);

// Phase 2A: the ONLY files permitted to contain a mutation, and only the
// supplier-assignment PATCH at that.
const MUTATION_ALLOWLIST = new Set(['supplier-assignment-control.tsx', 'ops-supplier-assign-request.ts']);

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

// Patterns that would indicate a mutation or a document download/print. Applied
// to EVERY V2 file that is NOT the allowlisted supplier-assignment surface.
const FORBIDDEN: Array<{ pattern: string; why: string }> = [
  { pattern: '<form', why: 'HTML form (Classic uses POST forms for mutations)' },
  { pattern: '<input', why: 'form input (read-only — no edit controls outside the assignment picker)' },
  { pattern: '<select', why: 'form select (read-only — no edit controls outside the assignment picker)' },
  { pattern: '<textarea', why: 'form textarea (read-only — no edit controls)' },
  { pattern: 'method="POST"', why: 'POST form' },
  { pattern: 'method="PATCH"', why: 'PATCH form' },
  { pattern: 'method="PUT"', why: 'PUT form' },
  { pattern: 'method="DELETE"', why: 'DELETE form' },
  { pattern: "method: 'POST'", why: 'POST fetch' },
  { pattern: "method: 'PATCH'", why: 'PATCH fetch (only the allowlisted assignment surface may PATCH)' },
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

// Narrower ban for the allowlisted supplier-assignment surface: a supplier
// <select> + the sanctioned PATCH are allowed; everything else that could mutate
// or leave the supplier-assignment scope is still forbidden.
const ASSIGNMENT_FORBIDDEN: Array<{ pattern: string; why: string }> = [
  { pattern: '<form', why: 'no HTML form submit (use the gated fetch only)' },
  { pattern: '<textarea', why: 'no free-text input (no assignment notes in Phase 2A)' },
  { pattern: 'method="POST"', why: 'no POST form' },
  { pattern: "method: 'POST'", why: 'supplier assignment is PATCH-only' },
  { pattern: "method: 'PUT'", why: 'supplier assignment is PATCH-only' },
  { pattern: "method: 'DELETE'", why: 'supplier assignment is PATCH-only' },
  { pattern: 'method:"POST"', why: 'no POST fetch' },
  { pattern: 'action="/api', why: 'no form posting to the API' },
  { pattern: 'window.print', why: 'no print' },
  { pattern: 'createObjectURL', why: 'no blob download' },
  { pattern: 'download=', why: 'no download' },
  { pattern: '.pdf', why: 'no PDF' },
  { pattern: '/export', why: 'no export' },
  { pattern: '/confirmation', why: 'no confirmation endpoint in Phase 2A' },
  { pattern: 'assign-transport', why: 'no transport-resource assignment in Phase 2A' },
  { pattern: 'supplier-confirmation', why: 'no supplier-confirmation send/preview' },
  { pattern: '/voucher', why: 'no voucher endpoints' },
  { pattern: '/operational', why: 'no Classic operational-timing PATCH' },
  { pattern: '/invoices', why: 'no finance/invoice endpoints' },
  { pattern: '/payments', why: 'no payment endpoints' },
  { pattern: '/reconciliation', why: 'no reconciliation endpoints' },
  { pattern: 'request-confirmation', why: 'no request-confirmation action' },
  { pattern: 'REQUESTED', why: 'out-of-scope assignment status (would change confirmation)' },
  { pattern: 'CONFIRMED', why: 'out-of-scope assignment status (would change confirmation)' },
  { pattern: 'REJECTED', why: 'out-of-scope assignment status (would change confirmation)' },
  { pattern: 'assignmentNotes', why: 'no assignment notes in Phase 2A' },
];

function scan(files: string[], forbidden: typeof FORBIDDEN): string[] {
  const violations: string[] = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const { pattern, why } of forbidden) {
      if (source.includes(pattern)) {
        violations.push(`${path.basename(file)} contains "${pattern}" (${why})`);
      }
    }
  }
  return violations;
}

describe('Booking Operations V2 — read-only invariant', () => {
  const all = [...collectSourceFiles(V2_APP_DIR), ...collectSourceFiles(V2_COMPONENTS_DIR)];
  const allowlisted = all.filter((f) => MUTATION_ALLOWLIST.has(path.basename(f)));
  const readOnly = all.filter((f) => !MUTATION_ALLOWLIST.has(path.basename(f)));

  it('scans a non-empty set of V2 source files', () => {
    assert.ok(all.length >= 5, `expected to scan V2 source files, found ${all.length}`);
  });

  it('all non-assignment V2 source contains no mutation, form-submit, or download affordance', () => {
    assert.deepEqual(scan(readOnly, FORBIDDEN), [], 'read-only invariant violated');
  });

  it('the supplier-assignment surface is present and limited to the sanctioned PATCH', () => {
    // Both allowlisted files must actually exist (so the allowlist can't silently
    // hide a renamed/abandoned mutation).
    assert.equal(allowlisted.length, MUTATION_ALLOWLIST.size, 'allowlisted assignment files not found');
    // It must reference the one sanctioned endpoint…
    const combined = allowlisted.map((f) => readFileSync(f, 'utf8')).join('\n');
    assert.ok(combined.includes('assign-supplier'), 'assignment surface must target assign-supplier');
    // …and nothing else mutating / out of scope.
    assert.deepEqual(scan(allowlisted, ASSIGNMENT_FORBIDDEN), [], 'assignment surface exceeded its scope');
  });
});
