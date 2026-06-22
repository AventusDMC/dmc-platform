"use client"

import { useState } from "react"
import { Pencil, Loader2 } from "lucide-react"
import { Button } from "../../../ui/button"

export interface DisplayTextField {
  key: string
  label: string
  value: string
  multiline?: boolean
}

export interface DisplayTextEditorProps {
  /** Whitelisted display-text fields for this item (already client-facing). */
  fields: DisplayTextField[]
  /**
   * Persist the changed fields. Receives ONLY the fields that changed; an empty
   * string is sent as `null` (clear). Must reject (throw) on failure so the
   * inline error can surface. The parent is expected to refresh after success.
   */
  onSave: (patch: Record<string, string | null>) => void | Promise<void>
}

// Inline "Client text" editor — edit / save / cancel with an inline error state.
// Pricing-inert by construction: it only ever emits the whitelisted text fields
// it was given, never any pricing/quantity/identity field.
export function DisplayTextEditor({ fields, onSave }: DisplayTextEditorProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.value])),
  )

  const startEdit = () => {
    setDraft(Object.fromEntries(fields.map((f) => [f.key, f.value])))
    setError(null)
    setEditing(true)
  }

  const cancel = () => {
    setEditing(false)
    setError(null)
  }

  const save = async () => {
    // Send only fields that actually changed; empty string → null (clear).
    const patch: Record<string, string | null> = {}
    for (const f of fields) {
      const next = (draft[f.key] ?? "").trim()
      const prev = (f.value ?? "").trim()
      if (next !== prev) patch[f.key] = next === "" ? null : next
    }
    if (Object.keys(patch).length === 0) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(patch)
      setEditing(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save client text.")
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    const filled = fields.filter((f) => f.value.trim().length > 0)
    return (
      <div className="mt-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Client text
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs"
            onClick={startEdit}
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
            Edit
          </Button>
        </div>
        {filled.length > 0 ? (
          <dl className="mt-1 space-y-0.5">
            {filled.map((f) => (
              <div key={f.key} className="text-xs">
                <span className="text-muted-foreground">{f.label}: </span>
                <span className="text-foreground">{f.value}</span>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-1 text-xs italic text-muted-foreground">No client text set.</p>
        )}
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-md border border-border bg-card px-3 py-2.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Client text
      </span>
      <div className="mt-2 space-y-2.5">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-xs font-medium text-foreground">{f.label}</span>
            {f.multiline ? (
              <textarea
                className="w-full resize-y rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                rows={3}
                value={draft[f.key] ?? ""}
                disabled={saving}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              />
            ) : (
              <input
                type="text"
                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={draft[f.key] ?? ""}
                disabled={saving}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              />
            )}
          </label>
        ))}
      </div>
      {error ? (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-2.5 flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={cancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button size="sm" className="h-7 gap-1.5 px-2.5 text-xs" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" /> : null}
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  )
}
