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
// Phase 2F-B: the actual voucher SEND (POST). The FOURTH (and only new) sanctioned
// mutation. Its control legitimately contains the ONE typed-SEND <input> (the blanket
// ban forbids <input>), so it is allowlisted and held to the narrower VOUCHER_SEND_FORBIDDEN.
const VOUCHER_SEND_ALLOWLIST = new Set(['voucher-send-control.tsx', 'ops-voucher-send-request.ts']);
// Ops V2 passenger editing (flag-gated, shipped a907d064): passenger CRUD via the V2
// proxy /api/bookings/:id/v2/passengers. The editor control legitimately contains form
// inputs and the request builder issues POST/PATCH/DELETE — both tripped by the blanket
// ban — so the two files are allowlisted and held to the narrower PASSENGER_FORBIDDEN
// (must stay within /v2/passengers; no other surface / send / document / finance).
const PASSENGER_ALLOWLIST = new Set(['passenger-editor.tsx', 'ops-passenger-request.ts']);
// Ops V2 rooming editing (flag-gated, shipped 35a7ab56): rooming CRUD via the V2 proxy
// /api/bookings/:id/v2/rooming. Same shape as passengers (inputs + a status <select> +
// POST/PATCH/DELETE); held to the narrower ROOMING_FORBIDDEN.
const ROOMING_ALLOWLIST = new Set(['rooming-editor.tsx', 'ops-rooming-request.ts']);
// Supplier Voucher Packet V2 (S6, shipped 8c587be3): regenerate a STALE generated packet
// in place via a NO-BODY POST to .../voucher-packets/:packetId/regenerate. It rebuilds the
// packet snapshot/items/contentHash in place — no supplier-send/allowlist action, no status
// transition, no document/finance. Held to VOUCHER_PACKET_REGENERATE_FORBIDDEN.
const VOUCHER_PACKET_REGENERATE_ALLOWLIST = new Set(['voucher-packet-regenerate-control.tsx']);
const MUTATION_ALLOWLIST = new Set([
  ...ASSIGN_ALLOWLIST,
  ...CONFIRM_ALLOWLIST,
  ...VOUCHER_GENERATE_ALLOWLIST,
  ...VOUCHER_SEND_ALLOWLIST,
  ...PASSENGER_ALLOWLIST,
  ...ROOMING_ALLOWLIST,
  ...VOUCHER_PACKET_REGENERATE_ALLOWLIST,
]);

// Phase 2D voucher preview is READ-ONLY (a GET). It is NOT a mutation — it stays
// OUT of MUTATION_ALLOWLIST and is verified to contain no mutation/download
// affordance by the blanket scan below (a plain GET fetch, no forms, no PDF).
const VOUCHER_PREVIEW_FILES = new Set(['voucher-preview-control.tsx', 'ops-voucher-preview-vm.ts']);

// Phase 2E voucher PDF download is READ-ONLY (a GET) but necessarily contains the
// download mechanic (createObjectURL / .pdf / download=) that the blanket ban
// below forbids. It is the ONLY file exempt from those download-mechanic
// patterns, held to a NARROWER ban (still no mutation/status/send/email/finance/
// dispatch, and must use the sanctioned voucher-download proxy). It is NOT a
// mutation — it stays OUT of MUTATION_ALLOWLIST.
const VOUCHER_DOWNLOAD_ALLOWLIST = new Set(['voucher-download-control.tsx']);

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

