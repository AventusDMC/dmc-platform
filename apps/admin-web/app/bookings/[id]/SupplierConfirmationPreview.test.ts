import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Phase O.2B-1 — read-only supplier-confirmation preview (UI + proxy).

const component = readFileSync(new URL('./SupplierConfirmationPreview.tsx', import.meta.url), 'utf8');
const proxy = readFileSync(
  new URL('../../api/bookings/[id]/supplier-confirmation/preview/route.ts', import.meta.url),
  'utf8',
);
const page = readFileSync(new URL('./supplier-confirmation/page.tsx', import.meta.url), 'utf8');

describe('SupplierConfirmationPreview — read-only', () => {
  it('fetches the read-only GET preview endpoint and never sends', () => {
    assert.match(component, /\/bookings\/\$\{bookingId\}\/supplier-confirmation\/preview/, 'hits the preview endpoint');
    // No mutating method anywhere in the component.
    assert.ok(!/method:\s*['"](POST|PATCH|PUT|DELETE)['"]/.test(component), 'no mutating fetch method');
    // No send wiring of any kind.
    assert.ok(!/send-document-email|sendDocument|sendInvoice|sendPaymentReminder/.test(component), 'no email-send wiring');
    assert.ok(!/>\s*Send\b/.test(component), 'no Send button label');
  });

  it('renders recipient, subject, body, and service count', () => {
    for (const fragment of [
      'Preview confirmation',
      'supplier.recipient.email',
      'supplier.subject',
      'supplier.body',
      'service(s) included',
    ]) {
      assert.ok(component.includes(fragment), `component shows: ${fragment}`);
    }
    // Clearly labelled read-only.
    assert.match(component, /No email is sent/);
  });

  it('O.2B-2B — shows recipient source + readiness badge + the two block messages', () => {
    for (const fragment of [
      'Recipient source',
      'RECIPIENT_SOURCE_LABEL',
      'READINESS_LABEL',
      "assignedSupplierId: 'Assigned supplier'",
      "supplierId: 'Linked supplier'",
      "none: 'No supplier linked'",
      'Assign supplier first',
      'Supplier email missing',
      'Assign supplier first before sending.',
      'Supplier email missing — update supplier profile before sending.',
      'data-readiness={supplier.readiness}',
    ]) {
      assert.ok(component.includes(fragment), `component shows: ${fragment}`);
    }
  });

  it('proxy route is GET-only and forwards the optional query', () => {
    assert.match(proxy, /export async function GET\(/, 'GET handler');
    assert.ok(!/export async function (POST|PATCH|PUT|DELETE)\(/.test(proxy), 'no mutating proxy handlers');
    assert.match(proxy, /\/bookings\/\$\{id\}\/supplier-confirmation\/preview\$\{request\.nextUrl\.search\}/, 'forwards query');
    assert.match(proxy, /forwardProxyJsonResponse/, 'returns JSON');
  });

  it('is mounted on the supplier-confirmation page', () => {
    assert.match(page, /import \{ SupplierConfirmationPreview \} from '\.\.\/SupplierConfirmationPreview'/, 'imported');
    assert.match(page, /<SupplierConfirmationPreview\s+apiBaseUrl=\{ACTION_API_BASE_URL\}\s+bookingId=\{booking\.id\}/, 'mounted with /api base + booking id');
  });
});
