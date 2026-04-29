import test = require('node:test');
import assert = require('node:assert/strict');
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path = require('node:path');
import { fileURLToPath } from 'node:url';
import { NAV_GROUPS, getActiveNavGroup, getVisibleNavGroups } from './admin-nav';

const layoutSource = readFileSync(new URL('./layout.tsx', import.meta.url), 'utf8');
const loginPageSource = readFileSync(new URL('./login/page.tsx', import.meta.url), 'utf8');
const middlewareSource = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8');
const adminServerSource = readFileSync(new URL('./lib/admin-server.ts', import.meta.url), 'utf8');
const chromeNavSource = readFileSync(new URL('./components/AdminChromeNav.tsx', import.meta.url), 'utf8');
const breadcrumbsSource = readFileSync(new URL('./components/AdminBreadcrumbs.tsx', import.meta.url), 'utf8');
const backButtonSource = readFileSync(new URL('./components/AdminBackButton.tsx', import.meta.url), 'utf8');
const headerActionsSource = readFileSync(new URL('./components/AdminHeaderActions.tsx', import.meta.url), 'utf8');
const quotePageSource = readFileSync(new URL('./quotes/[id]/page.tsx', import.meta.url), 'utf8');
const bookingPageSource = readFileSync(new URL('./bookings/[id]/page.tsx', import.meta.url), 'utf8');
const activityPageSource = readFileSync(new URL('./activities/[id]/page.tsx', import.meta.url), 'utf8');
const proposalPageSource = readFileSync(new URL('./proposal/[token]/page.tsx', import.meta.url), 'utf8');
const cssSource = readFileSync(new URL('./globals.css', import.meta.url), 'utf8');
const appDir = new URL('./', import.meta.url);

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const filePath = path.join(directory, entry);
    const stats = statSync(filePath);

    if (stats.isDirectory()) {
      if (entry === 'api' || entry === '.next' || entry === 'node_modules') {
        return [];
      }

      return collectSourceFiles(filePath);
    }

    if (!/\.(ts|tsx)$/.test(entry) || /\.(test|spec)\.(ts|tsx)$/.test(entry)) {
      return [];
    }

    return [filePath];
  });
}

test('admin navigation exposes Sales companies without role restriction', () => {
  const groups = getVisibleNavGroups('admin');
  const salesGroup = groups.find((group) => group.label === 'Sales');

  assert.ok(salesGroup);
  assert.equal(salesGroup.roles, undefined);
  assert.ok(salesGroup.children.some((child) => child.label === 'Companies' && child.href === '/companies'));
});

test('companies route resolves to Sales navigation group', () => {
  const activeGroup = getActiveNavGroup('/companies', 'admin');

  assert.equal(activeGroup.label, 'Sales');
});

test('admin navigation exposes first-class Activities catalog', () => {
  const groups = getVisibleNavGroups('admin');
  const catalogGroup = groups.find((group) => group.label === 'Product Catalog');

  assert.ok(catalogGroup);
  assert.ok(catalogGroup.children.some((child) => child.label === 'Activities' && child.href === '/activities'));
  assert.equal(getActiveNavGroup('/activities', 'admin').label, 'Product Catalog');
});

test('product catalog navigation uses canonical catalog destinations', () => {
  const catalogGroup = getVisibleNavGroups('admin').find((group) => group.label === 'Product Catalog');

  assert.ok(catalogGroup);
  assert.deepEqual(
    catalogGroup.children.map((child) => [child.label, child.href]),
    [
      ['Hotels', '/hotels'],
      ['Activities', '/activities'],
      ['Transport', '/transport'],
      ['Routes', '/routes'],
      ['Services', '/catalog?tab=services'],
      ['Suppliers', '/suppliers'],
      ['Transport Pricing', '/transport?tab=pricing-rules'],
    ],
  );
  assert.equal(getActiveNavGroup('/activities', 'admin').label, 'Product Catalog');
  assert.equal(getActiveNavGroup('/transport', 'admin').label, 'Product Catalog');
  assert.equal(catalogGroup.children.find((child) => child.label === 'Transport Pricing')?.href, '/transport?tab=pricing-rules');
  assert.equal(getActiveNavGroup('/routes', 'admin').label, 'Product Catalog');
  assert.equal(getActiveNavGroup('/suppliers', 'admin').label, 'Product Catalog');
});

