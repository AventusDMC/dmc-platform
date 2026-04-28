'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { SessionRole } from '../lib/auth-session';
import { getActiveNavGroup, getVisibleNavGroups, isPathMatch } from '../admin-nav';

type AdminChromeNavProps = {
  mode: 'primary' | 'subnav' | 'topbar';
  sessionRole?: SessionRole | null;
};

export function AdminChromeNav({ mode, sessionRole }: AdminChromeNavProps) {
  const pathname = usePathname() || '/';
  const navGroups = getVisibleNavGroups(sessionRole);
  const activeGroup = getActiveNavGroup(pathname, sessionRole);
  const isDashboardRoute = pathname === '/' || pathname === '/dashboard';

  if (mode === 'primary') {
    return (
      <nav className="admin-sidebar-nav" aria-label="Primary">
        {navGroups.map((group) => {
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
