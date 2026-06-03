'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

// Pure-render ModuleSwitcher.
//
// Earlier versions allocated a `new URL(...)` per item per render and
// walked the searchParams entries for each tab. On pages with 10+ tabs
// and 5+ query params that's O(items × params) URL objects per render
// — combined with `useSearchParams()` returning a fresh
// `ReadonlyURLSearchParams` reference whenever Next.js fires a router
// update, the active-tab computation became a hot path that could
// stall the browser on workspaces with heavy wrapper trees.
//
// Today:
//   1. parseHref() splits each item's href ONCE per items-array
//      identity via useMemo — plain `indexOf('?')`, no URL constructor.
//   2. The active-item Set is computed in a single useMemo keyed on
//      (parsedItems, pathname, searchParams.toString(), activeId).
//      Children read O(1) Set.has() in JSX.
//   3. Falls back to caller-supplied activeId when the URL signal
//      disagrees so at least one chip always highlights.

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

// Parses href ONCE per item. Pure — no React hooks here.
function parseHref(href: string): { pathname: string; queryEntries: Array<[string, string]> } {
  const questionIdx = href.indexOf('?');
  if (questionIdx === -1) {
    return { pathname: href || '/', queryEntries: [] };
  }
  const pathname = href.slice(0, questionIdx) || '/';
  const query = href.slice(questionIdx + 1);
  const queryEntries: Array<[string, string]> = [];
  for (const segment of query.split('&')) {
    if (!segment) continue;
    const eqIdx = segment.indexOf('=');
    const key = eqIdx === -1 ? segment : segment.slice(0, eqIdx);
    const value = eqIdx === -1 ? '' : segment.slice(eqIdx + 1);
    try {
      queryEntries.push([decodeURIComponent(key), decodeURIComponent(value)]);
    } catch {
      queryEntries.push([key, value]);
    }
  }
  return { pathname, queryEntries };
}

export function ModuleSwitcher({ ariaLabel, activeId, items }: ModuleSwitcherProps) {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();

  // Cheap, stable string-keyed deps. searchParams is a
  // ReadonlyURLSearchParams whose `.toString()` is deterministic for
  // the current URL. Using the string keeps the memo dep set tight.
  const searchParamsKey = searchParams ? searchParams.toString() : '';

  // Pre-parse each item's href ONCE per items-array identity.
  const parsedItems = useMemo(
    () => items.map((item) => ({ item, parsed: parseHref(item.href) })),
    [items],
  );

  // Compute the active-item set in a SINGLE pass per (items, pathname,
  // searchParams) tuple. Children read O(1) Set.has().
  const activeItemIds = useMemo(() => {
    const liveParams = new URLSearchParams(searchParamsKey);
    const active = new Set<string>();
    for (const { item, parsed } of parsedItems) {
      if (parsed.pathname !== pathname) {
        if (item.id === activeId) active.add(item.id);
        continue;
      }
      let matches = true;
      for (const [key, value] of parsed.queryEntries) {
        if (liveParams.get(key) !== value) {
          matches = false;
          break;
        }
      }
      if (matches) {
        active.add(item.id);
      } else if (item.id === activeId) {
        // Fall back to caller-supplied activeId when the URL signal
        // disagrees — keeps the existing UX where `activeId` always
        // highlights at least one chip.
        active.add(item.id);
      }
    }
    return active;
  }, [parsedItems, pathname, searchParamsKey, activeId]);

  return (
    <nav className="module-switcher" aria-label={ariaLabel}>
      {items.map((item) => {
        const isActive = activeItemIds.has(item.id);

        return (
          <Link
            key={item.id}
            href={item.href}
            // These nav targets are force-dynamic pages — prefetching them fires a
            // full SSR round-trip per link on every page render, which piles up on
            // higher-latency connections. Load on click instead (loading.tsx covers it).
            prefetch={false}
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
