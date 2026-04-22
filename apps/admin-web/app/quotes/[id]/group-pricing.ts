export type QuotePricingMode = 'SLAB' | 'FIXED';

export type GroupPricingEditorRow = {
  id?: string;
  clientId: string;
  minPax: string;
  maxPax: string;
  focPax: string;
  price: string;
  notes: string;
};

export type GroupPricingSlab = {
  id?: string;
  minPax: number;
  maxPax: number | null;
  focPax: number;
  price: number;
  notes: string | null;
  label: string;
};

export type GroupPricingPreview = {
  groupSize: number;
  matchedSlab: GroupPricingSlab | null;
  payingGuests: number | null;
  pricePerGuest: number | null;
  estimatedTotal: number | null;
};

export type GroupPricingValidationResult = {
  errors: string[];
  parsedRows: ReturnType<typeof parseGroupPricingRows>;
};

export function createGroupPricingRow(values?: Partial<GroupPricingEditorRow>): GroupPricingEditorRow {
  return {
    id: values?.id,
    clientId: values?.clientId || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    minPax: values?.minPax || '',
    maxPax: values?.maxPax || '',
    focPax: values?.focPax || '0',
    price: values?.price || '',
    notes: values?.notes || '',
  };
}

export function formatSlabLabel(minPax: number, maxPax: number | null, focPax = 0) {
  const rangeLabel =
    maxPax === null ? `${minPax}+ guests` : minPax === maxPax ? `${minPax} guest` : `${minPax}\u2013${maxPax} guests`;
  return focPax > 0 ? `${rangeLabel} + ${focPax} FOC` : rangeLabel;
}

export function normalizeGroupPricingRows(rows: GroupPricingEditorRow[]) {
  return [...rows]
    .map((row) => ({
      ...row,
      focPax: row.focPax || '0',
    }))
    .sort((left, right) => {
      const leftMin = Number(left.minPax);
      const rightMin = Number(right.minPax);
      if (!Number.isFinite(leftMin) && !Number.isFinite(rightMin)) {
        return 0;
      }
      if (!Number.isFinite(leftMin)) {
        return 1;
      }
      if (!Number.isFinite(rightMin)) {
        return -1;
      }
      return leftMin - rightMin;
    });
}

export function parseGroupPricingRows(rows: GroupPricingEditorRow[]) {
  return normalizeGroupPricingRows(rows)
    .map((row) => {
      const minPax = row.minPax.trim() ? Number(row.minPax) : Number.NaN;
      const maxPax = row.maxPax.trim() ? Number(row.maxPax) : null;
      const focPax = row.focPax.trim() ? Number(row.focPax) : 0;
      const price = row.price.trim() ? Number(row.price) : Number.NaN;
      return {
        id: row.id,
        clientId: row.clientId,
        minPax,
        maxPax,
        focPax,
        price,
        notes: row.notes.trim() || null,
        label:
          Number.isInteger(minPax) && (maxPax === null || Number.isInteger(maxPax)) && Number.isInteger(focPax)
            ? formatSlabLabel(minPax, maxPax, focPax)
            : 'Awaiting range',
      };
    })
    .filter((row) => Number.isFinite(row.minPax) || row.maxPax !== null || Number.isFinite(row.price) || row.notes || row.focPax > 0);
}

