import { ExternalLink } from 'lucide-react';

/**
 * Always-visible fallback to the Classic Operations surface. Navigation only
 * (a plain GET link) — never hidden, never behind a menu. Mirrors the Quote
 * Builder V2 "Open Classic Builder" affordance.
 */
export function OpenInClassicButton({
  href,
  label = 'Open in Classic',
  title,
}: {
  href: string;
  label?: string;
  title?: string;
}) {
  return (
    <a
      href={href}
      title={title ?? 'Open the full Classic Operations workspace'}
      className="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ExternalLink className="size-4" aria-hidden="true" />
      {label}
    </a>
  );
}
