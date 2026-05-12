import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const operationalVoucherServiceSource = readFileSync(new URL('../../../api/src/operational-documents/operational-vouchers.service.ts', import.meta.url), 'utf8');
const vouchersControllerSource = readFileSync(new URL('../../../api/src/bookings/vouchers.controller.ts', import.meta.url), 'utf8');
const quoteVoucherPreviewPageSource = readFileSync(new URL('../quotes/[id]/vouchers/[itemId]/preview/page.tsx', import.meta.url), 'utf8');
const quoteServicePlannerSource = readFileSync(new URL('../quotes/[id]/QuoteServicePlanner.tsx', import.meta.url), 'utf8');
const quoteVoucherPreviewProxySource = readFileSync(new URL('../api/vouchers/quote-items/[quoteItemId]/preview/route.ts', import.meta.url), 'utf8');

describe('voucher foundation phase one', () => {
  it('adds a live quote item voucher domain foundation without pdf or booking automation', () => {
    assert.match(operationalVoucherServiceSource, /type: 'HOTEL' \| 'TRANSPORT' \| 'SERVICE'/);
    assert.match(operationalVoucherServiceSource, /quoteItemId: string/);
    assert.match(operationalVoucherServiceSource, /quoteDayId: string \| null/);
    assert.match(operationalVoucherServiceSource, /operationalStatus: 'DRAFT'/);
    assert.match(operationalVoucherServiceSource, /remarks: string\[\]/);
    assert.match(operationalVoucherServiceSource, /generatedFrom: 'live-operational-quote-data'/);
    assert.doesNotMatch(operationalVoucherServiceSource, /quoteItemVoucherPdf|createBooking|invoice|accounting/i);
  });

  it('previews hotel vouchers from live quote hotel, rooming, meal plan, dates, and pax', () => {
    assert.match(operationalVoucherServiceSource, /buildQuoteHotelVoucherSection/);
    assert.match(operationalVoucherServiceSource, /roomingGroups/);
    assert.match(operationalVoucherServiceSource, /mapQuoteRoomingGroup/);
    assert.match(operationalVoucherServiceSource, /mealPlan/);
    assert.match(operationalVoucherServiceSource, /checkIn/);
    assert.match(operationalVoucherServiceSource, /checkOut/);
    assert.match(quoteVoucherPreviewPageSource, /Hotel voucher/);
    assert.match(quoteVoucherPreviewPageSource, /Rooming/);
  });

  it('previews transport and operational service vouchers from live quote data', () => {
    assert.match(operationalVoucherServiceSource, /buildQuoteTransportVoucherSection/);
    assert.match(operationalVoucherServiceSource, /route:/);
    assert.match(operationalVoucherServiceSource, /serviceType:/);
    assert.match(operationalVoucherServiceSource, /pickup:/);
    assert.match(operationalVoucherServiceSource, /dropoff:/);
    assert.match(operationalVoucherServiceSource, /buildQuoteServiceVoucherSection/);
    assert.match(operationalVoucherServiceSource, /Meet|assist|fast track|wheelchair|guide/i);
    assert.match(quoteVoucherPreviewPageSource, /Transport voucher/);
    assert.match(quoteVoucherPreviewPageSource, /Service voucher/);
  });

  it('exposes a minimal admin preview route for quote item vouchers', () => {
    assert.match(vouchersControllerSource, /@Get\('quote-items\/:quoteItemId\/preview'\)/);
    assert.match(vouchersControllerSource, /getQuoteItemVoucherPreview\(quoteItemId, actor\)/);
    assert.match(quoteVoucherPreviewProxySource, /vouchers\/quote-items\/\$\{quoteItemId\}\/preview/);
    assert.match(quoteVoucherPreviewPageSource, /api\/vouchers\/quote-items\/\$\{itemId\}\/preview/);
    assert.match(quoteServicePlannerSource, /\/quotes\/\$\{quoteId\}\/vouchers\/\$\{item\.id\}\/preview/);
    assert.doesNotMatch(quoteVoucherPreviewPageSource, /pdf|invoice|accounting/i);
  });
});