export function validateSlabs(rows: GroupPricingEditorRow[]): GroupPricingValidationResult {
  const errors: string[] = [];
  const parsedRows = parseGroupPricingRows(rows);

  if (parsedRows.length === 0) {
    return {
      errors: ['Add at least one slab for group pricing.'],
      parsedRows,
    };
  }

  parsedRows.forEach((row, index) => {
    const rowLabel = `Row ${index + 1}`;
    if (!Number.isInteger(row.minPax) || row.minPax < 1) {
      errors.push(`${rowLabel}: From Pax is required and must be a whole number above zero.`);
    }
    if (row.maxPax !== null && (!Number.isInteger(row.maxPax) || row.maxPax < 1)) {
      errors.push(`${rowLabel}: To Pax must be blank or a whole number above zero.`);
    }
    if (row.maxPax !== null && Number.isInteger(row.minPax) && row.maxPax < row.minPax) {
      errors.push(`${rowLabel}: To Pax must be greater than or equal to From Pax.`);
    }
    if (!Number.isFinite(row.price) || row.price <= 0) {
      errors.push(`${rowLabel}: Per Guest Price is required and must be above zero.`);
    }
    if (!Number.isInteger(row.focPax) || row.focPax < 0) {
      errors.push(`${rowLabel}: FOC must be zero or greater.`);
    }
    if (Number.isInteger(row.minPax) && Number.isInteger(row.focPax) && row.focPax >= row.minPax) {
      errors.push(`${rowLabel}: FOC must be lower than the minimum group size.`);
    }
    if (Number.isInteger(row.minPax) && Number.isInteger(row.focPax) && row.minPax - row.focPax <= 0) {
      errors.push(`${rowLabel}: Paying pax must stay above zero after FOC.`);
    }
  });

  const sorted = [...parsedRows].sort((left, right) => left.minPax - right.minPax);
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (previous.maxPax === null) {
      errors.push(`Row ${parsedRows.findIndex((row) => row.clientId === previous.clientId) + 1}: Open-ended slab must be last.`);
      continue;
    }
    if (current.minPax <= previous.maxPax) {
      const previousIndex = parsedRows.findIndex((row) => row.clientId === previous.clientId) + 1;
      const currentIndex = parsedRows.findIndex((row) => row.clientId === current.clientId) + 1;
      errors.push(`Rows ${previousIndex} and ${currentIndex}: slab ranges cannot overlap.`);
    }
  }

  const openEndedIndex = sorted.findIndex((row) => row.maxPax === null);
  if (openEndedIndex !== -1 && openEndedIndex !== sorted.length - 1) {
    const rowNumber = parsedRows.findIndex((row) => row.clientId === sorted[openEndedIndex].clientId) + 1;
    errors.push(`Row ${rowNumber}: Open-ended slab must be last.`);
  }

  return {
    errors: Array.from(new Set(errors)),
    parsedRows,
  };
}

export function findMatchingSlab(groupSize: number, slabs: GroupPricingSlab[]) {
  return slabs.find((slab) => groupSize >= slab.minPax && (slab.maxPax === null || groupSize <= slab.maxPax)) || null;
}

export function buildGroupPricingPreview(groupSize: number, rows: GroupPricingEditorRow[]): GroupPricingPreview {
  const safeGroupSize = Math.max(1, Math.floor(groupSize || 1));
  const validation = validateSlabs(rows);
  const validSlabs: GroupPricingSlab[] = validation.errors.length
    ? []
    : validation.parsedRows
    .filter(
      (row) =>
        Number.isInteger(row.minPax) &&
        (row.maxPax === null || Number.isInteger(row.maxPax)) &&
        Number.isInteger(row.focPax) &&
        Number.isFinite(row.price) &&
        row.price > 0,
    )
    .map((row) => ({
      id: row.id,
      minPax: row.minPax,
      maxPax: row.maxPax,
      focPax: row.focPax,
      price: row.price,
      notes: row.notes,
      label: row.label,
    }));
  const matchedSlab = findMatchingSlab(safeGroupSize, validSlabs);

  if (!matchedSlab) {
    return {
      groupSize: safeGroupSize,
      matchedSlab: null,
      payingGuests: null,
      pricePerGuest: null,
      estimatedTotal: null,
    };
  }

  const payingGuests = safeGroupSize - Math.max(0, matchedSlab.focPax);
  if (payingGuests <= 0) {
    return {
      groupSize: safeGroupSize,
      matchedSlab,
      payingGuests: null,
      pricePerGuest: null,
      estimatedTotal: null,
    };
  }

  return {
    groupSize: safeGroupSize,
    matchedSlab,
    payingGuests,
    pricePerGuest: matchedSlab.price,
    estimatedTotal: Number((matchedSlab.price * payingGuests).toFixed(2)),
  };
}

export function buildAutoSlabRows(groupSize: number) {
  const maxTarget = Math.max(groupSize, 1);
  const templates: Array<{ minPax: number; maxPax: number | null }> = [
    { minPax: 1, maxPax: 1 },
    { minPax: 2, maxPax: 3 },
    { minPax: 4, maxPax: 6 },
    { minPax: 7, maxPax: 9 },
    { minPax: 10, maxPax: 14 },
    { minPax: 15, maxPax: 19 },
    { minPax: 20, maxPax: 24 },
    { minPax: 25, maxPax: 29 },
    { minPax: 30, maxPax: 39 },
    { minPax: 40, maxPax: null },
  ];

  const rows: GroupPricingEditorRow[] = [];
  for (const template of templates) {
    rows.push(
      createGroupPricingRow({
        minPax: String(template.minPax),
        maxPax: template.maxPax === null ? '' : String(template.maxPax),
        focPax: '0',
        price: '',
        notes: '',
      }),
    );

    if (template.maxPax === null || template.maxPax >= maxTarget) {
      break;
    }
  }

  if (rows.length > 0) {
    const lastRow = rows[rows.length - 1];
    if (lastRow.maxPax) {
      rows[rows.length - 1] = {
        ...lastRow,
        maxPax: '',
      };
    }
  }

  return rows;
}
