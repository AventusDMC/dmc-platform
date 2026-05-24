'use client';

// Tiny client wrapper so we can trigger browser print from a server-rendered
// voucher detail page. No PDF engine yet — relying on the browser's native
// print dialog plus the `@media print` rules scoped to .operational-voucher-page.
export function PrintVoucherButton() {
  return (
    <button
      type="button"
      className="button button-secondary voucher-print-control"
      onClick={() => {
        if (typeof window !== 'undefined') {
          window.print();
        }
      }}
    >
      Print
    </button>
  );
}
