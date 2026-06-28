import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { ClassicQuoteWorkspace, type QuoteDetailsPageProps } from "./ClassicQuoteWorkspace";
import {
  quoteBuilderV2IsDefault,
  quoteBuilderV2ScopedConfigPresent,
  quoteBuilderV2DefaultForQuote,
} from "./quote-readiness";
import { loadQuoteV2 } from "../../../lib/quote-v2-adapter";
import { readSessionActor } from "../../lib/auth-session";

// `/quotes/[id]` is the canonical quote URL. Which builder it opens is decided
// here:
//   - NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT === 'true'  → V2 for everyone (blanket).
//   - else a SCOPED rollout (NEXT_PUBLIC_QUOTE_BUILDER_V2_DEFAULT_STATUSES /
//     _ROLES) → V2 only for matching quote status / user role.
//   - nothing configured → the classic workspace (current behaviour; default OFF).
// When V2 is the default it redirects to the canonical `/quotes/[id]/builder-v2`
// route — the single source of truth for the V2 render (role + preview-flag
// gating live there). Classic always stays reachable at `/quotes/[id]/classic`.
// Flag/scope OFF is a no-op vs today, so this is safe to ship and trivial to roll
// back.
export default async function QuoteDetailsPage(props: QuoteDetailsPageProps) {
  // Blanket default → V2 for everyone.
  if (quoteBuilderV2IsDefault()) {
    const { id } = await props.params;
    redirect(`/quotes/${id}/builder-v2`);
  }

  // Scoped default → only load the quote/role when a scope is actually configured
  // (otherwise this stays a zero-overhead Classic render, exactly as today).
  if (quoteBuilderV2ScopedConfigPresent()) {
    const { id } = await props.params;
    const role = readSessionActor((await cookies()).get("dmc_session")?.value || "")?.role ?? null;
    const { quote } = await loadQuoteV2(id);
    const statusCode = (quote?.meta?.statusCode ?? "").toUpperCase();
    if (quoteBuilderV2DefaultForQuote({ statusCode, role })) {
      redirect(`/quotes/${id}/builder-v2`);
    }
  }

  return <ClassicQuoteWorkspace {...props} />;
}
