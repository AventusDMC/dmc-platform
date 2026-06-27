"use client"

import { useState } from "react"
import { ChevronDown, ListChecks } from "lucide-react"
import { Card } from "../../ui/card"
import { cn } from "../../../lib/utils"
import {
  V2_READINESS_LABEL,
  type V2ReadinessAudit,
  type V2ReadinessLevel,
} from "../../../lib/quote-v2-readiness"

// Calm, non-scary chips. "Needs review" uses the warning tone (advisory), never
// the destructive tone — these are informational, not hard blockers.
const LEVEL_CHIP: Record<V2ReadinessLevel, string> = {
  ready: "bg-muted text-success",
  preview: "bg-accent text-accent-foreground",
  classic: "bg-muted text-muted-foreground",
  review: "bg-muted text-warning-foreground",
}

function LevelChip({ level }: { level: V2ReadinessLevel }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        LEVEL_CHIP[level],
      )}
    >
      {V2_READINESS_LABEL[level]}
    </span>
  )
}

/**
 * Read-only "Can this quote be handled in V2?" panel. Informational only — it
 * renders the precomputed audit and never mutates anything or changes readiness.
 */
export function V2ReadinessPanel({ audit }: { audit: V2ReadinessAudit }) {
  const [open, setOpen] = useState(false)
  const { rows, counts } = audit
  // Compact one-line summary for the collapsed header.
  const summary = (["ready", "preview", "classic", "review"] as V2ReadinessLevel[])
    .filter((l) => counts[l] > 0)
    .map((l) => `${counts[l]} ${V2_READINESS_LABEL[l].toLowerCase()}`)
    .join(" · ")

  // Group rows by section for the expanded body.
  const sections: { section: string; rows: typeof rows }[] = []
  for (const r of rows) {
    const last = sections[sections.length - 1]
    if (last && last.section === r.section) last.rows.push(r)
    else sections.push({ section: r.section, rows: [r] })
  }

  return (
    <Card className="p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2">
          <ListChecks className="size-4 text-muted-foreground" aria-hidden="true" />
          <span className="font-heading text-sm font-semibold text-foreground">V2 readiness</span>
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      <p className="mt-1 text-xs text-muted-foreground">
        Can this quote be handled in Quote Builder V2? Informational — Classic remains the default.
      </p>
      {summary ? <p className="mt-1 text-xs font-medium text-muted-foreground">{summary}</p> : null}

      {open ? (
        <div className="mt-3 space-y-3">
          {sections.map((group) => (
            <div key={group.section}>
              <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {group.section}
              </div>
              <ul className="mt-1 space-y-1.5">
                {group.rows.map((row) => (
                  <li key={row.key} className="rounded-md border border-border px-2.5 py-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="min-w-0 flex-1 text-xs font-medium text-foreground">{row.label}</span>
                      <LevelChip level={row.level} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{row.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  )
}
