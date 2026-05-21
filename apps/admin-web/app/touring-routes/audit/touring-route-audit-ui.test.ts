import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const previewSource = readFileSync(new URL('./TouringRouteAuditPreview.tsx', import.meta.url), 'utf8');
const detailPageSource = readFileSync(new URL('./[routeId]/page.tsx', import.meta.url), 'utf8');
const detailSource = readFileSync(new URL('./[routeId]/TouringRouteAuditDetail.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('../../globals.css', import.meta.url), 'utf8');

describe('touring route audit interaction layer', () => {
  it('keeps the list page simple and routes every row to the detail review page', () => {
    assert.match(pageSource, /touring-audit-page/);
    assert.match(pageSource, /touring-audit-nav-link/);
    assert.match(previewSource, /href=\{`\/touring-routes\/audit\/\$\{encodeURIComponent\(row\.id\)\}`\}/);
    assert.match(previewSource, /className="secondary-button touring-audit-review-link"/);
    assert.doesNotMatch(previewSource, /setSelectedDryRun/);
    assert.doesNotMatch(previewSource, /touring-audit-dry-run-button/);
  });

  it('moves dry-run and conversion controls to the route detail page only', () => {
    assert.match(detailPageSource, /\/touring-routes\/audit/);
    assert.match(detailSource, /ExecutionDryRunPanel/);
    assert.match(previewSource, /export function ExecutionDryRunPanel/);
    assert.match(previewSource, /convert-to-activity-master/);
    assert.match(previewSource, /ACTIVITY_MASTER_CONFIRMATION|confirmationText/);
    assert.ok(previewSource.indexOf('export function ExecutionDryRunPanel') < previewSource.indexOf('convert-to-activity-master'));
  });

  it('does not use generic modal classes that can create page-wide click blockers', () => {
    assert.doesNotMatch(previewSource, /className="modal-backdrop"/);
    assert.doesNotMatch(previewSource, /className="modal-card"/);
    assert.match(cssSource, /\.touring-audit-page,\n\.touring-audit-page \*/);
    assert.match(cssSource, /\.touring-audit-page :where\(a, button, select, input, label\)/);
    assert.match(cssSource, /\.touring-audit-review-link/);
    assert.doesNotMatch(cssSource, /\.touring-audit-modal-backdrop/);
    assert.doesNotMatch(cssSource, /\.touring-audit-modal-card/);
    assert.doesNotMatch(cssSource, /^\.modal-backdrop\s*\{/m);
    assert.doesNotMatch(cssSource, /^\.modal-card\s*\{/m);
  });
});
