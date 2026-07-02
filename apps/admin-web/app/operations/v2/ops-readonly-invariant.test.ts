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
const ASSIGN_ALLOWLIST = new Set(['supplier-assignment-control.tsx', 'ops-supplier-assign-request.ts']);
const CONFIRM_ALLOWLIST = new Set(['supplier-confirmation-control.tsx', 'ops-supplier-confirm-request.ts']);
const VOUCHER_GENERATE_ALLOWLIST = new Set(['voucher-generate-control.tsx', 'ops-voucher-generate-request.ts']);
const MUTATION_ALLOWLIST = new Set([...ASSIGN_ALLOWLIST, ...CONFIRM_ALLOWLIST, ...VOUCHER_GENERATE_ALLOWLIST]);

// Phase 2D voucher preview is READ-ONLY (a GET). It is NOT a mutation — it stays
// OUT of MUTATION_ALLOWLIST and is verified to contain no mutation/download
// affordance by the blanket scan below (a plain GET fetch, no forms, no PDF).
const VOUCHER_PREVIEW_FILES = new Set(['voucher-preview-control.tsx', 'ops-voucher-preview-vm.ts']);

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

// Narrower ban for the Phase 2B confirmation surface: a status <select> + the
// sanctioned confirmation PATCH are allowed; the email/preview/voucher/finance/
// document paths and the out-of-scope statuses stay forbidden.
const CONFIRMATION_FORBIDDEN: Array<{ pattern: string; why: string }> = [
  { pattern: '<form', why: 'no HTML form submit (use the gated fetch only)' },
  { pattern: '<input', why: 'no text input (no reference/notes in Phase 2B)' },
  { pattern: '<textarea', why: 'no free-text input (no notes in Phase 2B)' },
  { pattern: 'method="POST"', why: 'no POST form' },
  { pattern: "method: 'POST'", why: 'confirmation status is PATCH-only' },
  { pattern: "method: 'PUT'", why: 'confirmation status is PATCH-only' },
  { pattern: "method: 'DELETE'", why: 'confirmation status is PATCH-only' },
  { pattern: 'method:"POST"', why: 'no POST fetch' },
  { pattern: 'action="/api', why: 'no form posting to the API' },
  { pattern: 'window.print', why: 'no print' },
  { pattern: 'createObjectURL', why: 'no blob download' },
  { pattern: 'download=', why: 'no download' },
  { pattern: '.pdf', why: 'no PDF' },
  { pattern: '/export', why: 'no export' },
  { pattern: 'assign-supplier', why: 'Phase 2A endpoint — not this surface' },
  { pattern: 'assign-transport', why: 'no transport-resource assignment' },
  { pattern: 'supplier-confirmation', why: 'no supplier-confirmation send/preview/pdf' },
  { pattern: '/send', why: 'no email send' },
  { pattern: '/preview', why: 'no document preview' },
  { pattern: '/voucher', why: 'no voucher endpoints' },
  { pattern: '/operational', why: 'no operational-timing PATCH' },
  { pattern: '/invoices', why: 'no finance/invoice endpoints' },
  { pattern: '/payments', why: 'no payment endpoints' },
  { pattern: '/reconciliation', why: 'no reconciliation endpoints' },
  { pattern: 'request-confirmation', why: 'no request-confirmation action' },
  { pattern: '/dispatch', why: 'no dispatch action' },
  { pattern: '/start', why: 'no start action' },
  { pattern: '/complete', why: 'no complete action' },
  { pattern: '/issue', why: 'no issue action' },
  { pattern: 'confirmationReference', why: 'no confirmation reference in Phase 2B' },
  { pattern: 'confirmationNotes', why: 'no confirmation notes in Phase 2B' },
  { pattern: 'NOT_SENT', why: 'reset-to-not-sent removed — not a true operational reset' },
  { pattern: 'SENT', why: 'out-of-scope status (also catches a reset-to-not-sent)' },
  { pattern: 'REQUESTED', why: 'out-of-scope status (implies a request was sent)' },
  { pattern: 'ACKNOWLEDGED', why: 'out-of-scope confirmation status' },
  { pattern: 'CANCELLED', why: 'out-of-scope confirmation status' },
];

