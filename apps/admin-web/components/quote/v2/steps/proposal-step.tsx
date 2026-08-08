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
import { Check, X, FileText, Download, Send, AlertTriangle, ArrowRight, Loader2, Link2, Copy, Info, ExternalLink, Mail, Save } from "lucide-react"

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
  /**
   * VV-1: Save a proposal VERSION (snapshot) via the existing createVersion
   * (POST /quotes/:id/versions). Reuses the Classic versioning backend — NO status
   * change, NO invoice, NO booking, NO send. Returns the new version number.
   */
  onSaveVersion?: (label?: string) => Promise<{ versionNumber?: number | null }>
  /** Whether the Save-proposal-version affordance is available (role + editable status). */
  canSaveVersion?: boolean
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
  /** Link to the classic builder — for the Classic-only client email-send workflow. */
  classicHref?: string
  /**
   * Whether the "Send to client" affordance is available (flag + role + status
   * eligible). When false the button is not shown. Separate from Mark as Sent.
   */
  canSendProposalEmail?: boolean
  /** Client contact email (recipient). Null/empty => button disabled with a message. */
  proposalEmailRecipient?: string | null
  /**
   * Send the proposal email. Returns the backend result (blocked/dryRun/
   * delivered) so the modal can message it. Does NOT change quote status.
   */
  onSendProposalEmail?: (opts?: { attachPdf?: boolean }) => Promise<{
    sent?: boolean
    dryRun?: boolean
    delivered?: boolean
    blocked?: boolean
    blockedReason?: string | null
    recipient?: string | null
    messageId?: string | null
  }>
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
  onSaveVersion,
  canSaveVersion = false,
  publicToken,
  publicEnabled = false,
  onEnablePublicLink,
  onDisablePublicLink,
  onNavigate,
  itineraryDays = [],
  classicHref,
  canSendProposalEmail = false,
  proposalEmailRecipient = null,
  onSendProposalEmail,
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

  // ---- VV-1: Save proposal version (snapshot) — no status/invoice/booking/send ----
  const [versionLabel, setVersionLabel] = useState("")
  const [savingVersion, setSavingVersion] = useState(false)
  const [savedVersionNumber, setSavedVersionNumber] = useState<number | null>(null)
  const [versionError, setVersionError] = useState<string | null>(null)

  const handleSaveVersion = async () => {
    if (!onSaveVersion || savingVersion) return
    setSavingVersion(true)
    setVersionError(null)
    setSavedVersionNumber(null)
    try {
      const label = versionLabel.trim()
      const res = await onSaveVersion(label || undefined)
      setSavedVersionNumber(typeof res?.versionNumber === "number" ? res.versionNumber : null)
      setVersionLabel("")
    } catch (e) {
      setVersionError(e instanceof Error ? e.message : "Could not save the proposal version.")
    } finally {
      setSavingVersion(false)
    }
  }

  // ---- Send to client (proposal email) — separate from Mark as Sent ----
  const recipient = (proposalEmailRecipient || "").trim()
  const hasRecipient = recipient.length > 0
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailSending, setEmailSending] = useState(false)
  const [emailAttachPdf, setEmailAttachPdf] = useState(false)
  const [emailResult, setEmailResult] = useState<
    { tone: "success" | "info" | "error"; text: string } | null
  >(null)

  const handleSendProposalEmailClick = async () => {
    if (!onSendProposalEmail || emailSending) return
    setEmailSending(true)
    setEmailResult(null)
    try {
      const res = await onSendProposalEmail({ attachPdf: emailAttachPdf })
      if (res?.blocked) {
        if (res.blockedReason === "feature_disabled") {
          setEmailResult({ tone: "info", text: "Proposal email sending is not enabled." })
        } else if (res.blockedReason === "missing_contact_email") {
          setEmailResult({ tone: "error", text: "No client email on file — add one in Classic Builder." })
        } else if (res.blockedReason === "status") {
          setEmailResult({ tone: "info", text: "This quote's status does not allow sending the proposal email." })
        } else {
          setEmailResult({ tone: "info", text: "Sending the proposal email is currently blocked." })
        }
      } else if (res?.dryRun) {
        setEmailResult({ tone: "info", text: "Email composed in dry-run mode; no real email was sent." })
      } else if (res?.delivered) {
        setEmailResult({ tone: "success", text: `Proposal email sent to ${res.recipient || recipient}.` })
      } else {
        setEmailResult({ tone: "error", text: "Could not send the proposal email. Please try again." })
      }
    } catch (err) {
      setEmailResult({
        tone: "error",
        text: err instanceof Error ? err.message.slice(0, 300) : "Could not send the proposal email.",
      })
    } finally {
      setEmailSending(false)
    }
  }

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
            {/* VV-1: Save proposal version — snapshot only (no status/invoice/send). */}
            {canSaveVersion && onSaveVersion ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={versionLabel}
                  onChange={(e) => setVersionLabel(e.target.value)}
                  placeholder="Version label (optional)"
                  aria-label="Proposal version label"
                  disabled={savingVersion}
                  className="w-40 rounded-md border border-input bg-background px-2 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button size="sm" variant="outline" onClick={handleSaveVersion} disabled={savingVersion}>
                  {savingVersion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {savingVersion ? "Saving…" : "Save version"}
                </Button>
              </div>
            ) : null}
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
            {/* Send to client — emails the proposal (separate from Mark as Sent).
                Only shown when the flag/role/status allow it. Disabled (with a
                reason) when no client email is on file. */}
            {canSendProposalEmail && onSendProposalEmail ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEmailResult(null)
                  setEmailModalOpen(true)
                }}
                disabled={!hasRecipient}
                aria-disabled={!hasRecipient}
                title={hasRecipient ? undefined : "No client email on file — add one in Classic Builder."}
              >
                <Mail className="h-4 w-4" />
                Send to client
              </Button>
            ) : null}
          </div>
        }
      />

      {/* VV-1: Save-proposal-version result (snapshot only — no status/invoice/send). */}
      {savedVersionNumber != null ? (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-emerald-600" role="status">
          <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Saved proposal version {savedVersionNumber}. This is a snapshot only — no status change, no email, no invoice.
        </p>
      ) : null}
      {versionError ? (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-destructive" role="alert">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {versionError}
        </p>
      ) : null}

      {/* Clarify what "Mark as Sent" does — it is a status-only change. READY
          quotes now open V2 by default, so make explicit that emailing the client
          is NOT part of this action and still lives in Classic Builder. Copy/link
          only — no behavior change. */}
      <div
        className="mb-4 flex flex-col gap-2 rounded-md border border-border bg-muted/40 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
        role="note"
      >
        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium text-foreground">“Mark as Sent”</span> updates the quote status to Sent.
            It does not email the client. Use Classic Builder if you need the email-send workflow.
          </span>
        </div>
        {classicHref ? (
          <a
            href={classicHref}
            className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            title="Open the classic quote workspace to send the client email"
          >
            <ExternalLink className="size-3.5" aria-hidden="true" />
            Open Classic Builder to send email
          </a>
        ) : null}
      </div>

      {/* Result banner for the last "Send to client" attempt (persists after the
          modal closes). feature_disabled / dry-run / delivered / error. */}
      {emailResult ? (
        <p
          className={
            emailResult.tone === "error"
              ? "mb-3 flex items-start gap-1.5 text-xs text-destructive"
              : emailResult.tone === "success"
                ? "mb-3 flex items-start gap-1.5 text-xs text-success"
                : "mb-3 flex items-start gap-1.5 text-xs text-muted-foreground"
          }
          role={emailResult.tone === "error" ? "alert" : "status"}
        >
          {emailResult.tone === "error" ? (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : emailResult.tone === "success" ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          )}
          <span>{emailResult.text}</span>
        </p>
      ) : null}

      {/* Confirmation modal for "Send to client". Shows the recipient, explains
          it sends the proposal email (status-only "Mark as Sent" is separate),
          and offers an optional PDF attachment. Backend remains the source of
          truth (flag/role/status + dry-run). */}
      {emailModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Send proposal to client"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-background p-5 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-heading text-sm font-semibold text-foreground">Send proposal to client</h3>
              <button
                type="button"
                onClick={() => setEmailModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Close"
                disabled={emailSending}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <p className="mt-3 text-xs text-muted-foreground">
              This emails the proposal to the client contact below. It is separate from
              {" "}
              <span className="font-medium text-foreground">“Mark as Sent”</span>, which only changes the quote status.
            </p>

            <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Recipient</div>
              <div className="font-medium text-foreground">{recipient || "—"}</div>
            </div>

            <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={emailAttachPdf}
                onChange={(e) => setEmailAttachPdf(e.target.checked)}
                disabled={emailSending}
              />
              Attach the proposal PDF
            </label>

            {emailResult ? (
              <p
                className={
                  emailResult.tone === "error"
                    ? "mt-3 text-xs text-destructive"
                    : emailResult.tone === "success"
                      ? "mt-3 text-xs text-success"
                      : "mt-3 text-xs text-muted-foreground"
                }
              >
                {emailResult.text}
              </p>
            ) : null}

            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setEmailModalOpen(false)} disabled={emailSending}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSendProposalEmailClick} disabled={emailSending || !hasRecipient}>
                {emailSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {emailSending ? "Sending…" : "Send email"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

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
