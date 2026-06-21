import { BuilderV2Client } from "./builder-v2/builder-v2-client";
import { ClassicQuoteWorkspace, type QuoteDetailsPageProps } from "./ClassicQuoteWorkspace";
import { quoteBuilderV2IsDefault } from "./quote-readiness";
import { loadQuoteV2 } from "../../../lib/quote-v2-adapter";

// `/quotes/[id]` is the canonical quote URL. Which builder it opens is decided by
// the NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT feature flag:
//   - flag ON  → Quote Builder V2 (classic stays available at /quotes/[id]/classic)
//   - flag OFF → the classic workspace (current behaviour; default)
// Flag OFF is a no-op vs today, so this is safe to ship and trivial to roll back.
export default async function QuoteDetailsPage(props: QuoteDetailsPageProps) {
  if (quoteBuilderV2IsDefault()) {
    const { id } = await props.params;
    const { quote, error } = await loadQuoteV2(id);
    return <BuilderV2Client quote={quote} error={error} />;
  }
  return <ClassicQuoteWorkspace {...props} />;
}
