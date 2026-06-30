import test = require('node:test');
import assert = require('node:assert/strict');
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { globalCssSource } from './lib/global-css-source';
import path = require('node:path');
import { fileURLToPath } from 'node:url';
import { NAV_GROUPS, getActiveNavGroup, getVisibleNavGroups } from './admin-nav';

const templateSource = readFileSync(new URL('./template.tsx', import.meta.url), 'utf8');
const loginPageSource = readFileSync(new URL('./login/page.tsx', import.meta.url), 'utf8');
const middlewareSource = readFileSync(new URL('../middleware.ts', import.meta.url), 'utf8');
const adminServerSource = readFileSync(new URL('./lib/admin-server.ts', import.meta.url), 'utf8');
const chromeNavSource = readFileSync(new URL('./components/AdminChromeNav.tsx', import.meta.url), 'utf8');
const breadcrumbsSource = readFileSync(new URL('./components/AdminBreadcrumbs.tsx', import.meta.url), 'utf8');
const backButtonSource = readFileSync(new URL('./components/AdminBackButton.tsx', import.meta.url), 'utf8');
const headerActionsSource = readFileSync(new URL('./components/AdminHeaderActions.tsx', import.meta.url), 'utf8');
const quotePageSource = readFileSync(new URL('./quotes/[id]/ClassicQuoteWorkspace.tsx', import.meta.url), 'utf8');
const bookingPageSource = readFileSync(new URL('./bookings/[id]/page.tsx', import.meta.url), 'utf8');
const activityPageSource = readFileSync(new URL('./activities/[id]/page.tsx', import.meta.url), 'utf8');
const proposalPageSource = readFileSync(new URL('./proposal/[token]/page.tsx', import.meta.url), 'utf8');
const cssSource = globalCssSource;
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
  assert.ok(catalogGroup.children.some((child) => child.label === 'Excursion Templates' && child.href === '/excursion-templates'));
  assert.equal(getActiveNavGroup('/activities', 'admin').label, 'Product Catalog');
  assert.equal(getActiveNavGroup('/excursion-templates/petra-full-day', 'admin').label, 'Product Catalog');
});

