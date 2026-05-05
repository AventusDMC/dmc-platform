export const SUPPLIER_STANDARDIZATION_HELPER_TEXT = 'Use standardized suppliers to avoid duplicate contracts and pricing mismatches.';

export type SupplierLookup = {
  id: string;
  name: string;
};

export function normalizeSupplierName(value?: string | null) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

export function normalizeSupplierKey(value?: string | null) {
  return normalizeSupplierName(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveSupplierNameById(supplierId: string | null | undefined, suppliers: SupplierLookup[]) {
  return supplierId ? suppliers.find((supplier) => supplier.id === supplierId)?.name || '' : '';
}
