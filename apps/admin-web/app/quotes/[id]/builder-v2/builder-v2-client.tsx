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

  // "Mark as Sent" — reuse the EXISTING status endpoint to move the quote to
  // SENT. This is a status-only change: it does NOT email the client, attach a
  // PDF, or create a public proposal link. The backend sets sentAt + writes an
  // audit log and independently enforces completeness (rejects with 400 if the
  // quote isn't ready). Throws with the backend message so the UI can show it;
  // refreshes V2 data on success. No new endpoint / no backend change.
  const handleSend = async (q: Quote) => {
    const res = await fetch(`/api/quotes/${q.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "SENT" }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      let message = body
      try {
        const parsed = JSON.parse(body)
        message = Array.isArray(parsed?.message)
          ? parsed.message.join("; ")
          : parsed?.message || body
      } catch {
        // non-JSON body — use raw text
      }
      throw new Error(message?.slice(0, 300) || `Could not mark the quote as sent (${res.status}).`)
    }
    router.refresh()
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

  // Update a quote item's CLIENT-FACING display text via the pricing-inert
  // endpoint: PATCH /api/quotes/:id/items/:itemId/display-text. Only whitelisted
  // text fields (external-package text + transport route label) are forwarded;
  // the backend never re-prices. Throws the backend message on failure so the
  // inline editor can surface it; refreshes the route on success.
  const handleUpdateDisplayText = async (quoteItemId: string, patch: Record<string, string | null>) => {
    if (!quote) return
    const res = await fetch(`/api/quotes/${quote.id}/items/${quoteItemId}/display-text`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      let message = body
      try {
        const parsed = JSON.parse(body)
        message = Array.isArray(parsed?.message)
          ? parsed.message.join("; ")
          : parsed?.message || body
      } catch {
        // non-JSON body — use raw text
      }
      throw new Error(message?.slice(0, 300) || `Could not save client text (${res.status}).`)
    }
    router.refresh()
  }

  // Share / public proposal link — reuse the EXISTING public-link endpoints.
  // Enable/disable only mutate the quote's public* fields (no status change, no
  // email, no audit). Each returns the new {publicEnabled, publicToken} so the
  // Proposal step can update its Share state immediately (Copy works without a
  // full reload). Throws the backend message on failure.
  const postPublicLink = async (q: Quote, action: "enable" | "disable") => {
    const res = await fetch(`/api/quotes/${q.id}/${action}-public-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      let message = body
      try {
        const parsed = JSON.parse(body)
        message = Array.isArray(parsed?.message)
          ? parsed.message.join("; ")
          : parsed?.message || body
      } catch {
        // non-JSON body — use raw text
      }
      throw new Error(message?.slice(0, 300) || `Could not ${action} the public link (${res.status}).`)
    }
    const data = await res.json().catch(() => ({}))
    return {
      publicEnabled: Boolean(data?.publicEnabled),
      publicToken: typeof data?.publicToken === "string" ? data.publicToken : null,
    }
  }
  const handleEnablePublicLink = (q: Quote) => postPublicLink(q, "enable")
  const handleDisablePublicLink = (q: Quote) => postPublicLink(q, "disable")

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
      onUpdateDisplayText={handleUpdateDisplayText}
      onEnablePublicLink={handleEnablePublicLink}
      onDisablePublicLink={handleDisablePublicLink}
      initialStep="hotels"
    />
  )
}
