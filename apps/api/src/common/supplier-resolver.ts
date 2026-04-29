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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  if (normalizedSupplierId && UUID_PATTERN.test(normalizedSupplierId)) {
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
    } catch {
      // Keep operational flows non-blocking; unresolved supplier state is surfaced to callers.
    }
  }

  if (normalizedSupplierId || normalizedSupplierName) {
    return {
      supplierId: null,
      supplierName: normalizedSupplierName ?? normalizedSupplierId,
      supplierStatus: 'unresolved',
    };
  }

  return {
    supplierId: null,
    supplierName: null,
  };
}
