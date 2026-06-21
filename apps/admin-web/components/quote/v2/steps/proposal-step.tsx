"use client"

import { useState } from "react"
import { Card } from "../../../ui/card"
import { Button } from "../../../ui/button"
import { StepHeader } from "../step-header"
import { cn } from "../../../../lib/utils"
import { formatCurrency } from "../../../../lib/quote-helpers"
import { PROPOSAL_LANGUAGES } from "../../../../app/quotes/[id]/proposal-paths"
import {
  evaluateNotesLanguageWarning,
  proposalLanguageEnglishName,
} from "../../../../app/quotes/[id]/proposal-notes-language"
import type {
  QuoteMeta,
  PricingBreakdown,
  ProposalContent,
  ProposalReadinessItem,
  ItineraryDay,
  StepId,
} from "../../../../lib/quote-types"
import { Check, X, FileText, Download, Send, AlertTriangle, ArrowRight, Loader2, Link2, Copy } from "lucide-react"

export interface ProposalStepProps {
  meta: QuoteMeta
  pricing: PricingBreakdown
  proposal: ProposalContent
  readiness: ProposalReadinessItem[]
  /** Whether "Mark as Sent" is allowed (readiness passes + not lifecycle-locked). */
  canSend: boolean
  /** True while the Mark-as-Sent status change is in flight. */
  saving?: boolean
  /** Why Mark-as-Sent is disabled (readiness or lifecycle reason). */
  sendDisabledReason?: string
  /** Backend error from the last Mark-as-Sent attempt. */
  sendError?: string | null
  /** Selected proposal language CODE (en|pt|es|ar). */
  language: string
  /** Change the selected proposal language (render-time only; not persisted). */
  onLanguageChange: (language: string) => void
  /** Download the proposal-v3 PDF in the selected language. May be async. */
  onDownloadPdf?: (language: string) => void | Promise<void>
  /** Mark the quote as Sent (status → SENT). Confirms before mutating. */
  onSend?: () => void
  /** Current public-link state (display-only seed for the Share section). */
  publicToken?: string | null
  publicEnabled?: boolean
  /** Enable the public proposal link; resolves to the new public state. */
  onEnablePublicLink?: () => Promise<{ publicEnabled: boolean; publicToken: string | null }>
  /** Disable the public proposal link; resolves to the new public state. */
  onDisablePublicLink?: () => Promise<{ publicEnabled: boolean; publicToken: string | null }>
  onNavigate: (step: StepId) => void
  /**
   * Itinerary days (for the non-blocking notes-language advisory). Display-only;
   * never mutated. Optional so the step still renders without itinerary data.
   */
  itineraryDays?: ItineraryDay[]
}