// Narrower ban for the Phase 2E voucher-DOWNLOAD surface. The download mechanic
// (createObjectURL / .pdf / download=) IS permitted here (and only here); the
// download must go through the sanctioned voucher-download proxy and must NOT
// mutate, send, email, print, export, change status, or touch finance/dispatch.
const VOUCHER_DOWNLOAD_FORBIDDEN: Array<{ pattern: string; why: string }> = [
  { pattern: '<form', why: 'no HTML form submit (use the gated GET fetch only)' },
  { pattern: '<input', why: 'no form input' },
  { pattern: '<select', why: 'no select' },
  { pattern: '<textarea', why: 'no free-text input' },
  { pattern: "method: 'POST'", why: 'download is a GET (read), never POST' },
  { pattern: "method: 'PATCH'", why: 'GET only' },
  { pattern: "method: 'PUT'", why: 'GET only' },
  { pattern: "method: 'DELETE'", why: 'GET only' },
  { pattern: 'method="POST"', why: 'no POST form' },
  { pattern: 'action="/api', why: 'no form posting to the API' },
  { pattern: 'window.print', why: 'no print' },
  { pattern: '/export', why: 'no export bundle' },
  { pattern: '/voucher/pdf', why: 'no raw booking voucher PDF endpoint (use the proxy)' },
  { pattern: '/vouchers/', why: 'no direct /vouchers/:id routes (proxy resolves server-side)' },
  { pattern: 'portal-voucher', why: 'no unauthenticated portal PDF' },
  { pattern: '/agent/', why: 'no agent PDF route' },
  { pattern: '/status', why: 'no voucher status transition' },
  { pattern: '/send', why: 'no send/email' },
  { pattern: 'send-document-email', why: 'no document email' },
  { pattern: 'supplier-confirmation', why: 'no supplier-confirmation send' },
  { pattern: 'assign-supplier', why: 'Phase 2A endpoint — not this surface' },
  { pattern: '/confirmation', why: 'Phase 2B endpoint — not this surface' },
  { pattern: 'voucher/generate', why: 'Phase 2C endpoint — not this surface' },
  { pattern: '/preview', why: 'Phase 2D endpoint — not this surface' },
  { pattern: '/invoices', why: 'no finance/invoice endpoints' },
  { pattern: '/payments', why: 'no payment endpoints' },
  { pattern: '/reconciliation', why: 'no reconciliation endpoints' },
  { pattern: '/dispatch', why: 'no dispatch action' },
  { pattern: '/start', why: 'no start action' },
  { pattern: '/complete', why: 'no complete action' },
  { pattern: '/issue', why: 'no issue action' },
];

// Narrower ban for the Phase 2F-B voucher-SEND surface (the actual send). A POST +
// the ONE typed-SEND <input> ARE permitted here (and only here); everything else
// that could mutate, download, print, change status, touch finance/dispatch, or
// accept a client recipient/subject/body stays forbidden. The send goes through the
// sanctioned voucher-send proxy and re-uses the 2F-A voucher-send-preview (GET).
const VOUCHER_SEND_FORBIDDEN: Array<{ pattern: string; why: string }> = [
  { pattern: '<form', why: 'no HTML form submit (use the gated fetch only)' },
  { pattern: '<select', why: 'no select' },
  { pattern: '<textarea', why: 'no free-text body/notes input' },
  { pattern: "method: 'PATCH'", why: 'send is POST-only' },
  { pattern: "method: 'PUT'", why: 'send is POST-only' },
  { pattern: "method: 'DELETE'", why: 'send is POST-only' },
  { pattern: 'method="POST"', why: 'no POST form (use the gated fetch)' },
  { pattern: 'action="/api', why: 'no form posting to the API' },
  { pattern: 'window.print', why: 'no print' },
  { pattern: 'createObjectURL', why: 'no blob/download' },
  { pattern: 'download=', why: 'no download' },
  { pattern: '.pdf', why: 'no PDF download/export (server attaches it)' },
  { pattern: '/export', why: 'no export' },
  { pattern: '/voucher/pdf', why: 'no raw voucher PDF endpoint' },
  { pattern: '/vouchers/', why: 'no direct /vouchers/:id routes' },
  { pattern: 'portal-voucher', why: 'no unauthenticated portal PDF' },
  { pattern: '/agent/', why: 'no agent route' },
  { pattern: '/status', why: 'no voucher status transition' },
  { pattern: 'send-document-email', why: 'no legacy document email' },
  { pattern: 'supplier-confirmation', why: 'no supplier-confirmation send' },
  { pattern: 'assign-supplier', why: 'Phase 2A endpoint — not this surface' },
  { pattern: '/confirmation', why: 'Phase 2B endpoint — not this surface' },
  { pattern: 'voucher/generate', why: 'Phase 2C endpoint — not this surface' },
  { pattern: '/invoices', why: 'no finance/invoice endpoints' },
  { pattern: '/payments', why: 'no payment endpoints' },
  { pattern: '/reconciliation', why: 'no reconciliation endpoints' },
  { pattern: '/dispatch', why: 'no dispatch action' },
  { pattern: '/start', why: 'no start action' },
  { pattern: '/complete', why: 'no complete action' },
  { pattern: '/issue', why: 'no issue action' },
  // No client-supplied recipient/subject/body fields — the ONLY input is typed-SEND.
  { pattern: 'name="email"', why: 'no client recipient input' },
  { pattern: 'name="recipient"', why: 'no client recipient input' },
  { pattern: 'name="subject"', why: 'no client subject input' },
  { pattern: 'name="body"', why: 'no client body input' },
  { pattern: 'name="to"', why: 'no client recipient input' },
];

