import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { CatalogV2View, type CatalogV2Summary } from '../../../components/catalog/v2/catalog-v2-view';
import { isCatalogV2Enabled } from './catalog-v2-flag';

// Components use Next's automatic JSX runtime; expose React for the classic runtime.
(globalThis as unknown as { React?: unknown }).React = React;

function sample(over: Partial<CatalogV2Summary> = {}): CatalogV2Summary {
  return {
    meta: { role: 'admin', pricingRedacted: false, counts: { suppliers: 2, hotelContracts: 1, totalWarnings: 2 } },
    serviceCatalog: { services: 8, activities: 1, activitiesActive: 1, guides: 0, guidesActive: 0, restaurants: 0, restaurantsActive: 0 },
    suppliers: [
      {
        id: 'sup-1',
        name: 'Almushtari Logistics',
        type: 'transport',
        email: 'ops@almushtari.example',
        baseCity: 'Amman',
        operationallyActive: true,
        currencies: ['JOD'],
        serviceCount: 3,
        contractCount: 1,
        contractValidity: { active: 1, expiringSoon: 0, expired: 0, noValidityWindow: 0 },
        rateCount: 4,
        pricingRedacted: false,
        pricing: { transportDiscountPercent: 25 },
        warnings: [],
      },
      {
        id: 'sup-2',
        name: 'Petra Guides Co',
        type: 'guide',
        email: null,
        baseCity: null,
        operationallyActive: false,
        currencies: [],
        serviceCount: 0,
        contractCount: 0,
        contractValidity: { active: 0, expiringSoon: 0, expired: 0, noValidityWindow: 0 },
        rateCount: 0,
        pricingRedacted: false,
        pricing: { transportDiscountPercent: 0 },
        warnings: [
          { code: 'MISSING_EMAIL', severity: 'high', message: 'Supplier has no email on file.' },
          { code: 'NO_ACTIVE_SERVICES', severity: 'medium', message: 'Supplier has no active services or valid contracts.' },
        ],
      },
    ],
    hotelContracts: [
      {
        id: 'h1',
        name: 'Winter 2026',
        hotelName: 'Movenpick Petra',
        validFrom: '2026-01-01T00:00:00.000Z',
        validTo: '2026-12-31T00:00:00.000Z',
        currency: 'USD',
        confidence: 'IMPORTED_UNVERIFIED',
        validity: 'active',
        warnings: [{ code: 'UNVERIFIED_HOTEL_CONTRACT', severity: 'medium', message: 'Hotel contract is not verified.' }],
      },
    ],
    warningCounts: {
      MISSING_EMAIL: 1,
      MULTIPLE_EMAILS: 0,
      MISSING_RATES: 0,
      NO_ACTIVE_SERVICES: 1,
      CURRENCY_MISMATCH: 0,
      MISSING_BASE_CITY: 0,
      EXPIRED_CONTRACT: 0,
      EXPIRING_SOON: 0,
      UNVERIFIED_HOTEL_CONTRACT: 1,
    },
    note: 'Read-only summary. No changes are made.',
    ...over,
  };
}

const render = (summary: CatalogV2Summary) => renderToStaticMarkup(createElement(CatalogV2View, { summary }));

