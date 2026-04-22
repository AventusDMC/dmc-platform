export const PRODUCTS_PRICING_WORKSPACES = [
  {
    label: 'Catalog',
    href: '/catalog',
    match: ['/catalog', '/services', '/service-types', '/cities', '/places', '/place-types'],
  },
  {
    label: 'Hotels',
    href: '/hotels',
    match: ['/hotels', '/hotel-categories', '/hotel-contracts', '/hotel-rates', '/hotel-room-categories'],
  },
  {
    label: 'Transport',
    href: '/transport',
    match: ['/transport', '/transport-pricing', '/vehicle-rates', '/vehicles', '/routes'],
  },
] as const;

export function isProductsPricingWorkspacePathMatch(pathname: string, match: string) {
  if (match === '/') {
    return pathname === '/';
  }

  return pathname === match || pathname.startsWith(`${match}/`);
}

export function getProductsPricingWorkspace(pathname: string) {
  return (
    PRODUCTS_PRICING_WORKSPACES.find((workspace) =>
      workspace.match.some((match) => isProductsPricingWorkspacePathMatch(pathname, match)),
    ) || PRODUCTS_PRICING_WORKSPACES[0]
  );
}

export function getProductsPricingWorkspaceLabel(pathname: string) {
  return getProductsPricingWorkspace(pathname).label;
}