// Narrower ban for the passenger-editing surface. Passenger edit inputs + the
// sanctioned /v2/passengers POST/PATCH/DELETE ARE permitted; everything that could
// leave the passengers scope — any OTHER surface's endpoint, send/email, document
// download/print/export, status transitions, finance, dispatch, or a form submit —
// stays forbidden.
const PASSENGER_FORBIDDEN: Array<{ pattern: string; why: string }> = [
  { pattern: '<form', why: 'no HTML form submit (use the gated fetch only)' },
  { pattern: '<select', why: 'no select in the passenger editor' },
  { pattern: '<textarea', why: 'no free-text textarea' },
  { pattern: 'method="POST"', why: 'no POST form (use the gated fetch)' },
  { pattern: 'action="/api', why: 'no form posting to the API' },
  { pattern: 'window.print', why: 'no print' },
  { pattern: 'createObjectURL', why: 'no blob download' },
  { pattern: 'download=', why: 'no download' },
  { pattern: '.pdf', why: 'no PDF' },
  { pattern: '/export', why: 'no export' },
  { pattern: '/send', why: 'no send/email' },
  { pattern: 'send-document-email', why: 'no document email' },
  { pattern: 'assign-supplier', why: 'Phase 2A endpoint — not this surface' },
  { pattern: 'assign-transport', why: 'no transport-resource assignment' },
  { pattern: '/confirmation', why: 'Phase 2B endpoint — not this surface' },
  { pattern: 'supplier-confirmation', why: 'no supplier-confirmation send/preview' },
  { pattern: '/voucher', why: 'no voucher endpoints' },
  { pattern: 'voucher-packets', why: 'no voucher-packet endpoints' },
  { pattern: '/invoices', why: 'no finance/invoice endpoints' },
  { pattern: '/payments', why: 'no payment endpoints' },
  { pattern: '/reconciliation', why: 'no reconciliation endpoints' },
  { pattern: '/dispatch', why: 'no dispatch action' },
  { pattern: '/operational', why: 'no operational-timing PATCH' },
  { pattern: '/start', why: 'no start action' },
  { pattern: '/complete', why: 'no complete action' },
  { pattern: '/issue', why: 'no issue action' },
];

// Narrower ban for the rooming-editing surface — identical scope to passengers, but a
// status <select> IS permitted (the rooming picker). Must stay within /v2/rooming.
const ROOMING_FORBIDDEN: Array<{ pattern: string; why: string }> = [
  { pattern: '<form', why: 'no HTML form submit (use the gated fetch only)' },
  { pattern: '<textarea', why: 'no free-text textarea' },
  { pattern: 'method="POST"', why: 'no POST form (use the gated fetch)' },
  { pattern: 'action="/api', why: 'no form posting to the API' },
  { pattern: 'window.print', why: 'no print' },
  { pattern: 'createObjectURL', why: 'no blob download' },
  { pattern: 'download=', why: 'no download' },
  { pattern: '.pdf', why: 'no PDF' },
  { pattern: '/export', why: 'no export' },
  { pattern: '/send', why: 'no send/email' },
  { pattern: 'send-document-email', why: 'no document email' },
  { pattern: 'assign-supplier', why: 'Phase 2A endpoint — not this surface' },
  { pattern: 'assign-transport', why: 'no transport-resource assignment' },
  { pattern: '/confirmation', why: 'Phase 2B endpoint — not this surface' },
  { pattern: 'supplier-confirmation', why: 'no supplier-confirmation send/preview' },
  { pattern: '/voucher', why: 'no voucher endpoints' },
  { pattern: 'voucher-packets', why: 'no voucher-packet endpoints' },
  { pattern: '/invoices', why: 'no finance/invoice endpoints' },
  { pattern: '/payments', why: 'no payment endpoints' },
  { pattern: '/reconciliation', why: 'no reconciliation endpoints' },
  { pattern: '/dispatch', why: 'no dispatch action' },
  { pattern: '/operational', why: 'no operational-timing PATCH' },
  { pattern: '/start', why: 'no start action' },
  { pattern: '/complete', why: 'no complete action' },
  { pattern: '/issue', why: 'no issue action' },
];

