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
    href: '/dashboard',
    match: ['/', '/dashboard'],
    helper: 'Business overview and operational signals',
    children: [{ label: 'Overview', href: '/dashboard' }],
  },
  {
    label: 'Quotes',
    href: '/quotes',
    match: ['/quotes', '/leads', '/quote-blocks', '/import-itinerary'],
    helper: 'Build and manage client proposals',
    children: [
      { label: 'All Quotes', href: '/quotes' },
      { label: 'Create Quote', href: '/quotes/new' },
    ],
  },
  {
    label: 'Product Catalog',
    href: '/hotels',
    match: [
      '/catalog',
      '/services',
      '/transport',
      '/service-types',
      '/hotels',
      '/hotel-categories',
      '/hotel-contracts',
      '/contracts/import',
      '/hotel-rates',
      '/hotel-room-categories',
    ],
    helper: 'Select the services you can sell',
    children: [
      { label: 'Hotels', href: '/hotels' },
      { label: 'Catalog', href: '/catalog' },
      { label: 'Import Contract', href: '/contracts/import' },
      { label: 'Import History', href: '/contracts/import/history' },
      { label: 'Transport', href: '/transport' },
    ],
  },
  {
    label: 'Pricing',
    href: '/transport-pricing',
    match: ['/transport-pricing', '/vehicle-rates', '/vehicles', '/cities', '/places', '/routes', '/place-types'],
    helper: 'Commercial rules and operating rates',
    children: [
      { label: 'Group Pricing Rules', href: '/quotes' },
      { label: 'Transport Pricing Rules', href: '/transport-pricing' },
      { label: 'Settings', href: '/vehicles' },
    ],
  },
  {
    label: 'Suppliers',
    href: '/suppliers',
    match: ['/suppliers'],
    helper: 'Supplier partners and contracting',
    children: [{ label: 'Suppliers', href: '/suppliers' }],
  },
  {
    label: 'Operations',
    href: '/bookings',
    match: ['/bookings', '/operations'],
    helper: 'Run confirmed trips and service follow-up',
    roles: ['admin', 'operations'],
    children: [
      { label: 'Bookings', href: '/bookings' },
      { label: 'Confirmations', href: '/operations?report=pending_confirmations' },
    ],
  },
  {
    label: 'Admin',
    href: '/users',
    match: ['/branding', '/companies', '/contacts', '/users', '/login'],
    helper: 'People, brands, and platform setup',
    children: [
      { label: 'Companies', href: '/companies' },
      { label: 'Users', href: '/users' },
      { label: 'Settings', href: '/branding' },
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
