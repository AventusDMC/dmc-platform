import { ModuleSwitcherDebugIsland } from './ModuleSwitcherDebugIsland';

// /module-switcher-debug — standalone route that mounts ModuleSwitcher
// in isolation with a mock items array. Confirms whether the
// fixes in PR #132 eliminate the loop independently of the Hotels
// page wrapper chain.
//
// If this page renders cleanly with `?cycle=N` (which causes Next.js
// to re-render the parent N times) the memoization is working. If it
// freezes, the fix was incomplete.

export const dynamic = 'force-dynamic';

type DebugPageProps = {
  searchParams?: Promise<{ count?: string }>;
};

export default async function ModuleSwitcherDebugPage({ searchParams }: DebugPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const count = Math.min(Math.max(Number(params?.count || '10'), 1), 50);

  return (
    <main style={{ padding: '1.5rem', maxWidth: 960, margin: '0 auto', fontFamily: 'system-ui' }}>
      <h1 style={{ margin: 0 }}>ModuleSwitcher standalone debug</h1>
      <p style={{ color: '#475467', fontSize: '0.85rem' }}>
        Mounts ModuleSwitcher with {count} mock items in isolation. No WorkspaceShell, no
        Hotels page wrappers, no shared filter providers — just the switcher under a plain
        main element. If this renders cleanly, the fix is sound. The hard render guard
        fires at 50 renders / 2 seconds with a named diagnostic if a loop reappears.
      </p>
      <p style={{ color: '#94a3b8', fontSize: '0.75rem', margin: '0.3rem 0 1rem' }}>
        Tip: append <code>?count=N</code> (1–50) to vary the items array size. Append{' '}
        <code>?debugPerf=1</code> to mount the perf overlay too.
      </p>
      <ModuleSwitcherDebugIsland count={count} />
    </main>
  );
}
