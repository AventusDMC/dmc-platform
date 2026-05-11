'use client';

import { useMemo, useState } from 'react';

export type HotelTariffWorkbookRow = {
  id: string;
  hotelName: string;
  city: string;
  contractName: string;
  contractStatus: string;
  validity: string;
  roomCategory: string;
  mealPlan: 'RO' | 'BB' | 'HB' | 'FB' | 'AI';
  occupancyType: string;
  pricingBasis: string;
  currency: string;
  bbRate: string;
  hbRate: string;
  fbRate: string;
  supplements: string;
  singleSupplement: string;
  childPolicy: string;
  notes: string;
};

type HotelTariffWorkbookGridProps = {
  rows: HotelTariffWorkbookRow[];
};

const WORKBOOK_COLUMNS: Array<{ key: keyof HotelTariffWorkbookRow; label: string; className?: string }> = [
  { key: 'hotelName', label: 'Hotel', className: 'hotel-tariff-workbook-cell-wide' },
  { key: 'city', label: 'City' },
  { key: 'contractName', label: 'Contract', className: 'hotel-tariff-workbook-cell-wide' },
  { key: 'contractStatus', label: 'Status' },
  { key: 'validity', label: 'Validity', className: 'hotel-tariff-workbook-cell-wide' },
  { key: 'roomCategory', label: 'Room category', className: 'hotel-tariff-workbook-cell-wide' },
  { key: 'mealPlan', label: 'Meal plan' },
  { key: 'occupancyType', label: 'Occupancy' },
  { key: 'pricingBasis', label: 'Basis' },
  { key: 'currency', label: 'Currency' },
  { key: 'bbRate', label: 'BB rate' },
  { key: 'hbRate', label: 'HB rate' },
  { key: 'fbRate', label: 'FB rate' },
  { key: 'supplements', label: 'Supplements', className: 'hotel-tariff-workbook-cell-wide' },
  { key: 'singleSupplement', label: 'Single supplement', className: 'hotel-tariff-workbook-cell-wide' },
  { key: 'childPolicy', label: 'Child policy', className: 'hotel-tariff-workbook-cell-wide' },
  { key: 'notes', label: 'Notes', className: 'hotel-tariff-workbook-cell-wide' },
];

function csvEscape(value: string) {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map((row) => row.map((value) => csvEscape(value)).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function HotelTariffWorkbookGrid({ rows }: HotelTariffWorkbookGridProps) {
  const [workbookRows, setWorkbookRows] = useState(rows);
  const summary = useMemo(() => {
    const hotelCount = new Set(rows.map((row) => row.hotelName)).size;
    const contractCount = new Set(rows.map((row) => `${row.hotelName}:${row.contractName}`)).size;

    return { hotelCount, contractCount };
  }, [rows]);

  function updateCell(rowId: string, key: keyof HotelTariffWorkbookRow, value: string) {
    setWorkbookRows((currentRows) => currentRows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)));
  }

  function exportWorkbook() {
    downloadCsv('hotel-tariff-workbook.csv', [
      WORKBOOK_COLUMNS.map((column) => column.label),
      ...workbookRows.map((row) => WORKBOOK_COLUMNS.map((column) => String(row[column.key] ?? ''))),
    ]);
  }

  function exportImportTemplate() {
    downloadCsv('hotel-tariff-import-template.csv', [
      WORKBOOK_COLUMNS.map((column) => column.label),
      [
        'Hotel name',
        'City',
        'Contract name',
        'current',
        '2026-01-01 - 2026-12-31',
        'Standard Room',
        'BB',
        'DBL',
        'per room/night',
        'JOD',
        '0.00',
        '',
        '',
        'Gala Dinner: 35.00 JOD per person',
        'Single Supplement: 20.00 JOD per night',
        'Children 0-5 free',
        'Operational note',
      ],
    ]);
  }

  return (
    <section className="hotel-tariff-workbook-shell" aria-label="Hotel tariff workbook">
      <div className="hotel-tariff-workbook-toolbar">
        <div>
          <p className="eyebrow">Workbook staging</p>
          <h2>Hotel Tariff Workbook</h2>
          <p className="detail-copy">
            Local grid for contract maintenance review across {summary.hotelCount} hotels and {summary.contractCount} contracts. Edits are staged in
            the browser only for Phase 1.
          </p>
        </div>
        <div className="hotel-tariff-workbook-actions">
          <button type="button" className="secondary-button" onClick={exportImportTemplate}>
            Import template
          </button>
          <button type="button" className="primary-button" onClick={exportWorkbook}>
            Export workbook
          </button>
        </div>
      </div>

      <div className="hotel-tariff-workbook-scroll">
        <table className="hotel-tariff-workbook-table">
          <thead>
            <tr>
              {WORKBOOK_COLUMNS.map((column) => (
                <th key={column.key} className={column.className}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workbookRows.map((row) => (
              <tr key={row.id}>
                {WORKBOOK_COLUMNS.map((column) => (
                  <td key={column.key} className={column.className}>
                    <input
                      aria-label={`${column.label} for ${row.hotelName} ${row.contractName}`}
                      value={String(row[column.key] ?? '')}
                      onChange={(event) => updateCell(row.id, column.key, event.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="hotel-tariff-workbook-import-foundation">
        <strong>Import foundation</strong>
        <span>Template structure is available. Bulk import validation and persistence are intentionally not enabled in Phase 1.</span>
      </div>
    </section>
  );
}
