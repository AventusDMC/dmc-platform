'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useHardRenderGuard, useRenderCounter } from '../hotels/HotelsPerfDebugPanel';

// Hotels workspace freeze hunt — Round 10.
//
// PR #131 confirmed `?wrapper=noModuleSwitcher` is stable while every
// other Hotels page render path freezes. Conclusion: the loop lives
// here.
//
// The original implementation called `new URL(...)` inside a synchronous
// `items.map` AND looped `url.searchParams.entries()` ON EVERY RENDER.
// Combined with `useSearchParams()` returning a fresh `ReadonlyURLSearchParams`
// reference whenever Next.js fires a router update (RSC re-payload,
// prefetch settle, etc.), each render allocated O(items × params) URL
// objects + ran `.get()` on the live URLSearchParams for each one.
//
// On Hotels pages with 10+ tabs and 5+ query params, that's 50+ URL
// constructions and ~100 searchParams.get() lookups per render — on a
// page where the page-level loadRequested gating + commercial subnav +
// summary strip already triggered multiple cascading re-renders during
// hydration.
//
// Fix in this commit:
//   1. Pre-compute every item's parsed (pathname, queryEntries) ONCE
//      via useMemo, keyed on the items array reference.
//   2. Replace `new URL(...)` with a plain string split on '?' — no
//      allocation, no constructor.
//   3. Compute the active-item set in a SINGLE useMemo over (items,
//      pathname, searchParams.toString()). Children read O(1) Set.has().
//   4. Add render counter + hard guard so if the loop reappears it
//      throws at 50 renders / 2 seconds with a named diagnostic.

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
  // Diagnostic instrumentation. Loop-detection hard guard at 50 renders
  // in 2 seconds — surfaces the diagnostic instead of locking the tab.
  useRenderCounter('ModuleSwitcher');
  useHardRenderGuard('ModuleSwitcher', { limit: 50, windowMs: 2000 });

  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();

  // Cheap, stable string-keyed deps. searchParams is a
  // ReadonlyURLSearchParams whose `.toString()` is deterministic for
  // the current URL. Using the string keeps the memo dep set tight.
  const searchParamsKey = searchParams ? searchParams.toString() : '';

  // Pre-parse each item's href ONCE per items-array identity. The
  // expensive new URL() construction is gone; we use a plain split.
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
