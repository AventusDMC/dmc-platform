'use client';

import { useMemo } from 'react';
import { ModuleSwitcher } from '../components/ModuleSwitcher';

// Wraps ModuleSwitcher in a stable-identity items array. Uses useMemo
// to ensure the items prop is reference-stable across re-renders —
// the exact pattern the Hotels page should follow to avoid forcing
// the switcher to recompute its active-item set unnecessarily.

export function ModuleSwitcherDebugIsland({ count }: { count: number }) {
  const items = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: `mock-${i}`,
        label: `Mock tab ${i + 1}`,
        href: `/module-switcher-debug?tab=mock-${i}`,
        helper: i % 2 === 0 ? 'Helper A' : 'Helper B',
      })),
    [count],
  );

  return (
    <section data-testid="module-switcher-debug-island" style={{ marginTop: '1rem' }}>
      <p style={{ fontSize: '0.78rem', color: '#475467', margin: '0 0 0.5rem' }}>
        Items array memoized on `count`. Switcher should render exactly once after hydration
        with no re-render storm.
      </p>
      <ModuleSwitcher ariaLabel="Mock module switcher" items={items} activeId="mock-0" />
    </section>
  );
}
