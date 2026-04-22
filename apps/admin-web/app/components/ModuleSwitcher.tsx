'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

type ModuleSwitcherItem = {
  id: string;
  label: string;
  href: string;
  helper?: string;
};

type ModuleSwitcherProps = {
  ariaLabel: string;
  activeId?: string;
  items: ModuleSwitcherItem[];
};

export function ModuleSwitcher({ ariaLabel, activeId, items }: ModuleSwitcherProps) {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();

  function isActiveItem(item: ModuleSwitcherItem) {
    try {
      const url = new URL(item.href, 'https://dmc.local');
      const hrefPath = url.pathname || '/';

      if (hrefPath !== pathname) {
        return false;
      }

      for (const [key, value] of url.searchParams.entries()) {
        if (searchParams.get(key) !== value) {
          return false;
        }
      }

      return true;
    } catch {
      return item.id === activeId;
    }
  }

  return (
    <nav className="module-switcher" aria-label={ariaLabel}>
      {items.map((item) => {
        const isActive = isActiveItem(item);

        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={`module-switcher-link${isActive ? ' module-switcher-link-active' : ''}`}
          >
            <strong>{item.label}</strong>
            {item.helper ? <span>{item.helper}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
