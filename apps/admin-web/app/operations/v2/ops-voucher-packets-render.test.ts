import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import {
  VoucherPacketsPanel,
  type VoucherPacketGroupVM,
} from '../../../components/ops/v2/voucher-packets-panel';

// Components use Next's automatic JSX runtime; expose React for the classic runtime.
(globalThis as unknown as { React?: unknown }).React = React;

const SAMPLE: VoucherPacketGroupVM[] = [
  {
    groupingKey: 'TRANSPORT:sup-1',
    groupingType: 'TRANSPORT',
    supplierId: 'sup-1',
    supplierName: 'Almushtari Logistics',
    serviceIds: ['t1', 't2'],
    serviceCount: 2,
    dateRange: { start: '2026-10-01', end: '2026-10-03' },
    dayNumbers: [1, 3],
    memberLabels: ['Airport transfer', 'Petra day transfer'],
  },
  {
    groupingKey: 'HOTEL:sup-2:2026-10-01',
    groupingType: 'HOTEL',
    supplierId: 'sup-2',
    supplierName: 'Movenpick Petra',
    serviceIds: ['h1'],
    serviceCount: 1,
    dateRange: { start: '2026-10-01', end: '2026-10-01' },
    dayNumbers: [1],
    memberLabels: ['Movenpick Petra — 2 nights'],
  },
];

const BK = 'bk-1';

describe('VoucherPacketsPanel — content (groups present, none generated)', () => {
  const html = renderToStaticMarkup(createElement(VoucherPacketsPanel, { groups: SAMPLE, bookingId: BK }));

  it('renders the read-only heading + preview tag', () => {
    assert.ok(html.includes('Supplier packets'));
    assert.ok(html.includes('Preview'));
  });

  it('renders each group: supplier, type, count, labels', () => {
    assert.ok(html.includes('Almushtari Logistics'));
    assert.ok(html.includes('TRANSPORT'));
    assert.ok(html.includes('2 services'));
    assert.ok(html.includes('Airport transfer'));
    assert.ok(html.includes('Movenpick Petra'));
    assert.ok(html.includes('HOTEL'));
  });

  it('renders NO mutating controls, and NO Download for ungenerated groups', () => {
    for (const forbidden of ['<button', '<form', '<input', '<select', '<textarea', 'Generate', 'Preview voucher', 'Download', '>Send<', 'Auto-assign']) {
      assert.ok(!html.includes(forbidden), `panel must not render "${forbidden}"`);
    }
  });

  it('carries NO finance/PII values', () => {
    assert.ok(!/unitSell|unitCost|totalSell|totalCost|margin|payable|passport|dateOfBirth/i.test(html), 'panel leaked a finance/PII key');
  });
});

describe('VoucherPacketsPanel — S5 Download PDF (generated packets only)', () => {
  const GENERATED: VoucherPacketGroupVM[] = [
    { ...SAMPLE[0], existingPacketId: 'packet-abc', packetStatus: 'GENERATED' }, // transport, generated
    { ...SAMPLE[1] }, // hotel, NOT generated
  ];
  const html = renderToStaticMarkup(createElement(VoucherPacketsPanel, { groups: GENERATED, bookingId: BK }));

  it('shows a Download PDF link for the generated packet, pointing at the proxy', () => {
    assert.ok(html.includes('Download PDF'), 'Download PDF affordance missing');
    assert.ok(html.includes(`href="/api/bookings/${BK}/voucher-packets/packet-abc/pdf"`), 'download href wrong');
  });

  it('shows exactly ONE Download PDF (hidden for the ungenerated group)', () => {
    assert.equal(html.split('Download PDF').length - 1, 1, 'only generated groups get a download link');
  });

  it('adds NO Send / send-preview / Generate / button / form', () => {
    for (const forbidden of ['<button', '<form', '<input', '>Send<', 'Send preview', 'Generate', 'Preview voucher']) {
      assert.ok(!html.includes(forbidden), `panel must not render "${forbidden}"`);
    }
  });
});

describe('VoucherPacketsPanel — empty state', () => {
  it('shows the empty message and no controls', () => {
    const html = renderToStaticMarkup(createElement(VoucherPacketsPanel, { groups: [], bookingId: BK }));
    assert.ok(html.includes('No supplier packets yet'));
    assert.ok(!html.includes('<button'), 'empty state must have no buttons');
    assert.ok(!html.includes('Download PDF'), 'no download in empty state');
  });
});

// --- Read-only proxy: JSON forward, GET only, never redirect/mutate ----------

const HERE = path.dirname(fileURLToPath(import.meta.url)); // app/operations/v2
const proxySrc = readFileSync(
  path.join(HERE, '../../api/bookings/[id]/voucher-packets/groups/route.ts'),
  'utf8',
);

describe('voucher-packets groups proxy — read-only JSON forward', () => {
  it('exposes GET only (no POST/PATCH/DELETE)', () => {
    assert.match(proxySrc, /export async function GET/);
    assert.ok(!/export async function (POST|PATCH|DELETE|PUT)/.test(proxySrc), 'proxy must be GET-only');
  });

  it('targets the backend voucher-packets/groups read endpoint and forwards JSON', () => {
    assert.match(proxySrc, /\/bookings\/\$\{id\}\/voucher-packets\/groups`/);
    assert.match(proxySrc, /forwardProxyJsonResponse/);
    assert.match(proxySrc, /method:\s*'GET'/);
  });

  it('never redirects, posts a body, or uses formData', () => {
    assert.ok(!/NextResponse\.redirect|status:\s*303|formData|JSON\.stringify/.test(proxySrc), 'proxy must not mutate/redirect');
  });
});

// --- S5 read-only PDF proxy: binary passthrough, GET only, never mutate -------

const pdfProxySrc = readFileSync(
  path.join(HERE, '../../api/bookings/[id]/voucher-packets/[packetId]/pdf/route.ts'),
  'utf8',
);

describe('voucher-packet PDF proxy — read-only binary passthrough', () => {
  it('exposes GET only (no POST/PATCH/DELETE)', () => {
    assert.match(pdfProxySrc, /export async function GET/);
    assert.ok(!/export async function (POST|PATCH|DELETE|PUT)/.test(pdfProxySrc), 'proxy must be GET-only');
  });

  it('targets the backend packet PDF endpoint, forwards auth, streams application/pdf', () => {
    assert.match(pdfProxySrc, /\/bookings\/\$\{id\}\/voucher-packets\/\$\{packetId\}\/pdf`/);
    assert.match(pdfProxySrc, /buildActorHeaders/);
    assert.match(pdfProxySrc, /application\/pdf/);
    assert.match(pdfProxySrc, /arrayBuffer/);
    assert.match(pdfProxySrc, /content-disposition/);
  });

  it('is a binary passthrough (not JSON forward) and never redirects/mutates', () => {
    assert.ok(!/forwardProxyJsonResponse/.test(pdfProxySrc), 'PDF proxy must not JSONify the body');
    assert.ok(!/NextResponse\.redirect|status:\s*303|formData/.test(pdfProxySrc), 'proxy must not redirect/mutate');
  });
});