export function ProposalStep({
  meta,
  pricing,
  proposal,
  readiness,
  canSend,
  saving = false,
  sendDisabledReason,
  sendError,
  language,
  onLanguageChange,
  onDownloadPdf,
  onSend,
  publicToken,
  publicEnabled = false,
  onEnablePublicLink,
  onDisablePublicLink,
  onNavigate,
  itineraryDays = [],
}: ProposalStepProps) {
  const sendDisabled = !canSend || saving
  const outstanding = readiness.filter((c) => !c.done)

  // Non-blocking advisory: stored day notes may not appear in the selected
  // proposal language (proposal-v3 suppresses notes whose notesLanguage differs
  // from the render locale). Reuses the classic, pure helper. Display-only.
  const notesWarning = evaluateNotesLanguageWarning(
    itineraryDays.map((d) => ({ notes: d.notes, notesLanguage: d.notesLanguage })),
    language,
  )
  const languageName = proposalLanguageEnglishName(language)

  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  // ---- Share / public proposal link (separate from Mark as Sent) ----
  // Local state seeded from the quote; updated from the enable/disable response
  // so Copy works immediately without a full reload.
  const [share, setShare] = useState<{ publicEnabled: boolean; publicToken: string | null }>({
    publicEnabled: Boolean(publicEnabled),
    publicToken: publicToken ?? null,
  })
  const [sharePending, setSharePending] = useState<null | "enable" | "disable">(null)
  const [shareError, setShareError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const linkActive = share.publicEnabled && !!share.publicToken
  const shareUrl =
    linkActive && typeof window !== "undefined"
      ? `${window.location.origin}/proposal/${share.publicToken}`
      : null

  const handleEnablePublicLink = async () => {
    if (!onEnablePublicLink) return
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        "Enable public proposal link? Anyone with the link will be able to view this proposal.",
      )
    ) {
      return
    }
    setSharePending("enable")
    setShareError(null)
    try {
      setShare(await onEnablePublicLink())
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Could not enable the public link.")
    } finally {
      setSharePending(null)
    }
  }

  const handleDisablePublicLink = async () => {
    if (!onDisablePublicLink) return
    if (
      typeof window !== "undefined" &&
      !window.confirm("Disable this public proposal link? The current link will stop working.")
    ) {
      return
    }
    setSharePending("disable")
    setShareError(null)
    try {
      setShare(await onDisablePublicLink())
      setCopied(false)
    } catch (err) {
      setShareError(err instanceof Error ? err.message : "Could not disable the public link.")
    } finally {
      setSharePending(null)
    }
  }

  const handleCopyLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setShareError("Could not copy the link to the clipboard.")
    }
  }

  const handleDownload = async () => {
    if (!onDownloadPdf) return
    setDownloading(true)
    setDownloadError(null)
    try {
      await onDownloadPdf(language)
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "Could not download the PDF.")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div>
      <StepHeader
        title="Proposal & Review"
        description="Choose the proposal language, then preview or download the client-facing proposal."
        statusLabel="Preview / download"
        statusTone="preview"
        helper="You can preview the proposal and download the PDF. Sending is not available in V2 yet."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="sr-only sm:not-sr-only">Language</span>
              <select
                value={language}
                onChange={(e) => onLanguageChange(e.target.value)}
                aria-label="Proposal language"
                className="rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {PROPOSAL_LANGUAGES.map((entry) => (
                  <option key={entry.code} value={entry.code}>
                    {entry.label}
                  </option>
                ))}
              </select>
            </label>
            <Button size="sm" variant="outline" onClick={handleDownload} disabled={downloading || !onDownloadPdf}>
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {downloading ? "Preparing…" : "Download PDF"}
            </Button>
            {/* Mark as Sent — status-only change (no email, no public link). */}
            <Button
              size="sm"
              onClick={onSend}
              disabled={sendDisabled}
              aria-disabled={sendDisabled}
              title={sendDisabled ? sendDisabledReason : undefined}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {saving ? "Marking…" : "Mark as Sent"}
            </Button>
          </div>
        }
      />

      {notesWarning.warn ? (
        <p
          className="mb-3 flex items-start gap-1.5 text-xs text-warning-foreground"
          role="note"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" aria-hidden="true" />
          <span>
            {notesWarning.mode === "explicit"
              ? `Some day notes are saved as ${proposalLanguageEnglishName(notesWarning.fromLanguage)}, but this proposal is set to ${languageName}. Review or save ${languageName} day narratives in the Itinerary step before sending to the client.`
              : `Some day notes may not match the selected proposal language (${languageName}). Review the day narratives in the Itinerary step before sending to the client.`}
          </span>
        </p>
      ) : null}

      {sendError ? (
        <p className="mb-3 flex items-start gap-1.5 text-xs text-destructive" role="alert">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{sendError}</span>
        </p>
      ) : sendDisabled && sendDisabledReason ? (
        <p className="mb-3 text-xs text-muted-foreground" role="note">
          {sendDisabledReason}
        </p>
      ) : null}

      {downloadError ? (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {downloadError}
        </p>
      ) : null}

      {/* Share — public proposal link. Separate from Mark as Sent; reuses the
          existing enable/disable-public-link endpoints. No email, no status change. */}
      {onEnablePublicLink || onDisablePublicLink ? (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-foreground">Share · public proposal link</h3>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    linkActive
                      ? "bg-success/15 text-success"
                      : "border border-border bg-muted text-muted-foreground",
                  )}
                >
                  {linkActive ? "Link active" : "No public link"}
                </span>
              </div>
              <p className="mt-1 text-pretty text-xs text-muted-foreground">
                Creates a client-accessible link to view this proposal online. Separate from “Mark as
                Sent” — enabling a link does not change the quote status or email anyone.
              </p>
              <p className="mt-1 text-pretty text-[11px] text-muted-foreground">
                Public proposal links currently render in English. Use Preview Proposal or Download PDF
                for language-specific versions.
              </p>
              {linkActive && shareUrl ? (
                <p className="mt-2 break-all rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] text-foreground">
                  {shareUrl}
                </p>
              ) : null}
              {shareError ? (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive" role="alert">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{shareError}</span>
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {linkActive ? (
                <>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={handleCopyLink}>
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copied ? "Copied" : "Copy link"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={handleDisablePublicLink}
                    disabled={sharePending !== null || !onDisablePublicLink}
                  >
                    {sharePending === "disable" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                    {sharePending === "disable" ? "Disabling…" : "Disable link"}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={handleEnablePublicLink}
                  disabled={sharePending !== null || !onEnablePublicLink}
                >
                  {sharePending === "enable" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  {sharePending === "enable" ? "Enabling…" : "Enable public link"}
                </Button>
              )}
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-foreground">{meta.title}</span>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-success">
                  Included
                </h4>
                <ul className="space-y-1.5">
                  {proposal.included.map((item) => (
                    <li key={item} className="flex gap-2 text-xs text-foreground">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Not included
                </h4>
                <ul className="space-y-1.5">
                  {proposal.excluded.map((item) => (
                    <li key={item} className="flex gap-2 text-xs text-muted-foreground">
                      <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border bg-accent/40 px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Total for {pricing.pax} travellers
              </span>
              <div className="text-right">
                <div className="text-lg font-semibold text-foreground">
                  {formatCurrency(pricing.sellingPrice, pricing.currency)}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {formatCurrency(pricing.perPerson, pricing.currency)} per person
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Card className="p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground">Readiness checklist</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {canSend
              ? "All checks passed — ready to send."
              : `${outstanding.length} item${outstanding.length === 1 ? "" : "s"} still need attention. Select one to jump to its step.`}
          </p>
          <ul className="mt-3 space-y-1">
            {readiness.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigate(item.step)}
                  className="group flex w-full items-start gap-2.5 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-muted"
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                      item.done
                        ? "bg-success text-success-foreground"
                        : "bg-warning/20 text-warning",
                    )}
                  >
                    {item.done ? (
                      <Check className="h-3 w-3" />
                    ) : (
                      <AlertTriangle className="h-2.5 w-2.5" />
                    )}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 flex-1 text-xs",
                      item.done ? "text-muted-foreground line-through" : "text-foreground",
                    )}
                  >
                    {item.label}
                  </span>
                  {!item.done && (
                    <ArrowRight
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  )
}
