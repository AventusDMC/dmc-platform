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
    section?: string;
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
    match: ['/quotes', '/leads', '/contacts', '/companies', '/quote-blocks', '/import-itinerary'],
    helper: 'Quotes, leads, contacts, and client companies',
    children: [
      { label: 'Quotes', href: '/quotes' },
      { label: 'Guided Builder', href: '/quotes/new/guided' },
      // 'DMC Quote Engine' (/quote-engine) removed: a stalled "phase 1"
      // parallel quote stack that overlapped the main Quote system. Code
      // archived; DmcQuote DB tables retained pending a drop decision.
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
      { label: 'Bookings', href: '/bookings', section: 'Delivery' },
      { label: 'Series', href: '/series', section: 'Delivery' },
      { label: 'Operations', href: '/operations', section: 'Coordination' },
      { label: 'Dispatch', href: '/operations/dispatch', section: 'Coordination' },
      { label: 'Recovery', href: '/operations/recovery', section: 'Coordination' },
      { label: 'Resources', href: '/operations/resources/conflicts', section: 'Coordination' },
      { label: 'Intelligence', href: '/operations/intelligence', section: 'Intelligence' },
      { label: 'Financial Intel', href: '/operations/intelligence/financial', section: 'Intelligence' },
      { label: 'Simulation', href: '/operations/simulation', section: 'Planning' },
      { label: 'Scale Sim', href: '/operations/simulation/scale', section: 'Planning' },
      { label: 'Rehearsal', href: '/operations/rehearsal', section: 'Planning' },
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
      '/points-of-interest',
      '/suppliers',
    ],
    helper: 'Hotels, activities, transport, guides, restaurants, transfer routes, services, and suppliers',
    children: [
      { label: 'Hotels', href: '/hotels', section: 'Accommodation' },
      { label: 'Contract Health', href: '/hotel-contract-health', section: 'Accommodation' },
      { label: 'Packages', href: '/packages', section: 'Accommodation' },
      { label: 'Import Contract', href: '/contracts/import', section: 'Accommodation' },
      { label: 'Import History', href: '/contracts/import/history', section: 'Accommodation' },
      { label: 'Transport', href: '/transport', section: 'Transport' },
      { label: 'Transport Pricing', href: '/transport?tab=pricing-rules', section: 'Transport' },
      { label: 'Transfer Routes', href: '/routes', section: 'Transport' },
      { label: 'Route Standards', href: '/route-standards', section: 'Transport' },
      { label: 'Drivers', href: '/drivers', section: 'Transport' },
      { label: 'Activities', href: '/activities', section: 'Experiences' },
      { label: 'Excursion Templates', href: '/excursion-templates', section: 'Experiences' },
      { label: 'Guides', href: '/guides', section: 'Experiences' },
      { label: 'Restaurants', href: '/restaurants', section: 'Experiences' },
      { label: 'Operational Areas', href: '/operational-areas', section: 'Reference' },
      { label: 'Points of Interest', href: '/points-of-interest', section: 'Reference' },
      { label: 'Services', href: '/catalog?tab=services', section: 'Reference' },
      { label: 'Suppliers', href: '/suppliers', section: 'Reference' },
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
