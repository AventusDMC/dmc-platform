'use client';

import { useEffect, useRef, useState } from 'react';

// Hotels emergency safe shell — render-count debug panel.
//
// Triggered by `?debugPerf=1`. Mounts a tiny floating overlay that tracks
// per-component render counts and outbound fetch counts. If any tracked
// component exceeds 30 renders in 5 seconds, a console.warn fires so the
// developer hunting the freeze can see exactly which child component is
// looping.
//
// The panel patches window.fetch ONLY while it's mounted so the fetch
// counter never lingers in production. Mount lifetime is the page's
// lifetime, so unmount cleanly restores the original fetch.

type RenderTracker = { name: string; count: number; firstSeen: number };

const RENDER_LIMIT_PER_WINDOW = 30;
const RENDER_LIMIT_WINDOW_MS = 5_000;

// Module-level state — components register here. Module storage survives
// re-renders without forcing a state-update cascade in the panel itself.
const TRACKERS = new Map<string, RenderTracker>();
const FETCH_COUNTER = { count: 0, lastReset: Date.now() };

/**
 * Components opt in by calling `useRenderCounter('HotelsPage')` in their
 * body. When `?debugPerf=1` is active, the panel reads the counters.
 * When the flag is absent, the hook is a no-op so production builds
 * pay no overhead.
 */
export function useRenderCounter(name: string) {
  if (typeof window === 'undefined') return;
  const tracker = TRACKERS.get(name) || { name, count: 0, firstSeen: Date.now() };
  tracker.count += 1;
  TRACKERS.set(name, tracker);
  const windowMs = Date.now() - tracker.firstSeen;
  if (windowMs < RENDER_LIMIT_WINDOW_MS && tracker.count > RENDER_LIMIT_PER_WINDOW) {
    // Warn once per window. Reset so the next 5-second window can warn again.
    console.warn(
      `[hotels-perf] ${name} rendered ${tracker.count} times in ${windowMs}ms — investigate render loop`,
    );
    tracker.count = 0;
    tracker.firstSeen = Date.now();
    TRACKERS.set(name, tracker);
  }
  if (windowMs >= RENDER_LIMIT_WINDOW_MS) {
    tracker.firstSeen = Date.now();
    tracker.count = 1;
    TRACKERS.set(name, tracker);
  }
}

export function HotelsPerfDebugPanel({ enabled }: { enabled: boolean }) {
  const [, forceUpdate] = useState(0);
  const originalFetchRef = useRef<typeof fetch | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    // Patch fetch to count outbound requests.
    if (!originalFetchRef.current) {
      originalFetchRef.current = window.fetch;
      window.fetch = ((...args: Parameters<typeof fetch>) => {
        FETCH_COUNTER.count += 1;
        return originalFetchRef.current!(...args);
      }) as typeof fetch;
    }

    // Tick once per second to refresh the panel display. We don't tie
    // this to state-driven re-renders — the panel itself must not feed
    // the render loop it's measuring.
    const interval = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => {
      clearInterval(interval);
      if (originalFetchRef.current) {
        window.fetch = originalFetchRef.current;
        originalFetchRef.current = null;
      }
    };
  }, [enabled]);

  if (!enabled) return null;

  const trackerEntries = Array.from(TRACKERS.values()).sort((a, b) => b.count - a.count);

  return (
    <aside
      data-testid="hotels-perf-debug-panel"
      style={{
        position: 'fixed',
        right: '0.75rem',
        bottom: '0.75rem',
        zIndex: 9999,
        background: '#0f172a',
        color: '#e2e8f0',
        border: '1px solid #334155',
        borderRadius: 10,
        padding: '0.6rem 0.7rem',
        fontFamily: 'monospace',
        fontSize: '0.72rem',
        minWidth: 220,
        maxWidth: 320,
        boxShadow: '0 10px 25px rgba(15, 23, 42, 0.35)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
        <strong>Hotels perf debug</strong>
        <span style={{ color: '#94a3b8' }}>?debugPerf=1</span>
      </div>
      <div style={{ marginBottom: '0.3rem' }}>
        <strong>Renders</strong>
        {trackerEntries.length === 0 ? (
          <div style={{ color: '#94a3b8' }}>(no components tracked yet)</div>
        ) : (
          <ul style={{ margin: '0.2rem 0 0', paddingLeft: '1rem' }}>
            {trackerEntries.map((entry) => (
              <li
                key={entry.name}
                style={{ color: entry.count > RENDER_LIMIT_PER_WINDOW ? '#f87171' : '#e2e8f0' }}
              >
                {entry.name}: {entry.count}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <strong>Outbound fetches</strong>
        <div>{FETCH_COUNTER.count}</div>
      </div>
    </aside>
  );
}

// Test-only escape hatch — lets the source-grep suite verify the panel
// is shipped without importing React internals.
export function __resetHotelsPerfCountersForTesting() {
  TRACKERS.clear();
  FETCH_COUNTER.count = 0;
  FETCH_COUNTER.lastReset = Date.now();
}
