'use client';

import { useEffect, useMemo, useState } from 'react';

export type TransportTariffWorkbookRow = {
  id: string;
  supplier: string;
  route: string;
  pricingMode: string;
  vehicleType: string;
  paxRange: string;
  currency: string;
  validity: string;
  cost: string;
  notes: string;
  status: string;
};

type TransportTariffWorkbookGridProps = {
  rows: TransportTariffWorkbookRow[];
};

const WORKBOOK_COLUMNS: Array<{ key: keyof TransportTariffWorkbookRow; label: string; className?: string }> = [
  { key: 'supplier', label: 'Supplier', className: 'transport-tariff-workbook-cell-wide' },
  { key: 'route', label: 'Route', className: 'transport-tariff-workbook-cell-wide' },
  { key: 'pricingMode', label: 'Pricing mode', className: 'transport-tariff-workbook-cell-wide' },
  { key: 'vehicleType', label: 'Vehicle type', className: 'transport-tariff-workbook-cell-wide' },
  { key: 'paxRange', label: 'Pax range' },
  { key: 'currency', label: 'Currency' },
  { key: 'validity', label: 'Validity', className: 'transport-tariff-workbook-cell-wide' },
  { key: 'cost', label: 'Cost' },
  { key: 'notes', label: 'Notes', className: 'transport-tariff-workbook-cell-wide' },
  { key: 'status', label: 'Active / inactive' },
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

export function TransportTariffWorkbookGrid({ rows }: TransportTariffWorkbookGridProps) {
  const [workbookRows, setWorkbookRows] = useState(rows);
  const rowSignature = useMemo(() => rows.map((row) => row.id).join('|'), [rows]);
  const summary = useMemo(() => {
    const supplierCount = new Set(rows.map((row) => row.supplier)).size;
    const routeCount = new Set(rows.map((row) => row.route)).size;

    return { supplierCount, routeCount };
  }, [rows]);

  useEffect(() => {
    setWorkbookRows(rows);
  }, [rows, rowSignature]);

  function updateCell(rowId: string, key: keyof TransportTariffWorkbookRow, value: string) {
    setWorkbookRows((currentRows) => currentRows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)));
  }

  function exportWorkbook() {
    downloadCsv('transportation-tariff-workbook.csv', [
      WORKBOOK_COLUMNS.map((column) => column.label),
      ...workbookRows.map((row) => WORKBOOK_COLUMNS.map((column) => String(row[column.key] ?? ''))),
    ]);
  }

  function exportImportTemplate() {
    downloadCsv('transportation-tariff-import-template.csv', [
      WORKBOOK_COLUMNS.map((column) => column.label),
      [
        'Supplier name',
        'Amman Airport to Petra',
        'Point-to-Point',
        'Coach',
        '1-49',
        'USD',
        '2026-01-01 - 2026-12-31',
        '0.00',
        'Operational contract note',
        'Active',
      ],
    ]);
  }

  return (
    <section className="transport-tariff-workbook-shell" aria-label="Transportation tariff workbook">
      <div className="transport-tariff-workbook-toolbar">
        <div>
          <p className="eyebrow">Workbook staging</p>
          <h2>Transportation Tariff Workbook</h2>
          <p className="detail-copy">
            Local grid for transport contracting review across {summary.supplierCount} suppliers and {summary.routeCount} routes. Edits are staged
            in the browser only for Phase 1.
          </p>
        </div>
        <div className="transport-tariff-workbook-actions">
          <button type="button" className="secondary-button" onClick={exportImportTemplate}>
            Import template
          </button>
          <button type="button" className="primary-button" onClick={exportWorkbook}>
            Export workbook
          </button>
        </div>
      </div>

      <div className="transport-tariff-workbook-scroll">
        <table className="transport-tariff-workbook-table">
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
                      aria-label={`${column.label} for ${row.supplier} ${row.route}`}
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

      <div className="transport-tariff-workbook-import-foundation">
        <strong>Import foundation</strong>
        <span>Template structure is available. Bulk import validation and persistence are intentionally not enabled in Phase 1.</span>
      </div>
    </section>
  );
}
