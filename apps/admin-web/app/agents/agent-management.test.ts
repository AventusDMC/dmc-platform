import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const pageSource = readFileSync(new URL('./page.tsx', import.meta.url), 'utf8');
const panelSource = readFileSync(new URL('./AgentManagementPanel.tsx', import.meta.url), 'utf8');
const newQuotePageSource = readFileSync(new URL('../quotes/new/page.tsx', import.meta.url), 'utf8');
const quoteDetailPageSource = readFileSync(new URL('../quotes/[id]/page.tsx', import.meta.url), 'utf8');
const quotesFormSource = readFileSync(new URL('../quotes/QuotesForm.tsx', import.meta.url), 'utf8');
const proxyRouteSource = readFileSync(new URL('../api/users/agents/route.ts', import.meta.url), 'utf8');
const navSource = readFileSync(new URL('../admin-nav.ts', import.meta.url), 'utf8');
const templateSource = readFileSync(new URL('../template.tsx', import.meta.url), 'utf8');
const authSessionSource = readFileSync(new URL('../lib/auth-session.ts', import.meta.url), 'utf8');

describe('agent management admin surface', () => {
  it('exposes an Agent Management page with company and portal user creation', () => {
    assert.match(pageSource, /title="Agent Management"/);
    assert.match(panelSource, /Create Agent Company/);
    assert.match(panelSource, /Create Agent User/);
    assert.match(panelSource, /type: 'agent'/);
    assert.match(panelSource, /role: 'agent'/);
    assert.match(panelSource, /Temporary password/);
    assert.match(panelSource, /Active portal account/);
    assert.match(panelSource, /Password reset remains available through the normal login reset flow/);
  });

  it('uses the active agent directory for quote Assigned Agent dropdown options', () => {
    assert.match(newQuotePageSource, /\/api\/users\/agents/);
    assert.match(quoteDetailPageSource, /\/users\/agents/);
    assert.match(newQuotePageSource, /user\.status !== 'inactive'/);
    assert.match(quoteDetailPageSource, /user\.status !== 'inactive'/);
    assert.match(newQuotePageSource, /user\.companyName \? `\$\{user\.name\} - \$\{user\.companyName\}` : user\.name/);
    assert.match(quotesFormSource, /No active agent users are available/);
    assert.match(quotesFormSource, /href="\/agents"/);
  });

  it('proxies agent directory requests and exposes navigation', () => {
    assert.match(proxyRouteSource, /\/users\/agents/);
    assert.match(navSource, /label: 'Agents', href: '\/agents'/);
    assert.match(navSource, /match: \['\/agents'/);
    assert.match(templateSource, /'\/agents'/);
  });

  it('allows legacy admin roles to reach Agent Management', () => {
    assert.match(authSessionSource, /'ADMIN'/);
    assert.match(authSessionSource, /'SUPER_ADMIN'/);
    assert.match(authSessionSource, /'AGENT_ADMIN'/);
    assert.match(authSessionSource, /replace\(\/\[-\\s\]\+\/g, '_'\)/);
    assert.match(navSource, /role === 'super_admin'/);
    assert.match(navSource, /role === 'agent_admin'/);
  });
});
