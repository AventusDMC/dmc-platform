'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isProductsPricingWorkspacePathMatch, PRODUCTS_PRICING_WORKSPACES } from '../products-pricing-workspaces';

type ProductsPricingWorkspaceNavProps = {
  className?: string;
  ariaLabel: string;
};

export function ProductsPricingWorkspaceNav({ className = 'admin-subnav', ariaLabel }: ProductsPricingWorkspaceNavProps) {
  const pathname = usePathname() || '/';

  return (
    <nav className={className} aria-label={ariaLabel}>
      {PRODUCTS_PRICING_WORKSPACES.map((workspace) => {
        const isActiveWorkspace = workspace.match.some((match) => isProductsPricingWorkspacePathMatch(pathname, match));

        return (
          <Link
            key={workspace.href}
            href={workspace.href}
            aria-current={isActiveWorkspace ? 'page' : undefined}
            className={`admin-subnav-link${isActiveWorkspace ? ' admin-subnav-link-active' : ''}`}
          >
            {workspace.label}
          </Link>
        );
      })}
    </nav>
  );
}