test('every admin navigation link resolves to an existing app page', () => {
  for (const group of NAV_GROUPS) {
    for (const link of [group, ...group.children]) {
      const pathname = link.href.split('?')[0];

      if (!pathname.startsWith('/')) {
        continue;
      }

      const segments = pathname.split('/').filter(Boolean);
      const pageFile = new URL(`${segments.join('/')}${segments.length ? '/' : ''}page.tsx`, appDir);

      assert.equal(existsSync(pageFile), true, `${link.label} should resolve ${link.href} to ${pageFile.pathname}`);
    }
  }
});

test('admin sidebar renders the requested groups and section items', () => {
  const groups = getVisibleNavGroups('admin');
  const labels = groups.map((group) => group.label);

  assert.deepEqual(labels, ['Dashboard', 'Sales', 'Operations', 'Product Catalog', 'Finance', 'Administration']);
  assert.ok(groups.find((group) => group.label === 'Sales')?.children.some((child) => child.label === 'Quotes'));
  assert.ok(groups.find((group) => group.label === 'Operations')?.children.some((child) => child.label === 'Bookings'));
  assert.ok(groups.find((group) => group.label === 'Product Catalog')?.children.some((child) => child.label === 'Suppliers'));
  assert.ok(groups.find((group) => group.label === 'Finance')?.children.some((child) => child.label === 'Payments / Reconciliation'));
  assert.ok(groups.find((group) => group.label === 'Administration')?.children.some((child) => child.label === 'Branding'));
});

test('active admin navigation state is based on pathname', () => {
  assert.equal(getActiveNavGroup('/quotes/quote-123', 'admin').label, 'Sales');
  assert.equal(getActiveNavGroup('/bookings/booking-123', 'admin').label, 'Operations');
  assert.equal(getActiveNavGroup('/finance/reconciliation', 'admin').label, 'Finance');
  assert.match(chromeNavSource, /aria-current=\{active \? 'page' : undefined\}/);
  assert.match(chromeNavSource, /admin-top-nav-link-active/);
});

test('breadcrumbs render on quote booking and activity detail pages', () => {
  assert.match(breadcrumbsSource, /aria-label="Breadcrumb"/);
  assert.match(quotePageSource, /<AdminBreadcrumbs/);
  assert.match(quotePageSource, /label: `Quote \$\{quoteNumberLabel\}`/);
  assert.match(bookingPageSource, /<AdminBreadcrumbs/);
  assert.match(bookingPageSource, /label: `Booking \$\{bookingRef\}`/);
  assert.match(activityPageSource, /<AdminBreadcrumbs/);
  assert.match(activityPageSource, /label: activity\.name/);
});

test('back button uses browser history with a fallback route', () => {
  assert.match(backButtonSource, /window\.history\.length > 1/);
  assert.match(backButtonSource, /router\.back\(\)/);
  assert.match(backButtonSource, /router\.push\(fallbackHref\)/);
  assert.match(quotePageSource, /fallbackHref="\/quotes" label="Back to Quotes"/);
  assert.match(bookingPageSource, /fallbackHref="\/bookings" label="Back to Bookings"/);
  assert.match(activityPageSource, /fallbackHref="\/activities" label="Back to Activities"/);
});

test('dashboard shortcut routes consistently from page headers', () => {
  assert.match(headerActionsSource, /href="\/admin\/dashboard"/);
  assert.match(quotePageSource, /<AdminHeaderActions className="quote-dashboard-actions">/);
  assert.match(bookingPageSource, /<AdminHeaderActions className="booking-dashboard-actions">/);
  assert.match(activityPageSource, /<AdminHeaderActions>/);
});

