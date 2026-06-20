"use client"

import { useRouter } from "next/navigation"
import { QuoteBuilderV2 } from "../../../../components/quote/v2/quote-builder-v2"
import type { Quote } from "../../../../lib/quote-types"
import { getDefaultProposalPreviewHref, getDefaultProposalPdfHref } from "../proposal-paths"

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

  // Set the primary hotel for an option-set via the EXISTING endpoint:
  // PATCH /api/quotes/:id/options/:optionId/hotel-options/:hotelOptionId { isPrimary: true }
  // (backend transactionally demotes the other same-city options). This is a
  // proposal-display choice — the backend does NOT recalculate pricing here.
  // No new endpoint, no schema/pricing change. Throws on failure so the Hotels
  // step can surface an error; refreshes the route on success.
  const handleSetPrimaryHotel = async (optionId: string, hotelOptionId: string) => {
    if (!quote) return
    const res = await fetch(
      `/api/quotes/${quote.id}/options/${optionId}/hotel-options/${hotelOptionId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      },
    )
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      throw new Error(body?.slice(0, 200) || `Could not set primary hotel (${res.status}).`)
    }
    router.refresh()
  }

  // Preview ONLY: open the existing proposal-v3 HTML preview in a new tab, in the
  // selected language. Reuses the canonical helper + same-origin authenticated
  // proxy (/api/quotes/:id/proposal-v3/html). No PDF generated, nothing sent.
  const handlePreview = (q: Quote, language: string) => {
    const href = getDefaultProposalPreviewHref(q.id, language)
    window.open(href, "_blank", "noopener,noreferrer")
  }

  // Download the existing proposal-v3 PDF in the selected language via the
  // same-origin /api proxy (cookie auth). Read-only render — nothing persisted,
  // no email. Throws on failure so the Proposal step can show an error.
  const handleDownloadPdf = async (q: Quote, language: string) => {
    const res = await fetch(getDefaultProposalPdfHref("/api", q.id, language))
    const contentType = res.headers.get("content-type") || ""
    if (!res.ok || !contentType.toLowerCase().includes("application/pdf")) {
      const body = await res.text().catch(() => "")
      throw new Error(body.slice(0, 200) || `Could not download PDF (${res.status}).`)
    }
    const blob = await res.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement("a")
    const suffix = language && language !== "en" ? `-${language}` : ""
    link.href = url
    link.download = `quote-${q.id}${suffix}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }

  return (
    <QuoteBuilderV2
      quote={quote}
      error={error}
      onRetry={() => router.refresh()}
      onSave={handleSave}
      onSend={handleSend}
      onDownloadPdf={handleDownloadPdf}
      onPreview={handlePreview}
      onSetPrimaryHotel={handleSetPrimaryHotel}
      initialStep="hotels"
    />
  )
}
