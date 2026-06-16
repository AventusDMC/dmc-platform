import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

// Phase O.2B-1 — read-only supplier-confirmation preview (UI + proxy).

const component = readFileSync(new URL('./SupplierConfirmationPreview.tsx', import.meta.url), 'utf8');
const proxy = readFileSync(
  new URL('../../api/bookings/[id]/supplier-confirmation/preview/route.ts', import.meta.url),
  'utf8',
);
const sendProxy = readFileSync(
  new URL('../../api/bookings/[id]/supplier-confirmation/send/route.ts', import.meta.url),
  'utf8',
);
const page = readFileSync(new URL('./supplier-confirmation/page.tsx', import.meta.url), 'utf8');

describe('SupplierConfirmationPreview — read-only', () => {
  it('preview fetch is a read-only GET; the only mutating call is the gated send', () => {
    assert.match(component, /\/bookings\/\$\{bookingId\}\/supplier-confirmation\/preview/, 'hits the preview endpoint');
    // The preview fetch carries no method (GET). The ONLY POST is the gated send.
    const postCount = (component.match(/method: 'POST'/g) || []).length;
    assert.equal(postCount, 1, 'exactly one POST — the O.2B-2C gated send');
    assert.ok(!/method:\s*['"](PATCH|PUT|DELETE)['"]/.test(component), 'no PATCH/PUT/DELETE');
    // Never routes through the legacy arbitrary-email/send-document paths.
    assert.ok(!/send-document-email|sendDocument|sendInvoice|sendPaymentReminder/.test(component), 'no legacy send wiring');
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

describe('O.2B-2C — gated send (UI + proxy)', () => {
  it('Send appears only for READY; otherwise shows the reason, no send control', () => {
    assert.match(component, /supplier\.readiness === 'READY' \? \(/, 'send gated on READY');
    assert.match(component, /Send confirmation request/, 'send button label');
    assert.match(component, /Send unavailable —/, 'non-ready shows reason instead of a send control');
  });

  it('clicking Send opens a confirm modal — it does NOT send directly', () => {
    assert.match(component, /onClick=\{\(\) => setConfirmFor\(supplier\)\}/, 'card click only opens modal');
    // The POST send is wired ONLY to the modal confirm handler.
    assert.match(component, /onClick=\{handleConfirmSend\}/, 'modal confirm triggers the send');
    const postCount = (component.match(/method: 'POST'/g) || []).length;
    assert.equal(postCount, 1, 'exactly one POST (the gated send)');
    // the POST lives inside handleConfirmSend, not the card button
    const handler = component.slice(component.indexOf('async function handleConfirmSend'), component.indexOf('async function handleConfirmSend') + 900);
    assert.match(handler, /method: 'POST'/, 'send POST is in the confirm handler');
  });

  it('confirm modal repeats supplier/email/booking/services/status', () => {
    for (const fragment of [
      'role="dialog"',
      'confirmFor.recipient.supplierName',
      'confirmFor.recipient.email',
      'preview?.bookingRef',
      'confirmFor.services.length',
      'Status after send:',
      'Requested',
      'Confirm & send',
    ]) {
      assert.ok(component.includes(fragment), `modal shows: ${fragment}`);
    }
  });

  it('send posts SCOPE ONLY (supplierId) — never an email/subject/body', () => {
    assert.match(component, /\/bookings\/\$\{bookingId\}\/supplier-confirmation\/send/, 'hits the gated send endpoint');
    assert.match(component, /JSON\.stringify\(\{ supplierId: confirmFor\.recipient\.supplierId \}\)/, 'body is supplierId only');
    const handler = component.slice(component.indexOf('async function handleConfirmSend'), component.indexOf('async function handleConfirmSend') + 900);
    for (const forbidden of ['email:', 'subject:', "to:", 'recipient:']) {
      assert.ok(!handler.includes(forbidden), `send body must not include ${forbidden}`);
    }
  });

  it('send proxy is POST-only and forwards to the backend send route', () => {
    assert.match(sendProxy, /export async function POST\(/, 'POST handler');
    assert.ok(!/export async function (GET|PATCH|PUT|DELETE)\(/.test(sendProxy), 'no other handlers');
    assert.match(sendProxy, /\/bookings\/\$\{id\}\/supplier-confirmation\/send/, 'forwards to backend send');
    assert.match(sendProxy, /forwardProxyJsonResponse/, 'returns JSON');
  });
});

describe('O.2B-2G — card heading reflects the resolved recipient supplier', () => {
  it('heading binds to the resolved supplier name (supplier.supplierName)', () => {
    // The eyebrow heading uses supplier.supplierName, which the backend now sets to
    // the RESOLVED Supplier.name (via FK) — see preview tests G1–G4.
    assert.match(component, /<p className="eyebrow">\{supplier\.supplierName\}<\/p>/, 'heading = resolved supplier name');
  });

  it('shows the differing free-text service label as a display-only note only when present', () => {
    assert.match(component, /supplier\.serviceSupplierName \? \(/, 'conditional on a differing free-text label');
    assert.match(component, /Listed on service as:/, 'display-only source label');
    assert.match(component, /<em>\{supplier\.serviceSupplierName\}<\/em>/, 'renders the free-text label');
    assert.match(component, /serviceSupplierName: string \| null;/, 'type carries the display-only field');
  });

  it('the confirm modal names the RESOLVED recipient (not the free-text label)', () => {
    // recipient.supplierName / recipient.email are the resolved values (FK-derived).
    assert.match(component, /Supplier: <strong>\{confirmFor\.recipient\.supplierName\}<\/strong>/, 'modal uses resolved name');
    assert.match(component, /Email: <strong>\{confirmFor\.recipient\.email\}<\/strong>/, 'modal uses resolved email');
    // The modal must NOT fall back to the top-level free-text/service label.
    assert.ok(!/confirmFor\.serviceSupplierName/.test(component), 'modal never shows the free-text service label as the recipient');
  });
});
