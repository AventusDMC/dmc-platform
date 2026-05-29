// One-off sample generator: a FULLY-FILLED contract workbook that mirrors
// HotelContractExportService exactly (every sheet, same columns, fills,
// dropdowns, hidden _id + veryHidden _Reference). Filled with a realistic
// Jordan contract so all sheets show populated data. Not wired into the
// app — safe to delete.
const ExcelJS = require('exceljs');
const path = require('path');

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
const SYSTEM_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
const EDITABLE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F8E8' } };
const README_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
const CURRENCY_CODES = ['USD', 'JOD', 'AED', 'EUR', 'GBP'];
const SCHEMA_VERSION = 1;

const styleHeaderRow = (sheet, fill = HEADER_FILL) =>
  sheet.getRow(1).eachCell((c) => { c.font = { bold: true }; c.fill = fill; });

function paintEditableColumns(sheet, systemHeaders) {
  const systemSet = new Set(systemHeaders);
  sheet.columns.forEach((column, index) => {
    const header = String(sheet.getRow(1).getCell(index + 1).value || '');
    const isSystem = systemSet.has(header);
    column.eachCell({ includeEmpty: false }, (cell, n) => {
      if (n === 1) return;
      cell.fill = isSystem ? SYSTEM_FILL : EDITABLE_FILL;
    });
  });
}

function applyEnumDropdown(sheet, key, values, opts = {}) {
  const col = sheet.getColumn(key);
  if (!col || !col.letter) return;
  sheet.dataValidations.add(`${col.letter}2:${col.letter}1000`, {
    type: 'list', allowBlank: opts.allowBlank !== false, formulae: [`"${values.join(',')}"`],
    showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Invalid value',
    error: `Pick one of: ${values.join(', ')}`,
  });
}

// ===================== Sample contract data =====================
const contract = {
  id: 'CONTRACT-SAMPLE-0001', hotelId: 'HOTEL-SAMPLE-0001',
  name: 'Mövenpick Petra 2026 — FIT & Groups',
  hotel: { name: 'Mövenpick Resort Petra', city: 'Wadi Musa' },
  currency: 'JOD', validFrom: '2026-01-01', validTo: '2026-12-31',
  rooms: [
    { name: 'Deluxe Room', code: 'DLX' },
    { name: 'Superior Room', code: 'SUP' },
    { name: 'Junior Suite', code: 'JSU' },
    { name: 'Suite', code: 'STE' },
  ],
};

// rates: [room, code, occ, meal, season, from, to, basis, cost]
const S = {
  low: ['Low 2026', '2026-01-08', '2026-02-28'],
  high: ['High 2026', '2026-03-01', '2026-05-31'],
  shoulder: ['Shoulder 2026', '2026-06-01', '2026-08-31'],
  autumn: ['Autumn 2026', '2026-09-01', '2026-11-15'],
  peak: ['Peak NY 2026/27', '2026-12-20', '2027-01-07'],
};
// Default tax profile: 16% sales tax + 10% service charge, NET (added on
// top of Cost). Pass `x` to override — e.g. the Peak rates below are
// quoted GROSS (tax already in the price) to show that contract style.
const R = (room, code, occ, meal, s, cost, x = {}) => ({
  room, code, occ, meal, season: s[0], from: s[1], to: s[2], basis: 'PER_ROOM', cost,
  salesTaxPercent: x.salesTaxPercent ?? 16,
  salesTaxIncluded: x.salesTaxIncluded ?? false,
  serviceChargePercent: x.serviceChargePercent ?? 10,
  serviceChargeIncluded: x.serviceChargeIncluded ?? false,
  tourismFeeAmount: x.tourismFeeAmount ?? '',
  tourismFeeCurrency: x.tourismFeeCurrency ?? '',
  tourismFeeMode: x.tourismFeeMode ?? '',
});
const GROSS = { salesTaxIncluded: true, serviceChargeIncluded: true };
const TFEE = { tourismFeeAmount: 2, tourismFeeCurrency: 'JOD', tourismFeeMode: 'PER_NIGHT_PER_PERSON' };
const rates = [
  R('Deluxe Room', 'DLX', 'SGL', 'BB', S.low, 75),
  R('Deluxe Room', 'DLX', 'DBL', 'BB', S.low, 95),
  R('Deluxe Room', 'DLX', 'TPL', 'BB', S.low, 130),
  R('Deluxe Room', 'DLX', 'SGL', 'BB', S.high, 110),
  R('Deluxe Room', 'DLX', 'DBL', 'BB', S.high, 135),
  R('Deluxe Room', 'DLX', 'TPL', 'BB', S.high, 185),
  R('Deluxe Room', 'DLX', 'DBL', 'HB', S.high, 171),
  R('Deluxe Room', 'DLX', 'DBL', 'BB', S.shoulder, 88),
  R('Deluxe Room', 'DLX', 'DBL', 'BB', S.autumn, 135),
  R('Deluxe Room', 'DLX', 'DBL', 'BB', S.peak, 210, { ...GROSS, ...TFEE }),
  R('Superior Room', 'SUP', 'SGL', 'BB', S.high, 135),
  R('Superior Room', 'SUP', 'DBL', 'BB', S.high, 160),
  R('Superior Room', 'SUP', 'TPL', 'BB', S.high, 215),
  R('Superior Room', 'SUP', 'DBL', 'BB', S.low, 115),
  R('Superior Room', 'SUP', 'DBL', 'BB', S.peak, 240, { ...GROSS, ...TFEE }),
  R('Junior Suite', 'JSU', 'DBL', 'BB', S.high, 220),
  R('Junior Suite', 'JSU', 'DBL', 'HB', S.high, 256),
  R('Suite', 'STE', 'DBL', 'BB', S.high, 320),
  R('Suite', 'STE', 'DBL', 'BB', S.peak, 480, { ...GROSS, ...TFEE }),
];