describe('CatalogV2View — read-only rendering', () => {
  const html = render(sample());

  it('renders the header, read-only badge, and note', () => {
    assert.ok(html.includes('Product Catalog V2'));
    assert.ok(html.includes('Read-only'));
    assert.ok(html.includes('Read-only summary. No changes are made.'));
  });

  it('renders summary counts', () => {
    assert.ok(html.includes('Suppliers'));
    assert.ok(html.includes('Services'));
    assert.ok(html.includes('Warnings'));
  });

  it('renders the suppliers table with rows', () => {
    assert.ok(html.includes('Almushtari Logistics'));
    assert.ok(html.includes('Petra Guides Co'));
    assert.ok(html.includes('transport'));
    assert.ok(html.includes('ops@almushtari.example'));
  });

  it('renders the service catalog summary', () => {
    assert.ok(html.includes('Service catalog'));
    assert.ok(html.includes('Activities:'));
  });

  it('renders the hotel contracts table', () => {
    assert.ok(html.includes('Hotel contracts'));
    assert.ok(html.includes('Movenpick Petra'));
  });

  it('renders the data-quality warnings + per-entity warning chips', () => {
    assert.ok(html.includes('Data-quality warnings'));
    assert.ok(html.includes('MISSING_EMAIL'));
    assert.ok(html.includes('UNVERIFIED_HOTEL_CONTRACT'));
    assert.ok(html.includes('NO_ACTIVE_SERVICES'));
  });

  it('exposes the three filters (search, type, warnings-only) but NO buttons/forms/mutation controls', () => {
    assert.ok(html.includes('Search suppliers'), 'text search present');
    assert.ok(html.includes('Supplier type'), 'type filter present');
    assert.ok(html.includes('Warnings only'), 'warnings-only toggle present');
    for (const forbidden of ['<button', '<form', 'Create', 'Edit', 'Delete', '>Send<', 'Save', 'Add supplier', 'Regenerate']) {
      assert.ok(!html.includes(forbidden), `must not render "${forbidden}"`);
    }
  });
});

describe('CatalogV2View — pricing redaction', () => {
  it('redacted role: shows the redaction notice, hides pricing figures, no discount value leaks', () => {
    const redacted = sample({
      meta: { role: 'viewer', pricingRedacted: true, counts: { suppliers: 2, hotelContracts: 1, totalWarnings: 2 } },
      suppliers: sample().suppliers.map((s) => ({ ...s, pricingRedacted: true, pricing: null })),
    });
    const html = render(redacted);
    assert.ok(html.includes('Pricing is hidden for your role.'));
    assert.ok(html.includes('Hidden'), 'pricing cell shows Hidden');
    assert.ok(!html.includes('% disc.'), 'no discount figure rendered');
    assert.ok(!html.includes('25'), 'no redacted discount value leaks');
    // structure still renders
    assert.ok(html.includes('Almushtari Logistics'));
  });

  it('pricing role: shows the discount figure and no redaction notice', () => {
    const html = render(sample());
    assert.ok(html.includes('% disc.'));
    assert.ok(!html.includes('Pricing is hidden for your role.'));
  });
});

// --- proxy + flag source checks ---------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url)); // app/catalog/v2
const proxySrc = readFileSync(path.join(HERE, '../../api/catalog/v2/summary/route.ts'), 'utf8');

describe('catalog v2 summary proxy — read-only GET JSON forward', () => {
  it('exposes GET only (no POST/PATCH/DELETE/PUT)', () => {
    assert.match(proxySrc, /export async function GET/);
    assert.ok(!/export async function (POST|PATCH|DELETE|PUT)/.test(proxySrc), 'proxy must be GET-only');
  });

  it('targets the backend catalog summary endpoint and forwards JSON, no body/redirect', () => {
    assert.match(proxySrc, /\/catalog\/v2\/summary`/);
    assert.match(proxySrc, /forwardProxyJsonResponse/);
    assert.match(proxySrc, /method:\s*'GET'/);
    assert.ok(!/JSON\.stringify|body:|formData|NextResponse\.redirect|status:\s*303/.test(proxySrc), 'no body/redirect');
  });
});

describe('catalog v2 flag', () => {
  it('is OFF unless NEXT_PUBLIC_CATALOG_V2 === "true"', () => {
    const prev = process.env.NEXT_PUBLIC_CATALOG_V2;
    try {
      delete process.env.NEXT_PUBLIC_CATALOG_V2;
      assert.equal(isCatalogV2Enabled(), false);
      process.env.NEXT_PUBLIC_CATALOG_V2 = 'false';
      assert.equal(isCatalogV2Enabled(), false);
      process.env.NEXT_PUBLIC_CATALOG_V2 = 'true';
      assert.equal(isCatalogV2Enabled(), true);
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_CATALOG_V2;
      else process.env.NEXT_PUBLIC_CATALOG_V2 = prev;
    }
  });
});
