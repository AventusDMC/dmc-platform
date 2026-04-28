'use client';

import { useRouter } from 'next/navigation';

type AdminBackButtonProps = {
  fallbackHref: string;
  label: string;
  className?: string;
};

export function AdminBackButton({ fallbackHref, label, className = 'back-link' }: AdminBackButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={className}
      data-fallback-href={fallbackHref}
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
          return;
        }

        router.push(fallbackHref);
      }}
    >
      &larr; {label}
    </button>
  );
}