// Narrower ban for the voucher-packet REGENERATE surface. Only the no-body POST to
// .../voucher-packets/:id/regenerate is permitted; it has no form controls, no other
// method, no download/print/export, no send/status transition, no other-surface
// endpoint, and no finance/dispatch.
const VOUCHER_PACKET_REGENERATE_FORBIDDEN: Array<{ pattern: string; why: string }> = [
  { pattern: '<form', why: 'no HTML form submit (use the gated fetch only)' },
  { pattern: '<input', why: 'no free-text input (regenerate takes no body)' },
  { pattern: '<select', why: 'no select' },
  { pattern: '<textarea', why: 'no free-text textarea' },
  { pattern: "method: 'PATCH'", why: 'regenerate is POST-only' },
  { pattern: "method: 'PUT'", why: 'regenerate is POST-only' },
  { pattern: "method: 'DELETE'", why: 'regenerate is POST-only' },
  { pattern: 'method="POST"', why: 'no POST form (use the gated fetch)' },
  { pattern: 'action="/api', why: 'no form posting to the API' },
  { pattern: 'window.print', why: 'no print' },
  { pattern: 'createObjectURL', why: 'no blob download' },
  { pattern: 'download=', why: 'no download' },
  { pattern: '.pdf', why: 'no PDF' },
  { pattern: '/export', why: 'no export' },
  { pattern: '/send', why: 'no send/email — regenerate never sends' },
  { pattern: 'send-document-email', why: 'no document email' },
  { pattern: 'supplier-confirmation', why: 'no supplier-confirmation send' },
  { pattern: 'assign-supplier', why: 'Phase 2A endpoint — not this surface' },
  { pattern: '/confirmation', why: 'Phase 2B endpoint — not this surface' },
  { pattern: 'voucher/generate', why: 'Phase 2C endpoint — not this surface' },
  { pattern: '/vouchers/', why: 'no direct /vouchers/:id routes' },
  { pattern: '/status', why: 'no status transition (regenerate keeps the packet status)' },
  { pattern: '/invoices', why: 'no finance/invoice endpoints' },
  { pattern: '/payments', why: 'no payment endpoints' },
  { pattern: '/reconciliation', why: 'no reconciliation endpoints' },
  { pattern: '/dispatch', why: 'no dispatch action' },
  { pattern: '/start', why: 'no start action' },
  { pattern: '/complete', why: 'no complete action' },
  { pattern: '/issue', why: 'no issue action' },
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
  const downloadFiles = all.filter((f) => VOUCHER_DOWNLOAD_ALLOWLIST.has(path.basename(f)));
  // The download control is EXEMPT from the blanket scan (it legitimately uses the
  // download mechanic); it is held to VOUCHER_DOWNLOAD_FORBIDDEN instead.
  const readOnly = all.filter(
    (f) => !MUTATION_ALLOWLIST.has(path.basename(f)) && !VOUCHER_DOWNLOAD_ALLOWLIST.has(path.basename(f)),
  );

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

  it('the voucher-download surface (Phase 2E) is a narrowly-scoped read-only GET download', () => {
    assert.equal(downloadFiles.length, VOUCHER_DOWNLOAD_ALLOWLIST.size, 'download files not found');
    // A download is a GET (read), NOT a mutation — it must stay out of the mutation allowlist.
    for (const f of downloadFiles) {
      assert.ok(!MUTATION_ALLOWLIST.has(path.basename(f)), 'download must not be a sanctioned mutation surface');
    }
    const control = downloadFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
    assert.ok(control.includes('voucher-download'), 'download control targets the voucher-download proxy');
    // The download mechanic IS permitted here (and would trip the blanket ban):
    assert.ok(control.includes('createObjectURL'), 'download control uses the exempted blob mechanic');
    assert.ok(scan(downloadFiles, FORBIDDEN).length > 0, 'download control is legitimately exempt from the blanket ban');
    // …but it must still pass the NARROWER download ban (no mutation/status/send/finance/dispatch, proxy only).
    assert.deepEqual(scan(downloadFiles, VOUCHER_DOWNLOAD_FORBIDDEN), [], 'download surface exceeded its scope');
  });

  it('the voucher-send surface (Phase 2F-B) is the fourth sanctioned mutation (POST + one typed-SEND input)', () => {
    const sendFiles = all.filter((f) => VOUCHER_SEND_ALLOWLIST.has(path.basename(f)));
    assert.equal(sendFiles.length, VOUCHER_SEND_ALLOWLIST.size, 'allowlisted send files not found');
    const combined = sendFiles.map((f) => readFileSync(f, 'utf8')).join('\n');
    assert.ok(combined.includes('voucher-send'), 'send surface must target the voucher-send proxy');
    // The control legitimately contains the ONE typed-SEND <input> and a POST (both
    // tripped by the blanket ban) — it must instead pass the narrower send ban.
    assert.ok(scan(sendFiles, FORBIDDEN).length > 0, 'send control is legitimately exempt from the blanket ban');
    assert.deepEqual(scan(sendFiles, VOUCHER_SEND_FORBIDDEN), [], 'send surface exceeded its scope');
  });

  it('the passenger-editing surface is limited to the sanctioned /v2/passengers CRUD', () => {
    const files = all.filter((f) => PASSENGER_ALLOWLIST.has(path.basename(f)));
    assert.equal(files.length, PASSENGER_ALLOWLIST.size, 'passenger files not found');
    const combined = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    assert.ok(combined.includes('/v2/passengers'), 'passenger surface must target the v2 passengers proxy');
    assert.ok(!combined.includes('assign-supplier'), 'passenger surface must not touch assignment');
    assert.ok(!combined.includes('/voucher'), 'passenger surface must not touch vouchers');
    assert.deepEqual(scan(files, PASSENGER_FORBIDDEN), [], 'passenger surface exceeded its scope');
  });

  it('the rooming-editing surface is limited to the sanctioned /v2/rooming CRUD', () => {
    const files = all.filter((f) => ROOMING_ALLOWLIST.has(path.basename(f)));
    assert.equal(files.length, ROOMING_ALLOWLIST.size, 'rooming files not found');
    const combined = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    assert.ok(combined.includes('/v2/rooming'), 'rooming surface must target the v2 rooming proxy');
    assert.ok(!combined.includes('assign-supplier'), 'rooming surface must not touch assignment');
    assert.ok(!combined.includes('/voucher'), 'rooming surface must not touch vouchers');
    assert.deepEqual(scan(files, ROOMING_FORBIDDEN), [], 'rooming surface exceeded its scope');
  });

  it('the voucher-packet-regenerate surface is a no-body POST to voucher-packets/:id/regenerate only', () => {
    const files = all.filter((f) => VOUCHER_PACKET_REGENERATE_ALLOWLIST.has(path.basename(f)));
    assert.equal(files.length, VOUCHER_PACKET_REGENERATE_ALLOWLIST.size, 'regenerate files not found');
    const combined = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    assert.ok(combined.includes('voucher-packets') && combined.includes('regenerate'), 'must target voucher-packets/:id/regenerate');
    assert.ok(!combined.includes('assign-supplier') && !combined.includes('/confirmation'), 'must not touch assignment/confirmation');
    assert.deepEqual(scan(files, VOUCHER_PACKET_REGENERATE_FORBIDDEN), [], 'regenerate surface exceeded its scope');
  });

  it('the mutation allowlist is exactly the sanctioned mutations (preview + download excluded)', () => {
    // 4 supplier/voucher surfaces × 2 (assign, confirm, voucher-generate, voucher-send)
    // + passenger (×2) + rooming (×2) + voucher-packet-regenerate (×1) = 13.
    assert.equal(MUTATION_ALLOWLIST.size, 13, 'the sanctioned mutation surfaces');
    for (const name of ['voucher-preview-control.tsx', 'voucher-download-control.tsx', 'voucher-send-preview-control.tsx']) {
      assert.ok(!MUTATION_ALLOWLIST.has(name), `${name} (read-only) must not be a mutation`);
    }
  });
});
