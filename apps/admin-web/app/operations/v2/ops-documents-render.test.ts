import assert from 'node:assert/strict';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it } from 'node:test';
import { DocumentsTab } from '../../../components/ops/v2/documents-tab';
import { buildDocumentsVM } from './ops-documents-vm';
import { DOCS_REDACTED_RAW, EMPTY_DOCS_DETAIL, SAMPLE_DOCS_DETAIL } from './ops-documents.fixtures';

// Components are authored for Next's automatic JSX runtime (no `import React`);
// tsx transpiles with the classic runtime, so expose React for the render.
(globalThis as unknown as { React?: unknown }).React = React;

const BK = 'bk-1';
const html = renderToStaticMarkup(
  createElement(DocumentsTab, { vm: buildDocumentsVM(SAMPLE_DOCS_DETAIL), bookingId: BK }),
);

describe('DocumentsTab render — content', () => {
  it('shows the persistent read-only notice', () => {
    assert.ok(html.includes('Document generation, download, and sending are disabled in this preview. Changes are made in Classic.'));
  });

  it('renders grouped document list', () => {
    assert.ok(html.includes('Vouchers'));
    assert.ok(html.includes('Transport voucher'));
    assert.ok(html.includes('Passenger manifest'));
    assert.ok(html.includes('Supplier confirmation preview'));
  });

  it('shows the section-level Classic documents link', () => {
    assert.ok(html.includes(`href="/bookings/${BK}?tab=documents"`));
    assert.ok(html.includes('Open documents in Classic'));
  });

  it('renders disabled "Coming later" actions', () => {
    for (const label of ['Generate', 'Download', 'Send', 'Preview', 'Export', 'Print']) {
      assert.ok(html.includes(label), `missing disabled action "${label}"`);
    }
    assert.ok(html.includes('Coming later'));
    assert.ok(html.includes('aria-disabled="true"'));
    assert.ok(html.includes('disabled'));
  });
});

describe('DocumentsTab render — read-only / data safety', () => {
  it('renders no forms / inputs / real document mechanics', () => {
    for (const forbidden of ['<form', '<input', '<select', '<textarea', 'window.print', 'createObjectURL', 'download=', '.pdf', '/export', 'action="/api']) {
      assert.ok(!html.includes(forbidden), `documents tab must not render "${forbidden}"`);
    }
  });

  it('renders no raw snapshot JSON, sensitive note, or financial values', () => {
    for (const raw of DOCS_REDACTED_RAW) {
      assert.ok(!html.includes(raw), `documents tab leaked "${raw}"`);
    }
  });
});

describe('DocumentsTab render — empty state', () => {
  const emptyHtml = renderToStaticMarkup(
    createElement(DocumentsTab, { vm: buildDocumentsVM(EMPTY_DOCS_DETAIL), bookingId: BK }),
  );
  it('shows the empty voucher state and keeps notice + Classic link', () => {
    assert.ok(emptyHtml.includes('Nothing generated yet.'));
    assert.ok(emptyHtml.includes('disabled in this preview'));
    assert.ok(emptyHtml.includes(`href="/bookings/${BK}?tab=documents"`));
  });
});
