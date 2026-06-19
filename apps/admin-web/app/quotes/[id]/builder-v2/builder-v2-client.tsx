"use client"

import { useRouter } from "next/navigation"
import { QuoteBuilderV2 } from "../../../../components/quote/v2/quote-builder-v2"
import type { Quote } from "../../../../lib/quote-types"
import { getDefaultProposalPreviewHref, isProposalLanguage } from "../proposal-paths"

/**
 * Thin client wrapper that owns the side-effecting handlers (save / send /
 * PDF). Wire these to your existing server actions or API routes — the
 * presentational components stay backend-agnostic.
 *
 * Phase A is read-only: `quote` arrives already loaded + normalised from the
 * server (`loadQuoteV2`). The mutating handlers below remain intentionally
 * STUBBED until Phase B/C.
 */
export function BuilderV2Client({
  quote,
  error = null,
}: {
  quote: Quote | null
  error?: string | null
}) {
  const router = useRouter()

  // PHASE B: replace with your "save draft" server action / API call.
  const handleSave = async (q: Quote) => {
    console.log("[v0] save draft (stub)", q.id)
    await new Promise((r) => setTimeout(r, 600))
  }

  // PHASE C: replace with your "send quote" server action / API call.
  const handleSend = async (q: Quote) => {
    console.log("[v0] send quote (stub)", q.id)
    await new Promise((r) => setTimeout(r, 800))
  }

  // PHASE C: replace with your PDF generation endpoint. Still a stub.
  const handleGeneratePdf = async (q: Quote) => {
    console.log("[v0] generate pdf (stub)", q.id)
  }

  // Preview ONLY: open the existing proposal-v3 HTML preview in a new tab.
  // Reuses the canonical helper + same-origin authenticated proxy
  // (/api/quotes/:id/proposal-v3/html). No PDF generated, nothing sent.
  const handlePreview = (q: Quote) => {
    const language = isProposalLanguage(q.meta.marketLanguage) ? q.meta.marketLanguage : "en"
    const href = getDefaultProposalPreviewHref(q.id, language)
    window.open(href, "_blank", "noopener,noreferrer")
  }

  return (
    <QuoteBuilderV2
      quote={quote}
      error={error}
      onRetry={() => router.refresh()}
      onSave={handleSave}
      onSend={handleSend}
      onGeneratePdf={handleGeneratePdf}
      onPreview={handlePreview}
      initialStep="hotels"
    />
  )
}