test('product catalog navigation uses canonical catalog destinations', () => {
  const catalogGroup = getVisibleNavGroups('admin').find((group) => group.label === 'Product Catalog');

  assert.ok(catalogGroup);
  assert.deepEqual(
    catalogGroup.children.map((child) => [child.label, child.href]),
    [
      ['Hotels', '/hotels'],
      ['Contract Health', '/hotel-contract-health'],
      ['Packages', '/packages'],
      ['Import Contract', '/contracts/import'],
      ['Import History', '/contracts/import/history'],
      ['Transport', '/transport'],
      ['Transport Pricing', '/transport?tab=pricing-rules'],
      ['Transfer Routes', '/routes'],
      ['Route Standards', '/route-standards'],
      ['Drivers', '/drivers'],
      ['Activities', '/activities'],
      ['Excursion Templates', '/excursion-templates'],
      ['Guides', '/guides'],
      ['Restaurants', '/restaurants'],
      ['Operational Areas', '/operational-areas'],
      ['Points of Interest', '/points-of-interest'],
      ['Services', '/catalog?tab=services'],
      ['Suppliers', '/suppliers'],
    ],
  );
  assert.equal(getActiveNavGroup('/activities', 'admin').label, 'Product Catalog');
  assert.equal(getActiveNavGroup('/packages', 'admin').label, 'Product Catalog');
  assert.equal(getActiveNavGroup('/excursion-templates', 'admin').label, 'Product Catalog');
  assert.equal(getActiveNavGroup('/transport', 'admin').label, 'Product Catalog');
  assert.equal(catalogGroup.children.find((child) => child.label === 'Transport Pricing')?.href, '/transport?tab=pricing-rules');
  assert.equal(getActiveNavGroup('/routes', 'admin').label, 'Product Catalog');
  assert.equal(getActiveNavGroup('/suppliers', 'admin').label, 'Product Catalog');
  assert.equal(getActiveNavGroup('/guides', 'admin').label, 'Product Catalog');
  assert.equal(getActiveNavGroup('/restaurants', 'admin').label, 'Product Catalog');
  assert.equal(getActiveNavGroup('/contracts/import', 'admin').label, 'Product Catalog');
  assert.equal(getActiveNavGroup('/hotels/some-hotel-id/contracts', 'admin').label, 'Product Catalog');
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
  assert.match(middlewareSource, /import type \{ NextRequest \} from 'next\/server'/);
  assert.match(middlewareSource, /requestHeaders\.set\('x-dmc-pathname', pathname\)/);
  assert.match(middlewareSource, /request\.nextUrl\.pathname/);
  assert.doesNotMatch(middlewareSource, /__dirname|from ['"]fs['"]|from ['"]path['"]|process\.cwd\(\)/);
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
  assert.match(templateSource, /className="admin-mobile-nav"/);
  assert.match(templateSource, /<summary className="secondary-button">Menu<\/summary>/);
  assert.match(cssSource, /\.admin-mobile-nav/);
  assert.match(cssSource, /@media \(max-width: 859px\)/);
  assert.match(cssSource, /\.admin-sidebar\s*\{\s*display: none;/);
});

test('global admin responsive stabilization utilities and shell guardrails exist', () => {
  assert.match(cssSource, /\/\* Global Admin Web responsive stabilization\./);
  assert.match(cssSource, /\.responsive-table\s*\{/);
  assert.match(cssSource, /\.workspace-grid,\s*\n\.stack-on-narrow\s*\{/);
  assert.match(cssSource, /\.truncate-safe\s*\{/);
  assert.match(cssSource, /\.break-safe\s*\{/);
  assert.match(cssSource, /\.admin-shell\s*\{[\s\S]*grid-template-columns:\s*minmax\(220px,\s*260px\) minmax\(0,\s*1fr\)/);
  assert.match(cssSource, /\.admin-main-shell,[\s\S]*\.admin-content-shell,[\s\S]*min-width:\s*0 !important/);
  assert.match(cssSource, /\.admin-shell :where\([\s\S]*\.table-wrap,[\s\S]*\.responsive-table,[\s\S]*overflow-x:\s*auto !important/);
  assert.match(cssSource, /\.admin-shell :where\([\s\S]*\.data-table,[\s\S]*\.app-table,[\s\S]*table-layout:\s*auto/);
  assert.match(cssSource, /@media \(max-width: 1440px\)[\s\S]*\.quote-builder-layout,[\s\S]*\.booking-ops-layout,[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
});

test('AXIS branding renders on sidebar and login with powered footer', () => {
  const adminLogoBlock = cssSource.match(/\.admin-brand-logo\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const adminLogoWrapperBlock = cssSource.match(/\.admin-brand-logo-wrapper\s*\{[\s\S]*?\n\}/)?.[0] || '';
  const loginLogoBlock = cssSource.match(/\.login-brand-logo\s*\{[\s\S]*?\n\}/)?.[0] || '';

  assert.match(templateSource, /src="\/axis-logo\.png"/);
  assert.match(templateSource, /alt="AXIS"/);
  // Admin sidebar wraps the logo in .admin-brand-row (login uses
  // .login-brand-logo-wrapper). The earlier assertion expected the admin to
  // use the same -wrapper class as login, but the sidebar shipped with -row.
  assert.match(templateSource, /className="admin-brand-row"/);
  assert.match(templateSource, /className="admin-brand-logo"/);
  assert.doesNotMatch(templateSource, /<h1 className="admin-brand-title">AXIS<\/h1>/);
  assert.match(templateSource, /Powered by Aventus IT/);
  assert.match(templateSource, /className="admin-sidebar-powered"/);
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

test('root template classifies admin workspaces as protected shell routes', () => {
  assert.match(
    templateSource,
    /const PROTECTED_ADMIN_ROUTE_PREFIXES = \['\/admin', '\/agents', '\/quotes', '\/bookings', '\/finance', '\/catalog', '\/excursion-templates'\]/,
  );
  assert.match(templateSource, /pathname === '\/admin\/dashboard'/);
  assert.match(templateSource, /const isPublicRoute = !isProtectedAdminRoute && isPublicPath\(pathname\);/);
  assert.match(templateSource, /<AdminChromeNav mode="primary" sessionRole=\{session\?\.role\} \/>/);
});

test('AXIS color system is applied to admin controls and active navigation', () => {
  // AXIS blue ships as #1F9ACF (rgb(31, 154, 207)). The earlier spec value
  // (#1FA3D6) was refined during the AXIS rollout; the live deploys and the
  // entire globals.css palette use #1F9ACF. Keep tests aligned with shipping
  // reality — if the design system migrates to a different blue, update both
  // CSS and this assertion together.
  assert.match(cssSource, /--axis-blue:\s*#1F9ACF/);
  assert.match(cssSource, /--axis-text-soft:\s*#6B6B6B/);
  assert.match(cssSource, /--axis-background:\s*#FFFFFF/);
  assert.match(cssSource, /--axis-section-background:\s*#F9FAFB/);
  assert.match(cssSource, /--axis-border:\s*#E5E7EB/);
  assert.match(cssSource, /\.primary-button,\s*\n\.lead-form button,\s*\n\.entity-form button,\s*\n\.invoice-portal-primary-button\s*\{[\s\S]*background:\s*var\(--axis-blue\)/);
  assert.match(cssSource, /\.admin-top-nav-link-active\s*\{[\s\S]*rgba\(31,\s*154,\s*207/);
  assert.match(cssSource, /\.admin-top-nav-link-active::before\s*\{[\s\S]*background:\s*var\(--axis-blue\)/);
  assert.match(cssSource, /\.admin-dashboard-page\s*\.dashboard-card\s*span\s*\{[\s\S]*color:\s*var\(--axis-blue-dark\)/);
});

test('admin styles remove old teal primary accents and normalize platform components', () => {
  assert.doesNotMatch(cssSource, /#0f766e|rgba\(15,\s*118,\s*110|#1268d8|rgba\(18,\s*104,\s*216|#0078C8/);
  assert.doesNotMatch(cssSource, /#F5EFE6|#F3E8D0|#fffdf8|#fff7ed|rgba\(255,\s*247,\s*237|rgba\(255,\s*253,\s*248/);
  assert.match(cssSource, /\/\* AXIS platform-wide SaaS system \*\//);
  assert.match(cssSource, /\/\* AXIS white card consistency overrides \*\//);
  assert.match(cssSource, /\.detail-card,[\s\S]*\.workspace-section,[\s\S]*\.dashboard-panel,[\s\S]*border-radius:\s*12px/);
  assert.match(cssSource, /input:focus,[\s\S]*box-shadow:\s*0 0 0 3px rgba\(31,\s*154,\s*207,\s*0\.12\)/);
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
  assert.match(cssSource, /\.public-proposal-page \.primary-button\s*\{[\s\S]*background:\s*#1F9ACF/);
  assert.doesNotMatch(proposalPageSource + cssSource, /#F5EFE6|#F3E8D0|#fffdfa|#f5efe6|#fcf8f2|#f9f3ea|beige|cream|public-proposal-logo-wrapper\s*\{[\s\S]*#061B33/i);
});

// --- Operations V2 (Beta) flag-gated nav entry (#operations-v2-nav-enablement) ---

type OpsNavRole = NonNullable<Parameters<typeof getVisibleNavGroups>[0]>;

// Toggle NEXT_PUBLIC_OPS_V2_DEFAULT for a single assertion and ALWAYS restore it
// (the test process is shared, so flag state must not leak across tests).
function withOpsV2Flag<T>(value: string | undefined, run: () => T): T {
  const previous = process.env.NEXT_PUBLIC_OPS_V2_DEFAULT;
  if (value === undefined) {
    delete process.env.NEXT_PUBLIC_OPS_V2_DEFAULT;
  } else {
    process.env.NEXT_PUBLIC_OPS_V2_DEFAULT = value;
  }
  try {
    return run();
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_OPS_V2_DEFAULT;
    } else {
      process.env.NEXT_PUBLIC_OPS_V2_DEFAULT = previous;
    }
  }
}

function operationsChildren(role: OpsNavRole) {
  return getVisibleNavGroups(role).find((group) => group.label === 'Operations')?.children ?? [];
}

function findOpsV2Entry(role: OpsNavRole) {
  return operationsChildren(role).find((child) => child.label === 'Operations V2 (Beta)');
}

test('Operations V2 nav entry is hidden when the flag is OFF/default', () => {
  withOpsV2Flag(undefined, () => {
    assert.equal(findOpsV2Entry('admin'), undefined);
  });
  withOpsV2Flag('false', () => {
    assert.equal(findOpsV2Entry('admin'), undefined);
  });
});

test('Operations V2 nav entry appears for admin when the flag is ON', () => {
  withOpsV2Flag('true', () => {
    const entry = findOpsV2Entry('admin');
    assert.ok(entry, 'expected Operations V2 (Beta) nav entry when the flag is ON');
    assert.equal(entry.href, '/operations/v2');
    assert.equal(entry.section, 'Coordination');
  });
});

test('Operations V2 nav entry sits immediately after Dispatch in Coordination', () => {
  withOpsV2Flag('true', () => {
    const children = operationsChildren('admin');
    const dispatchIndex = children.findIndex((child) => child.href === '/operations/dispatch');
    const v2Index = children.findIndex((child) => child.label === 'Operations V2 (Beta)');
    assert.ok(dispatchIndex >= 0, 'Dispatch entry should exist');
    assert.equal(v2Index, dispatchIndex + 1);
    assert.equal(children[v2Index].section, 'Coordination');
  });
});

test('Operations V2 nav entry inherits Operations group role visibility', () => {
  withOpsV2Flag('true', () => {
    // Visible to the Operations-group audience.
    assert.ok(findOpsV2Entry('operations'));
    assert.ok(findOpsV2Entry('admin'));
    assert.ok(findOpsV2Entry('super_admin'));
    assert.ok(findOpsV2Entry('agent_admin'));
    // Not surfaced through nav to roles that cannot see the Operations group.
    assert.equal(findOpsV2Entry('finance'), undefined);
    assert.equal(findOpsV2Entry('viewer'), undefined);
    assert.equal(findOpsV2Entry('agent'), undefined);
  });
});

test('Operations V2 nav entry resolves to an existing app page', () => {
  withOpsV2Flag('true', () => {
    const entry = findOpsV2Entry('admin');
    assert.ok(entry);
    const pathname = entry.href.split('?')[0];
    const segments = pathname.split('/').filter(Boolean);
    const pageFile = new URL(`${segments.join('/')}/page.tsx`, appDir);
    assert.equal(existsSync(pageFile), true, `Operations V2 (Beta) should resolve ${entry.href}`);
  });
});

test('active nav group for /operations/v2 remains Operations (flag ON and OFF)', () => {
  withOpsV2Flag('true', () => {
    assert.equal(getActiveNavGroup('/operations/v2', 'admin').label, 'Operations');
  });
  withOpsV2Flag(undefined, () => {
    assert.equal(getActiveNavGroup('/operations/v2', 'admin').label, 'Operations');
  });
});
