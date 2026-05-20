'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type TariffExportSupplier = {
  id: string;
  name: string;
  type?: string | null;
};

type TransportTariffExportActionsProps = {
  className?: string;
  suppliers?: TariffExportSupplier[];
  selectedSupplierId?: string;
};

function buildTariffExportSupplierOptions(suppliers: TariffExportSupplier[]) {
  const transportSuppliers = suppliers.filter((supplier) => !supplier.type || supplier.type.toLowerCase() === 'transport');
  const preferredNames = ['Almushtari Logistics Services', 'Alpha Transportation'];
  const preferred = preferredNames
    .map((name) => transportSuppliers.find((supplier) => supplier.name.toLowerCase() === name.toLowerCase()))
    .filter((supplier): supplier is TariffExportSupplier => Boolean(supplier));
  const preferredIds = new Set(preferred.map((supplier) => supplier.id));
  const remaining = transportSuppliers.filter((supplier) => !preferredIds.has(supplier.id)).sort((left, right) => left.name.localeCompare(right.name));

  return [...preferred, ...remaining];
}

function buildExportHref(kind: 'transfer' | 'touring', supplierId: string) {
  const params = new URLSearchParams();
  if (supplierId) {
    params.set('supplierId', supplierId);
  }

  const query = params.toString();
  return `/api/vehicle-rates/tariff-matrix/${kind}/export${query ? `?${query}` : ''}`;
}

export function getTariffExportHref(kind: 'transfer' | 'touring', supplierId: string) {
  return buildExportHref(kind, supplierId);
}

export function TransportTariffExportActions({
  className = 'transport-rate-card-toolbar',
  suppliers = [],
  selectedSupplierId = '',
}: TransportTariffExportActionsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const supplierOptions = buildTariffExportSupplierOptions(suppliers);
  const propSupplierId = supplierOptions.some((supplier) => supplier.id === selectedSupplierId) ? selectedSupplierId : '';
  const [currentSupplierId, setCurrentSupplierId] = useState(propSupplierId);
  const resolvedSupplierId = supplierOptions.some((supplier) => supplier.id === currentSupplierId) ? currentSupplierId : '';

  useEffect(() => {
    setCurrentSupplierId(propSupplierId);
  }, [propSupplierId]);

  function handleSupplierChange(nextSupplierId: string) {
    setCurrentSupplierId(nextSupplierId);
    const params = new URLSearchParams(searchParams.toString());

    if (nextSupplierId) {
      params.set('supplierId', nextSupplierId);
    } else {
      params.delete('supplierId');
    }

    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  }

  return (
    <div className={className}>
      <label className="tariff-export-supplier-selector">
        Supplier
        <select name="supplierId" value={resolvedSupplierId} onChange={(event) => handleSupplierChange(event.target.value)}>
          <option value="">All suppliers</option>
          {supplierOptions.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
            </option>
          ))}
        </select>
      </label>
      <a className="primary-button" href={buildExportHref('transfer', resolvedSupplierId)} download>
        Export Transfer Tariffs
      </a>
      <a className="secondary-button" href={buildExportHref('touring', resolvedSupplierId)} download>
        Export Touring Tariffs
      </a>
    </div>
  );
}