// supplements: [type, meal, basis, amount, mandatory, active, notes]
const supplements = [
  ['EXTRA_DINNER', 'HB', 'PER_PERSON', 18, false, true, 'Half board (dinner) upgrade from BB'],
  ['EXTRA_DINNER', 'FB', 'PER_PERSON', 36, false, true, 'Full board (lunch + dinner) upgrade from BB'],
  ['EXTRA_LUNCH', '', 'PER_PERSON', 15, false, true, 'À la carte set lunch (book 24h ahead)'],
  ['GALA_DINNER', '', 'PER_PERSON', 55, true, true, 'Compulsory New Year gala dinner — 31 Dec'],
  ['EXTRA_BED', '', 'PER_NIGHT', 28, false, true, 'Extra bed / rollaway (max 1 per room)'],
];

const cancellation = {
  id: 'CXL-0001', summary: 'Standard FIT cancellation policy', noShowType: 'FULL_STAY',
  noShowValue: '', notes: 'Group bookings (8+ rooms) follow separate group terms.',
  rules: [
    { id: 'CXL-R1', notes: 'Free cancellation', from: 99, to: 22, unit: 'DAYS', penType: 'PERCENT', penVal: 0, active: true },
    { id: 'CXL-R2', notes: 'Mid-window penalty', from: 21, to: 8, unit: 'DAYS', penType: 'PERCENT', penVal: 50, active: true },
    { id: 'CXL-R3', notes: 'Late cancellation', from: 7, to: 0, unit: 'DAYS', penType: 'PERCENT', penVal: 100, active: true },
  ],
};

const childPolicy = {
  id: 'CHILD-0001', infantMaxAge: 2, childMaxAge: 12,
  notes: 'Ages at check-in. Max 1 child per room sharing with 2 full-paying adults.',
  bands: [
    { id: 'B1', label: 'Infant (0–1) sharing', min: 0, max: 1, basis: 'FREE', value: '', active: true, notes: 'Free, cot on request' },
    { id: 'B2', label: 'Child (2–6) sharing', min: 2, max: 6, basis: 'FREE', value: '', active: true, notes: 'Free when sharing existing bedding' },
    { id: 'B3', label: 'Child (7–12) sharing', min: 7, max: 12, basis: 'PERCENT_OF_ADULT', value: 50, active: true, notes: '50% of adult rate' },
    { id: 'B4', label: 'Child (7–12) extra bed', min: 7, max: 12, basis: 'FIXED_AMOUNT', value: 28, active: true, notes: 'Charged as extra bed' },
  ],
};

