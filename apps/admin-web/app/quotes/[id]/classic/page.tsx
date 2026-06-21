import {
  ClassicQuoteWorkspace,
  type QuoteDetailsPageProps,
} from "../ClassicQuoteWorkspace";

// Always renders the classic quote workspace, regardless of the V2-default flag,
// so the classic builder stays reachable when V2 is the default at /quotes/[id].
export default async function ClassicQuotePage(props: QuoteDetailsPageProps) {
  return <ClassicQuoteWorkspace {...props} />;
}
