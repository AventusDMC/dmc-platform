'use client';

import { useState } from 'react';

type DeleteOperationButtonProps = {
  description: string;
};

// Small client wrapper so we can intercept the submit click and require a confirm.
// The parent <form> still owns the action URL and CSRF cookies; this button just
// gates the submit and forwards the `_method=DELETE` form value when confirmed.
export function DeleteOperationButton({ description }: DeleteOperationButtonProps) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="submit"
      name="_method"
      value="DELETE"
      className="secondary-button"
      disabled={busy}
      onClick={(event) => {
        const ok = window.confirm(`Delete this operation row? "${description || 'Untitled'}" will be removed from the booking.`);
        if (!ok) {
          event.preventDefault();
          return;
        }
        setBusy(true);
      }}
    >
      {busy ? 'Deleting...' : 'Delete'}
    </button>
  );
}