const mealPlans = [
  { id: 'MP1', code: 'RO', isDefault: false, isActive: true, notes: 'Room only' },
  { id: 'MP2', code: 'BB', isDefault: true, isActive: true, notes: 'Bed & breakfast (base / default plan)' },
  { id: 'MP3', code: 'HB', isDefault: false, isActive: true, notes: 'Half board (breakfast + dinner)' },
  { id: 'MP4', code: 'FB', isDefault: false, isActive: true, notes: 'Full board (breakfast + lunch + dinner)' },
  { id: 'MP5', code: 'AI', isDefault: false, isActive: false, notes: 'All-inclusive — not offered at this property' },
];

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DMC Platform (sample)';

  // ---------- README ----------
  const readme = wb.addWorksheet('README', { views: [{ state: 'frozen', ySplit: 1 }] });
  readme.columns = [{ header: 'How to use this workbook', key: 'info', width: 110 }];
  styleHeaderRow(readme, README_FILL);
  [
    `Contract: ${contract.name}`,
    `Hotel: ${contract.hotel.name} (${contract.hotel.city})`,
    `Validity: ${contract.validFrom} → ${contract.validTo}`,
    `Currency: ${contract.currency}`,
    '',
    '— Editing rules —',
    '• Each sheet (Rates, Supplements, Cancellation, ChildPolicy, MealPlans) is a separate part of the contract.',
    '• Edit the green cells. Grey cells are read-only context.',
    '• Add a row by typing in the blank row below the data; delete a row to remove that entry on re-import.',
    '• An invisible ID column matches your rows to existing records — do not try to expose or edit it.',
    '',
    '— NEW: Meal Plan column on the Supplements sheet —',
    '• Tag a supplement HB / FB / AI when it is the add-on that upgrades a base BB rate to that meal plan.',
    '• The quote engine then applies it ONLY when the guest picks that meal plan (rows 2 & 3 below: HB 18, FB 36).',
    '• Leave blank for non-meal-plan supplements (Gala Dinner, Extra Bed).',
    '',
    '— Validation —',
    '• Currency: USD / JOD / AED / EUR / GBP   • Occupancy: SGL / DBL / TPL   • Meal plan: RO / BB / HB / FB / AI',
    '• Pricing basis: PER_ROOM / PER_PERSON   • Supplement charge basis: PER_PERSON / PER_ROOM / PER_STAY / PER_NIGHT',
    '• Supplement type: EXTRA_BREAKFAST / EXTRA_LUNCH / EXTRA_DINNER / GALA_DINNER / EXTRA_BED',
    '• Penalty type: PERCENT / NIGHTS / FULL_STAY / FIXED   • Deadline unit: DAYS / HOURS',
    '• Child charge basis: FREE / PERCENT_OF_ADULT / FIXED_AMOUNT   • Yes/No columns accept Yes / No.',
  ].forEach((l) => readme.addRow([l]));

  // ---------- Master ----------
  const master = wb.addWorksheet('Master', { views: [{ state: 'frozen', ySplit: 1 }] });
  master.columns = [{ header: 'Field', key: 'field', width: 24 }, { header: 'Value', key: 'value', width: 60 }];
  styleHeaderRow(master);
  [
    ['Hotel', `${contract.hotel.name} (${contract.hotel.city})`],
    ['Contract', contract.name],
    ['Validity', `${contract.validFrom} → ${contract.validTo}`],
    ['Currency', contract.currency],
    ['Status', 'VERIFIED'],
    ['Verified by', 'Ziad (Contracting)'],
    ['Last verified', '2026-05-20'],
    ['Verification notes', 'Rates confirmed against signed contract PDF; meal-plan supplements tagged HB/FB.'],
  ].forEach(([field, value]) => master.addRow({ field, value }));
  master.eachRow({ includeEmpty: false }, (row, n) => { if (n > 1) row.eachCell((c) => (c.fill = SYSTEM_FILL)); });

  // ---------- Rates ----------
  const rs = wb.addWorksheet('Rates', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  rs.columns = [
    { header: '_id', key: 'id', width: 38, hidden: true },
    { header: 'Room Category', key: 'roomCategory', width: 28 },
    { header: 'Room Code', key: 'roomCode', width: 12 },
    { header: 'Occupancy', key: 'occupancyType', width: 11 },
    { header: 'Meal Plan', key: 'mealPlan', width: 11 },
    { header: 'Season Name', key: 'seasonName', width: 22 },
    { header: 'Season From', key: 'seasonFrom', width: 14 },
    { header: 'Season To', key: 'seasonTo', width: 14 },
    { header: 'Pricing Basis', key: 'pricingBasis', width: 14 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Cost', key: 'cost', width: 12 },
    { header: 'Sales Tax %', key: 'salesTaxPercent', width: 12 },
    { header: 'Sales Tax Incl', key: 'salesTaxIncluded', width: 14 },
    { header: 'Service Charge %', key: 'serviceChargePercent', width: 16 },
    { header: 'Service Charge Incl', key: 'serviceChargeIncluded', width: 18 },
    { header: 'Tourism Fee', key: 'tourismFeeAmount', width: 12 },
    { header: 'Tourism Fee Ccy', key: 'tourismFeeCurrency', width: 15 },
    { header: 'Tourism Fee Mode', key: 'tourismFeeMode', width: 22 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];
  styleHeaderRow(rs);
  rates.forEach((r, i) => rs.addRow({
    id: `rate-${i + 1}`, roomCategory: r.room, roomCode: r.code, occupancyType: r.occ, mealPlan: r.meal,
    seasonName: r.season, seasonFrom: r.from, seasonTo: r.to, pricingBasis: r.basis,
    currency: contract.currency, cost: r.cost,
    salesTaxPercent: r.salesTaxPercent, salesTaxIncluded: r.salesTaxIncluded ? 'Yes' : 'No',
    serviceChargePercent: r.serviceChargePercent, serviceChargeIncluded: r.serviceChargeIncluded ? 'Yes' : 'No',
    tourismFeeAmount: r.tourismFeeAmount, tourismFeeCurrency: r.tourismFeeCurrency, tourismFeeMode: r.tourismFeeMode,
    notes: r.salesTaxIncluded ? 'Rate is GROSS (tax + service incl.)' : '',
  }));
  paintEditableColumns(rs, ['_id', 'Room Code']);
  applyEnumDropdown(rs, 'occupancyType', ['SGL', 'DBL', 'TPL']);
  applyEnumDropdown(rs, 'mealPlan', ['RO', 'BB', 'HB', 'FB', 'AI']);
  applyEnumDropdown(rs, 'pricingBasis', ['PER_ROOM', 'PER_PERSON']);
  applyEnumDropdown(rs, 'currency', CURRENCY_CODES);
  applyEnumDropdown(rs, 'salesTaxIncluded', ['Yes', 'No']);
  applyEnumDropdown(rs, 'serviceChargeIncluded', ['Yes', 'No']);
  applyEnumDropdown(rs, 'tourismFeeCurrency', CURRENCY_CODES, { allowBlank: true });
  applyEnumDropdown(rs, 'tourismFeeMode', ['PER_NIGHT_PER_PERSON', 'PER_NIGHT_PER_ROOM'], { allowBlank: true });

  // ---------- Supplements ----------
  const sup = wb.addWorksheet('Supplements', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  sup.columns = [
    { header: '_id', key: 'id', width: 38, hidden: true },
    { header: 'Room Category (blank = all rooms)', key: 'roomCategory', width: 32 },
    { header: 'Type', key: 'type', width: 18 },
    { header: 'Meal Plan', key: 'mealPlanCode', width: 12 },
    { header: 'Charge Basis', key: 'chargeBasis', width: 14 },
    { header: 'Amount', key: 'amount', width: 12 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Mandatory', key: 'isMandatory', width: 11 },
    { header: 'Active', key: 'isActive', width: 9 },
    { header: 'Notes', key: 'notes', width: 40 },
  ];
  styleHeaderRow(sup);
  supplements.forEach(([type, meal, basis, amount, mand, active, notes], i) => sup.addRow({
    id: `sup-${i + 1}`, roomCategory: '', type, mealPlanCode: meal, chargeBasis: basis,
    amount, currency: contract.currency, isMandatory: mand ? 'Yes' : 'No', isActive: active ? 'Yes' : 'No', notes,
  }));
  paintEditableColumns(sup, ['_id']);
  applyEnumDropdown(sup, 'type', ['EXTRA_BREAKFAST', 'EXTRA_LUNCH', 'EXTRA_DINNER', 'GALA_DINNER', 'EXTRA_BED']);
  applyEnumDropdown(sup, 'mealPlanCode', ['RO', 'BB', 'HB', 'FB', 'AI'], { allowBlank: true });
  applyEnumDropdown(sup, 'chargeBasis', ['PER_PERSON', 'PER_ROOM', 'PER_STAY', 'PER_NIGHT']);
  applyEnumDropdown(sup, 'currency', CURRENCY_CODES);
  applyEnumDropdown(sup, 'isMandatory', ['Yes', 'No']);
  applyEnumDropdown(sup, 'isActive', ['Yes', 'No']);

  // ---------- Cancellation ----------
  const cx = wb.addWorksheet('Cancellation', { views: [{ state: 'frozen', ySplit: 1 }] });
  cx.columns = [
    { header: '_id', key: 'id', width: 38, hidden: true },
    { header: 'Row Type', key: 'rowType', width: 12 },
    { header: 'Summary / Rule Notes', key: 'summary', width: 40 },
    { header: 'No-show Penalty Type', key: 'noShowPenaltyType', width: 20 },
    { header: 'No-show Penalty Value', key: 'noShowPenaltyValue', width: 20 },
    { header: 'Window From', key: 'windowFromValue', width: 12 },
    { header: 'Window To', key: 'windowToValue', width: 12 },
    { header: 'Deadline Unit', key: 'deadlineUnit', width: 14 },
    { header: 'Penalty Type', key: 'penaltyType', width: 14 },
    { header: 'Penalty Value', key: 'penaltyValue', width: 14 },
    { header: 'Active', key: 'isActive', width: 9 },
    { header: 'Policy Notes', key: 'policyNotes', width: 30 },
  ];
  styleHeaderRow(cx);
  cx.addRow({
    id: cancellation.id, rowType: 'POLICY', summary: cancellation.summary,
    noShowPenaltyType: cancellation.noShowType, noShowPenaltyValue: cancellation.noShowValue,
    windowFromValue: '', windowToValue: '', deadlineUnit: '', penaltyType: '', penaltyValue: '',
    isActive: '', policyNotes: cancellation.notes,
  });
  cancellation.rules.forEach((r) => cx.addRow({
    id: r.id, rowType: 'RULE', summary: r.notes, noShowPenaltyType: '', noShowPenaltyValue: '',
    windowFromValue: r.from, windowToValue: r.to, deadlineUnit: r.unit, penaltyType: r.penType,
    penaltyValue: r.penVal, isActive: r.active ? 'Yes' : 'No', policyNotes: '',
  }));
  paintEditableColumns(cx, ['_id', 'Row Type']);
  applyEnumDropdown(cx, 'rowType', ['POLICY', 'RULE']);
  applyEnumDropdown(cx, 'noShowPenaltyType', ['PERCENT', 'NIGHTS', 'FULL_STAY', 'FIXED'], { allowBlank: true });
  applyEnumDropdown(cx, 'deadlineUnit', ['DAYS', 'HOURS'], { allowBlank: true });
  applyEnumDropdown(cx, 'penaltyType', ['PERCENT', 'NIGHTS', 'FULL_STAY', 'FIXED'], { allowBlank: true });
  applyEnumDropdown(cx, 'isActive', ['Yes', 'No'], { allowBlank: true });

  // ---------- ChildPolicy ----------
  const cp = wb.addWorksheet('ChildPolicy', { views: [{ state: 'frozen', ySplit: 1 }] });
  cp.columns = [
    { header: '_id', key: 'id', width: 38, hidden: true },
    { header: 'Row Type', key: 'rowType', width: 12 },
    { header: 'Infant Max Age', key: 'infantMaxAge', width: 14 },
    { header: 'Child Max Age', key: 'childMaxAge', width: 14 },
    { header: 'Band Label', key: 'label', width: 24 },
    { header: 'Band Min Age', key: 'minAge', width: 12 },
    { header: 'Band Max Age', key: 'maxAge', width: 12 },
    { header: 'Charge Basis', key: 'chargeBasis', width: 18 },
    { header: 'Charge Value', key: 'chargeValue', width: 14 },
    { header: 'Active', key: 'isActive', width: 9 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];
  styleHeaderRow(cp);
  cp.addRow({
    id: childPolicy.id, rowType: 'POLICY', infantMaxAge: childPolicy.infantMaxAge, childMaxAge: childPolicy.childMaxAge,
    label: '', minAge: '', maxAge: '', chargeBasis: '', chargeValue: '', isActive: '', notes: childPolicy.notes,
  });
  childPolicy.bands.forEach((b) => cp.addRow({
    id: b.id, rowType: 'BAND', infantMaxAge: '', childMaxAge: '', label: b.label, minAge: b.min, maxAge: b.max,
    chargeBasis: b.basis, chargeValue: b.value, isActive: b.active ? 'Yes' : 'No', notes: b.notes,
  }));
  paintEditableColumns(cp, ['_id', 'Row Type']);
  applyEnumDropdown(cp, 'rowType', ['POLICY', 'BAND']);
  applyEnumDropdown(cp, 'chargeBasis', ['FREE', 'PERCENT_OF_ADULT', 'FIXED_AMOUNT'], { allowBlank: true });
  applyEnumDropdown(cp, 'isActive', ['Yes', 'No'], { allowBlank: true });

  // ---------- MealPlans ----------
  const mp = wb.addWorksheet('MealPlans', { views: [{ state: 'frozen', ySplit: 1 }] });
  mp.columns = [
    { header: '_id', key: 'id', width: 38, hidden: true },
    { header: 'Code', key: 'code', width: 8 },
    { header: 'Default', key: 'isDefault', width: 9 },
    { header: 'Active', key: 'isActive', width: 9 },
    { header: 'Notes', key: 'notes', width: 36 },
  ];
  styleHeaderRow(mp);
  mealPlans.forEach((m) => mp.addRow({
    id: m.id, code: m.code, isDefault: m.isDefault ? 'Yes' : 'No', isActive: m.isActive ? 'Yes' : 'No', notes: m.notes,
  }));
  paintEditableColumns(mp, ['_id', 'Default']);
  applyEnumDropdown(mp, 'code', ['RO', 'BB', 'HB', 'FB', 'AI']);
  applyEnumDropdown(mp, 'isDefault', ['Yes', 'No']);
  applyEnumDropdown(mp, 'isActive', ['Yes', 'No']);

  // ---------- _Reference (hidden) ----------
  const ref = wb.addWorksheet('_Reference');
  ref.columns = [
    { header: 'Metadata Field', key: 'metaField', width: 22 },
    { header: 'Metadata Value', key: 'metaValue', width: 42 },
    { header: '', key: 'spacer', width: 2 },
    { header: 'Room Category', key: 'roomCategory', width: 36 },
  ];
  ref.getRow(1).font = { bold: true };
  const meta = [
    ['Schema Version', String(SCHEMA_VERSION)], ['Contract ID', contract.id], ['Hotel ID', contract.hotelId],
    ['Hotel Name', contract.hotel.name], ['Contract Name', contract.name], ['Currency', contract.currency],
    ['Exported At (UTC)', new Date().toISOString()],
  ];
  const roomNames = contract.rooms.map((r) => r.name);
  const maxRows = Math.max(meta.length, roomNames.length);
  for (let i = 0; i < maxRows; i++) {
    const [field, value] = meta[i] ?? ['', ''];
    ref.addRow({ metaField: field, metaValue: value, spacer: '', roomCategory: roomNames[i] ?? '' });
  }
  ref.state = 'veryHidden';

  const out = path.join(process.cwd(), 'sample-full-contract-petra-with-taxes.xlsx');
  await wb.xlsx.writeFile(out);
  console.log('Wrote', out);
  console.log('Sheets:', wb.worksheets.map((w) => w.name).join(', '));
  console.log('Rates rows:', rates.length, '| Supplements:', supplements.length,
    '| Cxl rules:', cancellation.rules.length, '| Child bands:', childPolicy.bands.length, '| Meal plans:', mealPlans.length);
}

main().catch((e) => { console.error(e); process.exit(1); });
