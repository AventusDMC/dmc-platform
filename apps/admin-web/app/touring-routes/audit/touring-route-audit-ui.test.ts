import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const previewSource = readFileSync(new URL('./TouringRouteAuditPreview.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../../globals.css', import.meta.url), 'utf8');

describe('touring route audit interaction layer', () => {
  it('keeps audit controls pointer-active and opens the dry-run modal from the button', () => {
    assert.match(pageSource, /touring-audit-page/);
    assert.match(pageSource, /touring-audit-nav-link/);
    assert.match(previewSource, /className="secondary-button touring-audit-dry-run-button"/);
    assert.match(previewSource, /setSelectedDryRun\(row\)/);
    assert.match(previewSource, /event\.stopPropagation\(\)/);
    assert.match(previewSource, /touring-audit-modal-backdrop/);
    assert.match(previewSource, /touring-audit-modal-card/);
  });

  it('does not use generic modal classes that can create page-wide click blockers', () => {
    assert.doesNotMatch(previewSource, /className="modal-backdrop"/);
    assert.doesNotMatch(previewSource, /className="modal-card"/);
    assert.match(cssSource, /\.touring-audit-page,\n\.touring-audit-page \*/);
    assert.match(cssSource, /\.touring-audit-page :where\(a, button, select, input, label\)/);
    assert.match(cssSource, /\.touring-audit-modal-backdrop/);
    assert.match(cssSource, /\.touring-audit-modal-card/);
    assert.doesNotMatch(cssSource, /^\.modal-backdrop\s*\{/m);
    assert.doesNotMatch(cssSource, /^\.modal-card\s*\{/m);
  });
});
