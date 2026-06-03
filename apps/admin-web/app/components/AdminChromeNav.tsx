'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { SessionRole } from '../lib/auth-session';
import { getActiveNavGroup, getVisibleNavGroups, isPathMatch } from '../admin-nav';

type AdminChromeNavProps = {
  mode: 'primary' | 'subnav' | 'topbar';
  sessionRole?: SessionRole | null;
};

// Glyph per top-level nav group. Shown beside the label normally; on quote
// routes the sidebar collapses to an icon-only "focus" rail (see redesign.css)
// and these become the sole nav affordance, so every group needs one.
const PRIMARY_NAV_ICONS: Record<string, string> = {
  Dashboard: '▦',
  Sales: '✦',
  Operations: '◷',
  'Product Catalog': '▤',
  Finance: '$',
  Administration: '⚙',
};

export function AdminChromeNav({ mode, sessionRole }: AdminChromeNavProps) {
  const pathname = usePathname() || '/';
  const navGroups = getVisibleNavGroups(sessionRole);
  const activeGroup = getActiveNavGroup(pathname, sessionRole);
  const isDashboardRoute = pathname === '/admin/dashboard';

  if (mode === 'primary') {
    return (
      <nav className="admin-sidebar-nav" aria-label="Primary">
        {navGroups.map((group) => {
          const active = activeGroup.label === group.label;

          return (
            <Link
              key={group.label}
              href={group.href}
              prefetch={false}
              className={`admin-top-nav-link${active ? ' admin-top-nav-link-active' : ''}`}
              aria-current={active ? 'page' : undefined}
              title={group.label}
            >
              <span className="admin-top-nav-icon" aria-hidden="true">{PRIMARY_NAV_ICONS[group.label] ?? '•'}</span>
              <strong>{group.label}</strong>
              {group.helper ? <span>{group.helper}</span> : null}
            </Link>
          );
        })}
      </nav>
    );
  }

  if (mode === 'topbar') {
    if (isDashboardRoute) {
      return null;
    }

    return (
      <div className="admin-topbar-copy">
        <p className="eyebrow">Current Area</p>
        <h2 className="admin-subnav-title">{activeGroup.label}</h2>
        <p className="admin-subnav-copy">
          Use the left navigation to move across the ERP domains and keep current-area shortcuts close at hand.
        </p>
      </div>
    );
  }

  if (isDashboardRoute) {
    return null;
  }

  if (activeGroup.children.length === 0) {
    return null;
  }

  let renderedSection: string | undefined;

  return (
    <nav aria-label={`${activeGroup.label} shortcuts`}>
      {activeGroup.children.map((child) => {
        const isActiveChild = isPathMatch(pathname, child.href);
        const showSection = child.section && child.section !== renderedSection;
        if (child.section) {
          renderedSection = child.section;
        }

        return (
          <Fragment key={`${child.href}-${child.label}`}>
            {showSection ? <span className="admin-subnav-section">{child.section}</span> : null}
            <Link
              href={child.href}
              prefetch={false}
              aria-current={isActiveChild ? 'page' : undefined}
              className={`admin-subnav-link${isActiveChild ? ' admin-subnav-link-active' : ''}`}
            >
              {child.label}
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
