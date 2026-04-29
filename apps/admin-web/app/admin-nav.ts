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
    children: [{ label: 'Overview', href: '/admin/dashboard' }],
  },
  {
    label: 'Sales',
    href: '/quotes',
    match: ['/quotes', '/leads', '/contacts', '/companies', '/quote-blocks', '/import-itinerary'],
    helper: 'Quotes, leads, contacts, and client companies',
    children: [
      { label: 'Quotes', href: '/quotes' },
      { label: 'Leads', href: '/leads' },
      { label: 'Contacts', href: '/contacts' },
      { label: 'Companies', href: '/companies' },
    ],
  },
  {
    label: 'Operations',
    href: '/bookings',
    match: ['/bookings', '/operations'],
    helper: 'Bookings, passengers, documents, and service follow-up',
    roles: ['admin', 'operations'],
    children: [
      { label: 'Bookings', href: '/bookings' },
      { label: 'Operations', href: '/operations' },
      { label: 'Passengers & Documents', href: '/bookings' },
    ],
  },
  {
    label: 'Product Catalog',
    href: '/hotels',
    match: [
      '/catalog',
      '/activities',
      '/services',
      '/transport',
      '/service-types',
      '/hotels',
      '/hotel-categories',
      '/hotel-contracts',
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
      '/suppliers',
    ],
    helper: 'Hotels, activities, transport, routes, services, and suppliers',
    children: [
      { label: 'Hotels', href: '/hotels' },
      { label: 'Activities', href: '/activities' },
      { label: 'Transport', href: '/transport' },
      { label: 'Routes', href: '/routes' },
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
    match: ['/branding', '/users', '/login'],
    helper: 'Users, branding, and platform settings',
    children: [
      { label: 'Users', href: '/users' },
      { label: 'Branding', href: '/branding' },
    ],
  },
];

export function getVisibleNavGroups(role?: SessionRole | null) {
  return NAV_GROUPS.filter((group) => !group.roles?.length || (role ? group.roles.includes(role) : false));
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
