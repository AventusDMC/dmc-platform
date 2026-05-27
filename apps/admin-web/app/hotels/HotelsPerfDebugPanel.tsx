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

// Hard render guard — fail loud when a component clearly enters a
// runaway render. Distinguished from useRenderCounter: this one
// THROWS so the React error boundary catches it and renders a
// friendly fallback. Use a per-mount counter (refs, not module map)
// because the goal here is to catch within a single render burst,
// not over the lifetime of the SPA.
const HARD_GUARD_COUNTERS = new Map<string, { count: number; mountedAt: number }>();
const HARD_GUARD_LIMIT = 100;
const HARD_GUARD_WINDOW_MS = 1_000;

export function useHardRenderGuard(name: string, options: { limit?: number; windowMs?: number } = {}) {
  if (typeof window === 'undefined') return;
  const limit = options.limit ?? HARD_GUARD_LIMIT;
  const windowMs = options.windowMs ?? HARD_GUARD_WINDOW_MS;
  const existing = HARD_GUARD_COUNTERS.get(name);
  const now = Date.now();
  if (!existing || now - existing.mountedAt > windowMs) {
    HARD_GUARD_COUNTERS.set(name, { count: 1, mountedAt: now });
    return;
  }
  existing.count += 1;
  if (existing.count > limit) {
    // Reset before throw so a recovered boundary doesn't immediately
    // throw again on the next mount.
    HARD_GUARD_COUNTERS.delete(name);
    throw new Error(`Runaway render detected in ${name} — ${existing.count} renders in ${now - existing.mountedAt}ms`);
  }
}

// Test-only — reset hard-guard state between scenarios.
export function __resetHardGuardCountersForTesting() {
  HARD_GUARD_COUNTERS.clear();
}

// Router-call guard — detects `router.replace` / `router.push` storms.
// Operators reported the freeze persists even with uncontrolled inputs;
// suspicion is now on a router/searchParams synchronization loop. This
// guard wraps a `useRouter()` instance so we can count actual mutations
// to the URL. If more than 20 fire in 2 seconds, throws so the error
// boundary can surface a diagnostic instead of letting the browser lock.
//
// Usage: const router = useGuardedRouter(); router.replace(href).
const ROUTER_CALL_COUNTER = { count: 0, firstSeen: 0 };
const ROUTER_CALL_LIMIT = 20;
const ROUTER_CALL_WINDOW_MS = 2_000;

type GuardedRouterMethod = 'push' | 'replace' | 'refresh' | 'back' | 'forward' | 'prefetch';

function guardRouterCall(method: GuardedRouterMethod) {
  const now = Date.now();
  if (now - ROUTER_CALL_COUNTER.firstSeen > ROUTER_CALL_WINDOW_MS) {
    ROUTER_CALL_COUNTER.firstSeen = now;
    ROUTER_CALL_COUNTER.count = 0;
  }
  ROUTER_CALL_COUNTER.count += 1;
  if (typeof console !== 'undefined' && (method === 'push' || method === 'replace')) {
    console.log(`[hotels-perf] router.${method} #${ROUTER_CALL_COUNTER.count} within ${now - ROUTER_CALL_COUNTER.firstSeen}ms`);
  }
  if (ROUTER_CALL_COUNTER.count > ROUTER_CALL_LIMIT) {
    const elapsed = now - ROUTER_CALL_COUNTER.firstSeen;
    ROUTER_CALL_COUNTER.count = 0;
    ROUTER_CALL_COUNTER.firstSeen = now;
    throw new Error(
      `Router synchronization loop detected — router.${method} called ${ROUTER_CALL_LIMIT + 1}+ times in ${elapsed}ms`,
    );
  }
}

// Test-only escape hatch — reset router call counter between scenarios.
export function __resetRouterCallCounterForTesting() {
  ROUTER_CALL_COUNTER.count = 0;
  ROUTER_CALL_COUNTER.firstSeen = 0;
}

// Wraps a router instance so every push/replace/refresh increments the
// counter. Logs each call when console.log is available; throws when
// the threshold is exceeded.
export function withRouterCallGuard<T extends Record<string, any>>(router: T): T {
  if (typeof window === 'undefined') return router;
  const guarded = { ...router } as Record<string, any>;
  const methods: GuardedRouterMethod[] = ['push', 'replace', 'refresh', 'back', 'forward', 'prefetch'];
  for (const method of methods) {
    const original = router[method];
    if (typeof original !== 'function') continue;
    guarded[method] = (...args: unknown[]) => {
      guardRouterCall(method);
      return original.apply(router, args);
    };
  }
  return guarded as T;
}

// Measures the wall-clock cost of an arbitrary block. Logs a warning
// when the block takes longer than `slowMs`. Used to time expensive
// memo derivations inside RoomCategoriesManager during the isolation
// hunt.
export function measurePerf<T>(label: string, fn: () => T, slowMs = 16): T {
  if (typeof performance === 'undefined') return fn();
  const startedAt = performance.now();
  const result = fn();
  const durationMs = performance.now() - startedAt;
  if (durationMs > slowMs) {
    console.warn(`[hotels-perf] ${label} took ${durationMs.toFixed(1)}ms (slow threshold ${slowMs}ms)`);
  }
  return result;
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
