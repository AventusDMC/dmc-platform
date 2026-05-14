'use client';

import { useEffect, useMemo, useState } from 'react';

export type ExcursionTariffWorkbookRow = {
  id: string;
  activityName: string;
  originCity?: string | null;
  variant: string;
  category: string;
  cityRegion: string;
  supplier: string;
  pricingBasis: string;
  currency: string;
  duration: string;
  cost: string;
  sell: string;
  operationalNotes: string;
  status: string;
};

type ExcursionTariffWorkbookGridProps = {
  rows?: ExcursionTariffWorkbookRow[] | null;
};

const WORKBOOK_COLUMNS: Array<{ key: keyof ExcursionTariffWorkbookRow; label: string; className?: string }> = [
  { key: 'activityName', label: 'Activity / excursion', className: 'excursion-tariff-workbook-cell-wide' },
  { key: 'variant', label: 'Variant', className: 'excursion-tariff-workbook-cell-wide' },
  { key: 'category', label: 'Category' },
  { key: 'cityRegion', label: 'City / region', className: 'excursion-tariff-workbook-cell-wide' },
  { key: 'supplier', label: 'Supplier', className: 'excursion-tariff-workbook-cell-wide' },
  { key: 'pricingBasis', label: 'Pricing basis' },
  { key: 'currency', label: 'Currency' },
  { key: 'duration', label: 'Duration' },
  { key: 'cost', label: 'Cost' },
  { key: 'sell', label: 'Sell' },
  { key: 'operationalNotes', label: 'Operational notes', className: 'excursion-tariff-workbook-cell-wide' },
  { key: 'status', label: 'Active / inactive' },
];

export function getExcursionTariffDisplayName(row: Pick<ExcursionTariffWorkbookRow, 'activityName' | 'originCity'>) {
  return row.originCity?.trim() ? `${row.activityName} — From ${row.originCity.trim()}` : row.activityName;
}

export function buildExcursionTariffCsvRows(rows: ExcursionTariffWorkbookRow[]) {
  return [
    WORKBOOK_COLUMNS.map((column) => column.label),
    ...rows.map((row) =>
      WORKBOOK_COLUMNS.map((column) =>
        column.key === 'activityName' ? getExcursionTariffDisplayName(row) : String(row[column.key] ?? ''),
      ),
    ),
  ];
}

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

export function ExcursionTariffWorkbookGrid({ rows }: ExcursionTariffWorkbookGridProps) {
  const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);
  const [workbookRows, setWorkbookRows] = useState(safeRows);
  const rowSignature = useMemo(() => safeRows.map((row) => row.id).join('|'), [safeRows]);
  const summary = useMemo(() => {
    const activityCount = new Set(safeRows.map((row) => row.activityName)).size;
    const supplierCount = new Set(safeRows.map((row) => row.supplier)).size;

    return { activityCount, supplierCount };
  }, [safeRows]);

  useEffect(() => {
    setWorkbookRows(safeRows);
  }, [safeRows, rowSignature]);

  function updateCell(rowId: string, key: keyof ExcursionTariffWorkbookRow, value: string) {
    setWorkbookRows((currentRows) => currentRows.map((row) => (row.id === rowId ? { ...row, [key]: value } : row)));
  }

  function exportWorkbook() {
    downloadCsv('excursion-tariff-workbook.csv', buildExcursionTariffCsvRows(workbookRows));
  }

  function exportImportTemplate() {
    downloadCsv('excursion-tariff-import-template.csv', [
      WORKBOOK_COLUMNS.map((column) => column.label),
      [
        'Petra Hiking Experiences',
        'Monastery Trail',
        'Hiking',
        'Petra / South Jordan',
        'Supplier name',
        'PER_PERSON',
        'JOD',
        '4 hr',
        '0.00',
        '0.00',
        'Guide required; seasonal notes',
        'Active',
      ],
    ]);
  }

  return (
    <section className="excursion-tariff-workbook-shell" aria-label="Excursion tariff workbook">
      <div className="excursion-tariff-workbook-toolbar">
        <div>
          <p className="eyebrow">Workbook staging</p>
          <h2>Excursion Tariff Workbook</h2>
          <p className="detail-copy">
            Local grid for excursion contracting review across {summary.activityCount} activity masters and {summary.supplierCount} suppliers.
            Edits are staged in the browser only for Phase 1.
          </p>
        </div>
        <div className="excursion-tariff-workbook-actions">
          <button type="button" className="secondary-button" onClick={exportImportTemplate}>
            Import template
          </button>
          <button type="button" className="primary-button" onClick={exportWorkbook}>
            Export workbook
          </button>
        </div>
      </div>

      <div className="excursion-tariff-workbook-scroll">
        <table className="excursion-tariff-workbook-table">
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
                      aria-label={`${column.label} for ${row.activityName} ${row.variant}`}
                      value={column.key === 'activityName' ? getExcursionTariffDisplayName(row) : String(row[column.key] ?? '')}
                      onChange={(event) => updateCell(row.id, column.key, event.target.value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="excursion-tariff-workbook-import-foundation">
        <strong>Import foundation</strong>
        <span>Template structure is available. Bulk import validation and persistence are intentionally not enabled in Phase 1.</span>
      </div>
    </section>
  );
}
