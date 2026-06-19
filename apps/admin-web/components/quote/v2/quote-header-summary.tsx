import {
  Building,
  Languages,
  CalendarDays,
  Users,
  MapPin,
  BedDouble,
  Hash,
  Tag,
} from "lucide-react"
import { Card } from "../../ui/card"
import { cn } from "../../../lib/utils"
import { formatQuoteDate } from "../../../lib/quote-helpers"
import type { QuoteMeta, Client } from "../../../lib/quote-types"

function Field({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  )
}

export function QuoteHeaderSummary({
  meta,
  client,
}: {
  meta: QuoteMeta
  client: Client
}) {
  // Use the same formatter as the classic /quotes/[id] page (runtime timezone,
  // not forced UTC) so travel dates match the old page, and guard missing dates
  // so the header never shows "Invalid Date".
  const startLabel = formatQuoteDate(meta.startDate)
  const endLabel = formatQuoteDate(meta.endDate)
  const dateRange = startLabel === "—" ? "—" : `${startLabel} – ${endLabel}`

  return (
    <Card className="p-5">
      <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Hash className="size-3.5" aria-hidden="true" />
            {meta.reference}
          </div>
          <h2 className="mt-1 text-balance font-heading text-lg font-semibold tracking-tight text-foreground">
            {meta.title}
          </h2>
        </div>
        <span
          className={cn(
            "inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
            meta.quoteType === "Group"
              ? "border-primary/20 bg-accent text-accent-foreground"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          <Tag className="size-3" aria-hidden="true" />
          {meta.quoteType === "Group" ? "Group (GIT)" : "FIT"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <Field icon={Building} label="Client / Agency" value={client.agency.name} />
        <Field icon={Languages} label="Market Language" value={meta.marketLanguage} />
        <Field icon={CalendarDays} label="Travel Dates" value={`${dateRange} · ${meta.nights} nts`} />
        <Field icon={Users} label="Pax" value={`${meta.pax} pax + ${meta.tourLeaders} TL`} />
        <Field icon={MapPin} label="Destination" value={meta.destination} />
        <Field icon={BedDouble} label="Rooming" value={meta.rooming} />
      </div>
    </Card>
  )
}
