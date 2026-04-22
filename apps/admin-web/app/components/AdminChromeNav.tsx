'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getProductsPricingWorkspaceLabel } from '../products-pricing-workspaces';
import { getActiveNavGroup, isPathMatch, NAV_GROUPS } from '../admin-nav';
import { ProductsPricingWorkspaceNav } from './ProductsPricingWorkspaceNav';

type AdminChromeNavProps = {
  mode: 'primary' | 'subnav' | 'topbar';
};

export function AdminChromeNav({ mode }: AdminChromeNavProps) {
  const pathname = usePathname() || '/';
  const activeGroup = getActiveNavGroup(pathname);
  const activeCatalogWorkspaceLabel =
    activeGroup.label === 'Product Catalog' ? getProductsPricingWorkspaceLabel(pathname) : null;

  if (mode === 'primary') {
    return (
      <nav className="admin-sidebar-nav" aria-label="Primary">
        {NAV_GROUPS.map((group) => {
          const active = activeGroup.label === group.label;

          return (
            <Link
              key={group.label}
              href={group.href}
              className={`admin-top-nav-link${active ? ' admin-top-nav-link-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <strong>{group.label}</strong>
              {group.helper ? <span>{group.helper}</span> : null}
            </Link>
          );
        })}
      </nav>
    );
  }

  if (mode === 'topbar') {
    return (
      <div className="admin-topbar-copy">
        <p className="eyebrow">{activeGroup.label === 'Product Catalog' ? 'Workspace' : 'Current Area'}</p>
        <h2 className="admin-subnav-title">
          {activeCatalogWorkspaceLabel ? `${activeGroup.label}: ${activeCatalogWorkspaceLabel}` : activeGroup.label}
        </h2>
        {activeCatalogWorkspaceLabel ? (
          <p className="admin-subnav-copy">Switch between Hotels, Transport, and Experiences while keeping quote context nearby.</p>
        ) : (
          <p className="admin-subnav-copy">
            Use the left navigation to move across the ERP domains and keep current-area shortcuts close at hand.
          </p>
        )}
      </div>
    );
  }

  if (activeGroup.children.length === 0) {
    return null;
  }

  if (activeGroup.label === 'Product Catalog') {
    return <ProductsPricingWorkspaceNav ariaLabel="Product Catalog workspaces" />;
  }

  return (
    <nav aria-label={`${activeGroup.label} shortcuts`}>
      {activeGroup.children.map((child) => {
        const isActiveChild = isPathMatch(pathname, child.href);

        return (
          <Link
            key={child.href}
            href={child.href}
            aria-current={isActiveChild ? 'page' : undefined}
            className={`admin-subnav-link${isActiveChild ? ' admin-subnav-link-active' : ''}`}
          >
            {child.label}
          </Link>
        );
      })}
    </nav>
  );
}
