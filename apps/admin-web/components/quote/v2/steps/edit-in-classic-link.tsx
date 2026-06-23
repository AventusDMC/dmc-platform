"use client"

import { ExternalLink } from "lucide-react"

/**
 * Builds a stable deep link into the Classic Builder for a single quote item.
 *
 * Classic consumes `?tab=services|transport` (resolveActiveQuoteTab in
 * ClassicQuoteWorkspace) and a `#quote-item-<id>` anchor — QuoteItemCard renders
 * `id={`quote-item-${item.id}`}`, and that id equals the V2 `quoteItemId`. When a
 * row has no quoteItemId (synthetic/fallback rows) we fall back to the tab-only
 * link, which is still a supported, stable Classic deep link.
 *
 * Returns null when there is no base classic href so callers can render nothing.
 * This builder is pure string construction — it performs no navigation or fetch.
 */
export function buildClassicItemHref(
  classicHref: string | undefined,
  tab: "services" | "transport",
  quoteItemId?: string,
): string | null {
  if (!classicHref) return null
  const base = `${classicHref}?tab=${tab}`
  return quoteItemId ? `${base}#quote-item-${quoteItemId}` : base
}

/**
 * Small, non-blocking per-row link that opens the Classic Builder to edit a
 * priced item. Purely presentational — a plain anchor, no mutation/fetch. It is
 * intentionally styled as a subtle text link (not a button/field) so V2 rows do
 * not read as inline-editable.
 */
export function EditInClassicLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title="Open this item in the Classic Builder to edit pricing or details"
    >
      <ExternalLink className="size-3.5" aria-hidden="true" />
      Edit in Classic
    </a>
  )
}