// Narrower ban for the Phase 2C voucher-generate surface: a Generate button + the
// sanctioned generate PATCH are allowed; download/pdf/export/print, preview, send/
// email, voucher status transitions, finance, dispatch, and the other mutation
// surfaces stay forbidden. (Patterns are specific mechanics — the control copy may
// legitimately contain the plain words "download"/"print"/"export".)
const VOUCHER_GENERATE_FORBIDDEN: Array<{ pattern: string; why: string }> = [
  { pattern: '<form', why: 'no HTML form submit (use the gated fetch only)' },
  { pattern: '<input', why: 'no free-text input (no notes/reference in Phase 2C)' },
  { pattern: '<select', why: 'no select (generate has no options)' },
  { pattern: '<textarea', why: 'no free-text input' },
  { pattern: 'method="POST"', why: 'no POST form' },
  { pattern: "method: 'POST'", why: 'the V2 control issues PATCH only' },
  { pattern: "method: 'PUT'", why: 'PATCH only' },
  { pattern: "method: 'DELETE'", why: 'PATCH only' },
  { pattern: 'method:"POST"', why: 'no POST fetch' },
  { pattern: 'action="/api', why: 'no form posting to the API' },
  { pattern: 'window.print', why: 'no print' },
  { pattern: 'createObjectURL', why: 'no blob download' },
  { pattern: 'download=', why: 'no download attribute' },
  { pattern: '.pdf', why: 'no PDF' },
  { pattern: '/export', why: 'no export' },
  { pattern: '/vouchers/', why: 'no voucher pdf/preview/status routes (those live under /vouchers/:id/...)' },
  { pattern: '/status', why: 'no voucher status transition endpoint' },
  { pattern: '/preview', why: 'no preview in Phase 2C' },
  { pattern: '/send', why: 'no send/email' },
  { pattern: 'send-document-email', why: 'no document email' },
  { pattern: 'supplier-confirmation', why: 'no supplier-confirmation send/preview/pdf' },
  { pattern: 'assign-supplier', why: 'Phase 2A endpoint — not this surface' },
  { pattern: '/confirmation', why: 'Phase 2B endpoint — not this surface' },
  { pattern: '/invoices', why: 'no finance/invoice endpoints' },
  { pattern: '/payments', why: 'no payment endpoints' },
  { pattern: '/reconciliation', why: 'no reconciliation endpoints' },
  { pattern: '/dispatch', why: 'no dispatch action' },
  { pattern: '/start', why: 'no start action' },
  { pattern: '/complete', why: 'no complete action' },
  { pattern: '/issue', why: 'no issue action' },
  { pattern: 'notes', why: 'no notes/free-text in Phase 2C' },
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
  const assignFiles = all.filter((f) => ASSIGN_ALLOWLIST.has(path.basename(f)));
  const confirmFiles = all.filter((f) => CONFIRM_ALLOWLIST.has(path.basename(f)));
  const voucherFiles = all.filter((f) => VOUCHER_GENERATE_ALLOWLIST.has(path.basename(f)));
  const readOnly = all.filter((f) => !MUTATION_ALLOWLIST.has(path.basename(f)));

  it('scans a non-empty set of V2 source files', () => {
    assert.ok(all.length >= 5, `expected to scan V2 source files, found ${all.length}`);
  });

  it('all non-mutation V2 source contains no mutation, form-submit, or download affordance', () => {
    assert.deepEqual(scan(readOnly, FORBIDDEN), [], 'read-only invariant violated');
  });

  it('the supplier-assignment surface (Phase 2A) is limited to the sanctioned PATCH', () => {
    assert.equal(assignFiles.length, ASSIGN_ALLOWLIST.size, 'allowlisted assignment files not found');
    const combined = assignFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
    assert.ok(combined.includes('assign-supplier'), 'assignment surface must target assign-supplier');
    assert.deepEqual(scan(assignFiles, ASSIGNMENT_FORBIDDEN), [], 'assignment surface exceeded its scope');
  });

  it('the confirmation-status surface (Phase 2B) is limited to the sanctioned PATCH', () => {
    assert.equal(confirmFiles.length, CONFIRM_ALLOWLIST.size, 'allowlisted confirmation files not found');
    const combined = confirmFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
    assert.ok(combined.includes('/confirmation'), 'confirmation surface must target the confirmation endpoint');
    assert.ok(!combined.includes('assign-supplier'), 'confirmation surface must not touch assignment');
    assert.deepEqual(scan(confirmFiles, CONFIRMATION_FORBIDDEN), [], 'confirmation surface exceeded its scope');
  });

  it('the voucher-preview surface (Phase 2D) is read-only (GET only, no mutation/download)', () => {
    const previewFiles = all.filter((f) => VOUCHER_PREVIEW_FILES.has(path.basename(f)));
    assert.equal(previewFiles.length, VOUCHER_PREVIEW_FILES.size, 'preview files not found');
    // Preview is NOT a sanctioned mutation — it must stay out of the mutation allowlist.
    for (const f of previewFiles) {
      assert.ok(!MUTATION_ALLOWLIST.has(path.basename(f)), 'preview must not be a sanctioned mutation surface');
    }
    // Read-only: it passes the SAME blanket mutation/download ban as every other
    // non-mutation V2 file (a plain GET fetch, no forms, no PDF/download/print/export).
    assert.deepEqual(scan(previewFiles, FORBIDDEN), [], 'preview surface must contain no mutation/download affordance');
    const control = readFileSync(
      previewFiles.find((f) => f.endsWith('voucher-preview-control.tsx'))!,
      'utf8',
    );
    assert.ok(control.includes('voucher-preview'), 'preview control targets the voucher-preview proxy');
    for (const bad of [
      '/vouchers/', '/status', '/send', 'send-document-email', 'supplier-confirmation',
      'assign-supplier', '/confirmation', 'voucher/generate',
      '/invoices', '/payments', '/reconciliation', '/dispatch', '/start', '/complete', '/issue',
    ]) {
      assert.ok(!control.includes(bad), `preview control must not reference "${bad}"`);
    }
  });

  it('the voucher-generate surface (Phase 2C) is limited to the sanctioned PATCH', () => {
    assert.equal(voucherFiles.length, VOUCHER_GENERATE_ALLOWLIST.size, 'allowlisted voucher files not found');
    const combined = voucherFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
    assert.ok(combined.includes('/voucher/generate'), 'voucher surface must target the voucher-generate endpoint');
    assert.ok(!combined.includes('assign-supplier'), 'voucher surface must not touch assignment');
    assert.ok(!combined.includes('/confirmation'), 'voucher surface must not touch confirmation');
    assert.deepEqual(scan(voucherFiles, VOUCHER_GENERATE_FORBIDDEN), [], 'voucher surface exceeded its scope');
  });
});
