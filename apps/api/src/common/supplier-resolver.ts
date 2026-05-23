type SupplierResolverPrisma = {
  supplier: {
    findUnique(args: { where: { id: string }; select: { id: true; name: true } }): Promise<{ id: string; name: string } | null>;
  };
};

type ResolveOperationalSupplierInput = {
  supplierId?: string | null;
  supplierName?: string | null;
  prisma: SupplierResolverPrisma;
};

export type ResolvedOperationalSupplier = {
  supplierId: string | null;
  supplierName: string | null;
  supplierStatus?: 'resolved' | 'unresolved';
};

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export async function resolveOperationalSupplier({
  supplierId,
  supplierName,
  prisma,
}: ResolveOperationalSupplierInput): Promise<ResolvedOperationalSupplier> {
  const normalizedSupplierId = normalizeOptionalText(supplierId);
  const normalizedSupplierName = normalizeOptionalText(supplierName);

  if (normalizedSupplierId) {
    try {
      const supplier = await prisma.supplier.findUnique({
        where: { id: normalizedSupplierId },
        select: { id: true, name: true },
      });

      if (supplier) {
        return {
          supplierId: supplier.id,
          supplierName: supplier.name,
          supplierStatus: 'resolved',
        };
      }

      console.warn('[supplier-resolver] supplierId did not resolve to a supplier', {
        supplierId: normalizedSupplierId,
        hadSupplierName: Boolean(normalizedSupplierName),
      });
    } catch {
      // Keep operational flows non-blocking; unresolved supplier state is surfaced to callers.
    }
  }

  if (normalizedSupplierId || normalizedSupplierName) {
    return {
      supplierId: null,
      supplierName: normalizedSupplierName,
      supplierStatus: 'unresolved',
    };
  }

  return {
    supplierId: null,
    supplierName: null,
  };
}
