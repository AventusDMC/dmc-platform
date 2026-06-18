import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { mapQuoteToProposalV3 } from './proposal-v3.mapper';
import { ProposalV3Service } from './proposal-v3.service';

// P4 — relative-logo fallback. A CompanyBranding.logoUrl stored as a relative "/uploads/…" path
// cannot be loaded by the network-less PDF/HTML export and would render as a broken image. Such a
// path now falls back to the embedded AXIS data URI. data: URIs and reachable remote logos are
// unaffected; empty stays empty.

function quoteWithLogo(logoUrl: string | null) {
  return {
    id: 'q-logo', quoteCurrency: 'USD', title: 'Jordania Clásica', adults: 2, children: 0, nightCount: 0, quoteOptions: [],
    itineraries: [{ id: 'd1', dayNumber: 1, title: 'Day 1: Amman' }], quoteItems: [],
    brandCompany: { name: 'Acme DMC', branding: { displayName: 'Acme DMC', logoUrl } },
  };
}

// ---- unit: resolveLogoForRender contract -----------------------------------------------------
test('P4: a relative "/uploads/…" logo path falls back to the embedded AXIS data URI', async () => {
  const service = new ProposalV3Service({} as any) as any;
  const resolved = await service.resolveLogoForRender('/uploads/branding/00000000-0000-0000-0000-000000000001-1777.png');
  assert.match(resolved, /^data:image\/png;base64,/, 'relative path → embedded fallback, never a broken relative src');
});

test('P4: a bare relative filename also falls back to the embedded data URI', async () => {
  const service = new ProposalV3Service({} as any) as any;
  assert.match(await service.resolveLogoForRender('brand/logo.png'), /^data:image\/png;base64,/);
});

test('P4: an existing data: URI logo is preserved unchanged', async () => {
  const service = new ProposalV3Service({} as any) as any;
  assert.equal(await service.resolveLogoForRender('data:image/png;base64,QUJD'), 'data:image/png;base64,QUJD');
});

test('P4: empty logo stays empty (no broken/fabricated src; mapper never emits empty in practice)', async () => {
  const service = new ProposalV3Service({} as any) as any;
  assert.equal(await service.resolveLogoForRender(''), '');
});

test('P4: an unreachable remote logo still falls back to the embedded data URI', async () => {
  const service = new ProposalV3Service({} as any) as any;
  assert.match(await service.resolveLogoForRender('https://nonexistent.invalid/logo.png'), /^data:image\/png;base64,/);
});

// ---- render: no broken relative src in the exported HTML --------------------------------------
test('P4: a relative branding logo renders as an embedded data URI in the HTML, not a "/uploads/…" src', async () => {
  const vm: any = mapQuoteToProposalV3(quoteWithLogo('/uploads/branding/abc.png') as any, 'es');
  const html: string = await (new ProposalV3Service({} as any) as any).renderHtml(vm);
  assert.match(html, /class="proposal-brand-logo" src="data:image\/png;base64,/, 'logo img uses the embedded data URI');
  assert.doesNotMatch(html, /src="\/uploads\//, 'no unreachable relative /uploads/ src in the export');
});

test('P4: no proposal text changes — a Spanish render still produces the expected non-logo fields', async () => {
  const vm: any = mapQuoteToProposalV3(quoteWithLogo('/uploads/branding/abc.png') as any, 'es');
  assert.equal(vm.documentTitle, 'Jordania Clásica', 'title unchanged by the logo fix');
});
