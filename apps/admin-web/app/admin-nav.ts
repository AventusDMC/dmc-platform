import type { SessionRole } from './lib/auth-session';

export type AdminNavGroup = {
  label: string;
  href: string;
  match: string[];
  helper?: string;
  roles?: SessionRole[];
  children: Array<{
    label: string;
    href: string;
  }>;
};

export const NAV_GROUPS: AdminNavGroup[] = [
  {
    label: 'Dashboard',
    href: '/admin/dashboard',
    match: ['/', '/dashboard', '/admin', '/admin/dashboard'],
    helper: 'Business overview and operational signals',
    children: [
      { label: 'Overview', href: '/admin/dashboard' },
      { label: 'Executive Operations', href: '/executive/operations' },
      { label: 'Production Readiness', href: '/admin/production-readiness' },
    ],
  },
  {
    label: 'Sales',
    href: '/quotes',
    match: ['/quotes', '/quote-engine', '/leads', '/contacts', '/companies', '/quote-blocks', '/import-itinerary'],
    helper: 'Quotes, leads, contacts, and client companies',
    children: [
      { label: 'Quotes', href: '/quotes' },
      { label: 'Guided Builder', href: '/quotes/new/guided' },
      // 'DMC Quote Engine' (/quote-engine) intentionally hidden from nav:
      // it's a stalled "phase 1" parallel quote stack (single commit, never
      // iterated) that overlaps the main Quote system. Hidden to prevent
      // staff building quotes in the wrong place. Route stays auth-protected
      // + reachable by direct URL pending an archive decision.
      // See docs/quotation-section-assessment.md.
      { label: 'Leads', href: '/leads' },
      { label: 'Contacts', href: '/contacts' },
      { label: 'Companies', href: '/companies' },
    ],
  },
  {
    label: 'Operations',
    href: '/bookings',
    match: ['/bookings', '/operations', '/series'],
    helper: 'Bookings, series, passengers, documents, and service follow-up',
    roles: ['admin', 'operations'],
    children: [
      { label: 'Bookings', href: '/bookings' },
      { label: 'Operations', href: '/operations' },
      { label: 'Dispatch', href: '/operations/dispatch' },
      { label: 'Recovery', href: '/operations/recovery' },
      { label: 'Resources', href: '/operations/resources/conflicts' },
      { label: 'Intelligence', href: '/operations/intelligence' },
      { label: 'Financial Intel', href: '/operations/intelligence/financial' },
      { label: 'Simulation', href: '/operations/simulation' },
      { label: 'Scale Sim', href: '/operations/simulation/scale' },
      { label: 'Rehearsal', href: '/operations/rehearsal' },
      { label: 'Series', href: '/series' },
      { label: 'Passengers & Documents', href: '/bookings' },
    ],
  },
  {
    label: 'Product Catalog',
    href: '/hotels',
    match: [
      '/catalog',
      '/packages',
      '/activities',
      '/excursion-templates',
      '/services',
      '/transport',
      '/guides',
      '/drivers',
      '/restaurants',
      '/service-types',
      '/hotels',
      '/hotel-categories',
      '/hotel-contracts',
      '/hotel-contract-health',
      '/contracts/import',
      '/hotel-rates',
      '/hotel-room-categories',
      '/transport-pricing',
      '/vehicle-rates',
      '/vehicles',
      '/cities',
      '/places',
      '/place-types',
      '/routes',
      '/route-standards',
      '/operational-areas',
      '/suppliers',
    ],
    helper: 'Hotels, activities, transport, guides, restaurants, transfer routes, services, and suppliers',
    children: [
      { label: 'Hotels', href: '/hotels' },
      { label: 'Contract Health', href: '/hotel-contract-health' },
      { label: 'Packages', href: '/packages' },
      { label: 'Import Contract', href: '/contracts/import' },
      { label: 'Import History', href: '/contracts/import/history' },
      { label: 'Activities', href: '/activities' },
      { label: 'Excursion Templates', href: '/excursion-templates' },
      { label: 'Transport', href: '/transport' },
      { label: 'Guides', href: '/guides' },
      { label: 'Drivers', href: '/drivers' },
      { label: 'Restaurants', href: '/restaurants' },
      { label: 'Transfer Routes', href: '/routes' },
      { label: 'Route Standards', href: '/route-standards' },
      { label: 'Operational Areas', href: '/operational-areas' },
      { label: 'Services', href: '/catalog?tab=services' },
      { label: 'Suppliers', href: '/suppliers' },
      { label: 'Transport Pricing', href: '/transport?tab=pricing-rules' },
    ],
  },
  {
    label: 'Finance',
    href: '/finance',
    match: ['/finance', '/invoices', '/admin/reports'],
    helper: 'Invoices, reconciliation, and financial dashboards',
    roles: ['admin', 'finance'],
    children: [
      { label: 'Invoices', href: '/invoices' },
      { label: 'Payments / Reconciliation', href: '/finance/reconciliation' },
      { label: 'Finance Dashboard', href: '/finance' },
      { label: 'Finance Summary', href: '/admin/reports' },
      { label: 'Reports', href: '/admin/reports' },
    ],
  },
  {
    label: 'Administration',
    href: '/users',
    match: ['/agents', '/branding', '/users', '/login'],
    helper: 'Users, agents, branding, and platform settings',
    children: [
      { label: 'Agents', href: '/agents' },
      { label: 'Users', href: '/users' },
      { label: 'Branding', href: '/branding' },
    ],
  },
];

export function getVisibleNavGroups(role?: SessionRole | null) {
  return NAV_GROUPS.filter((group) => {
    if (!group.roles?.length) {
      return true;
    }

    if (!role) {
      return false;
    }

    return group.roles.includes(role) || role === 'super_admin' || (role === 'agent_admin' && group.roles.includes('admin'));
  });
}

export function isPathMatch(pathname: string, match: string) {
  if (match === '/') {
    return pathname === '/';
  }

  return pathname === match || pathname.startsWith(`${match}/`);
}

export function getActiveNavGroup(pathname: string, role?: SessionRole | null) {
  const visibleGroups = getVisibleNavGroups(role);
  return visibleGroups.find((group) => group.match.some((match) => isPathMatch(pathname, match))) || visibleGroups[0] || NAV_GROUPS[0];
}
