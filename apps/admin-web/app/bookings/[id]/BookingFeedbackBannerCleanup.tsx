'use client';

import { useEffect } from 'react';

const FEEDBACK_PARAMS = ['warningText', 'warning', 'success', 'error'] as const;

// Strips one-shot feedback query params from the URL after the page has rendered.
// The banner stays visible for the current view (it was already rendered server-side
// from the original URL); the strip is purely so a refresh doesn't re-show the same
// banner because the param is still in the address bar. Uses history.replaceState
// rather than router.replace so it does NOT trigger a Next.js refetch.
export function BookingFeedbackBannerCleanup() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    let changed = false;
    for (const key of FEEDBACK_PARAMS) {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) {
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  return null;
}