test('auth middleware and server fetch preserve protected-route redirects', () => {
  assert.match(middlewareSource, /try \{/);
  assert.match(middlewareSource, /catch \(error\)/);
  assert.match(middlewareSource, /requestHeaders\.set\('x-dmc-pathname', pathname\)/);
  assert.match(middlewareSource, /PUBLIC_PATH_PREFIXES = \['\/invoice'\]/);
  assert.match(middlewareSource, /pathname\.startsWith\(prefix\)/);
  assert.doesNotMatch(middlewareSource, /NextResponse\.redirect/);
  assert.match(adminServerSource, /\/login\?reason=session-expired&next=\$\{encodeURIComponent\(pathname \|\| '\/'\)\}/);
  assert.match(adminServerSource, /if \(!sessionToken && !init\.allowAnonymous\)/);
  assert.match(adminServerSource, /if \(response\.status === 401\)/);
  assert.match(adminServerSource, /redirect\(buildLoginRedirectPath\(pathname\)\)/);
  assert.match(adminServerSource, /nextHeaders\.set\('Authorization', `Bearer \$\{sessionToken\}`\)/);
  assert.match(adminServerSource, /nextHeaders\.set\('Cookie', `dmc_session=\$\{sessionToken\}`\)/);
  assert.match(adminServerSource, /function normalizeAdminApiInput/);
});

test('safe fetch fallbacks do not swallow session redirects', () => {
  const guardedPages = [
    readFileSync(new URL('./admin/dashboard/page.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('./admin/reports/page.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('./quotes/page.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('./bookings/page.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('./activities/page.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('./hotels/page.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('./transport/page.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('./suppliers/page.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('./finance/page.tsx', import.meta.url), 'utf8'),
    readFileSync(new URL('./invoices/page.tsx', import.meta.url), 'utf8'),
  ];

  for (const source of guardedPages) {
    assert.match(source, /catch\s*\(error\)|\.catch\(\(error\)\s*=>/);
    assert.match(source, /isNextRedirectError\(error\)/);
    assert.match(source, /throw error;/);
  }
});

test('admin pages avoid direct production API URLs outside proxy routes', () => {
  const disallowed = /dmcapi-production|railway\.app|https?:\/\/[^'")`]+\/(?:quotes|bookings|invoices|activities|hotels|transport|suppliers)/i;

  for (const filePath of collectSourceFiles(fileURLToPath(new URL('./', import.meta.url)))) {
    const source = readFileSync(filePath, 'utf8');
    assert.doesNotMatch(source, disallowed, `${filePath} should use same-origin /api proxy routes`);
  }
});

test('admin UI does not link to legacy dashboard aliases', () => {
  const legacyDashboardHref = /href=["']\/dashboard["']|href:\s*['"]\/dashboard['"]/;

  for (const filePath of collectSourceFiles(fileURLToPath(new URL('./', import.meta.url)))) {
    const source = readFileSync(filePath, 'utf8');
    assert.doesNotMatch(source, legacyDashboardHref, `${filePath} should link to /admin/dashboard`);
  }
});

test('mobile admin navigation hooks and collapse classes exist', () => {
  assert.match(layoutSource, /className="admin-mobile-nav"/);
  assert.match(layoutSource, /<summary className="secondary-button">Menu<\/summary>/);
  assert.match(cssSource, /\.admin-mobile-nav/);
  assert.match(cssSource, /@media \(max-width: 859px\)/);
  assert.match(cssSource, /\.admin-sidebar\s*\{\s*display: none;/);
});

test('AXIS branding renders on sidebar and login with powered footer', () => {
  const adminLogoBlock = cssSource.match(/\.admin-brand-logo\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const adminLogoWrapperBlock = cssSource.match(/\.admin-brand-logo-wrapper\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const loginLogoBlock = cssSource.match(/\.login-brand-logo\s*\{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(layoutSource, /src="\/axis-logo\.png"/);
  assert.match(layoutSource, /alt="AXIS"/);
  assert.match(layoutSource, /className="admin-brand-logo-wrapper"/);
  assert.match(layoutSource, /className="admin-brand-logo"/);
  assert.doesNotMatch(layoutSource, /<h1 className="admin-brand-title">AXIS<\/h1>/);
  assert.match(layoutSource, /Powered by Aventus IT/);
  assert.match(layoutSource, /className="admin-sidebar-powered"/);
  assert.match(loginPageSource, /src="\/axis-logo\.png"/);
  assert.match(loginPageSource, /className="login-brand-logo-wrapper"/);
  assert.match(loginPageSource, /className="login-brand-logo"/);
  assert.match(cssSource, /\.admin-brand-logo-wrapper/);
  assert.match(cssSource, /\.admin-brand-logo/);
  assert.match(cssSource, /\.login-brand-logo-wrapper/);
  assert.match(cssSource, /\.login-brand-logo/);
  assert.match(cssSource, /\.admin-sidebar-powered/);
  assert.match(adminLogoBlock, /width:\s*200px;/);
  assert.match(adminLogoBlock, /height:\s*auto;/);
  assert.match(adminLogoBlock, /object-fit:\s*contain/);
  assert.match(adminLogoWrapperBlock, /background:\s*transparent;/);
  assert.match(adminLogoWrapperBlock, /padding:\s*8px 0;/);
  assert.match(adminLogoWrapperBlock, /overflow:\s*visible/);
  assert.match(loginLogoBlock, /width:\s*220px;/);
  assert.match(loginLogoBlock, /height:\s*auto;/);
  assert.match(loginLogoBlock, /object-fit:\s*contain/);
  assert.doesNotMatch(adminLogoBlock, /overflow:\s*hidden|max-width:\s*80px|max-height:\s*(?:40|78|86)px/);
});

test('AXIS color system is applied to admin controls and active navigation', () => {
  assert.match(cssSource, /--axis-blue:\s*#1FA3D6/);
  assert.match(cssSource, /--axis-text-soft:\s*#6B6B6B/);
  assert.match(cssSource, /--axis-background:\s*#FFFFFF/);
  assert.match(cssSource, /--axis-section-background:\s*#F9FAFB/);
  assert.match(cssSource, /--axis-border:\s*#E5E7EB/);
  assert.match(cssSource, /\.primary-button,\s*\n\.lead-form button,\s*\n\.entity-form button,\s*\n\.invoice-portal-primary-button\s*\{[\s\S]*background:\s*var\(--axis-blue\)/);
  assert.match(cssSource, /\.admin-top-nav-link-active\s*\{[\s\S]*rgba\(31,\s*163,\s*214/);
  assert.match(cssSource, /\.admin-top-nav-link-active::before\s*\{[\s\S]*background:\s*var\(--axis-blue\)/);
  assert.match(cssSource, /\.admin-dashboard-page\s*\.dashboard-card\s*span\s*\{[\s\S]*color:\s*var\(--axis-blue-dark\)/);
});

test('admin styles remove old teal primary accents and normalize platform components', () => {
  assert.doesNotMatch(cssSource, /#0f766e|rgba\(15,\s*118,\s*110|#1268d8|rgba\(18,\s*104,\s*216|#0078C8/);
  assert.doesNotMatch(cssSource, /#F5EFE6|#F3E8D0|#fffdf8|#fff7ed|rgba\(255,\s*247,\s*237|rgba\(255,\s*253,\s*248/);
  assert.match(cssSource, /\/\* AXIS platform-wide SaaS system \*\//);
  assert.match(cssSource, /\/\* AXIS white card consistency overrides \*\//);
  assert.match(cssSource, /\.detail-card,[\s\S]*\.workspace-section,[\s\S]*\.dashboard-panel,[\s\S]*border-radius:\s*12px/);
  assert.match(cssSource, /input:focus,[\s\S]*box-shadow:\s*0 0 0 3px rgba\(31,\s*163,\s*214,\s*0\.12\)/);
  assert.match(cssSource, /\.data-table,[\s\S]*\.reports-visual-table\s*\{[\s\S]*border:\s*1px solid var\(--axis-border\)/);
  assert.match(cssSource, /\.admin-subnav-link,[\s\S]*\.dashboard-quick-link\s*\{[\s\S]*padding:\s*16px 20px/);
  assert.match(cssSource, /\.admin-subnav-link:hover,[\s\S]*background:\s*#F3F4F6/);
});

test('public proposal page uses AXIS branding and avoids beige proposal styling', () => {
  assert.match(proposalPageSource, /src="\/axis-logo-light\.png"/);
  assert.match(proposalPageSource, /AXIS Destination Management/);
  assert.match(proposalPageSource, /public-proposal-page/);
  assert.match(proposalPageSource, /public-proposal-frame-card/);
  assert.match(cssSource, /\.public-proposal-page\s*\{[\s\S]*background:\s*#F9FAFB/);
  assert.match(cssSource, /\.public-proposal-header\s*\{[\s\S]*background:\s*#FFFFFF/);
  assert.match(cssSource, /\.public-proposal-header\s*\{[\s\S]*border:\s*1px solid #E5E7EB/);
  assert.match(cssSource, /\.public-proposal-logo-wrapper\s*\{[\s\S]*background:\s*#F3F4F6/);
  assert.match(cssSource, /\.public-proposal-page \.primary-button\s*\{[\s\S]*background:\s*#1FA3D6/);
  assert.doesNotMatch(proposalPageSource + cssSource, /#F5EFE6|#F3E8D0|#fffdfa|#f5efe6|#fcf8f2|#f9f3ea|beige|cream|public-proposal-logo-wrapper\s*\{[\s\S]*#061B33/i);
});
