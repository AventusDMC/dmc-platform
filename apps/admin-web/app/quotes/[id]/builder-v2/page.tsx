import type { Metadata } from "next"
import { BuilderV2Client } from "./builder-v2-client"
import { loadQuoteV2 } from "../../../../lib/quote-v2-adapter"

export const metadata: Metadata = {
  title: "Quote Builder V2 — Aventus DMC",
}

/**
 * Route-ready entry point for the redesigned Quote Builder.
 *
 * Data loading + ERP→UI normalisation now lives in `loadQuoteV2` (see
 * `@/lib/quote-v2-adapter`). The actual ERP fetch is the Phase B integration
 * point inside that file; this page stays a thin server shell that forwards
 * the normalised quote (or error) to the client wrapper.
 */
export default async function QuoteBuilderV2Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { quote, error } = await loadQuoteV2(id)

  return <BuilderV2Client quote={quote} error={error} />
}
