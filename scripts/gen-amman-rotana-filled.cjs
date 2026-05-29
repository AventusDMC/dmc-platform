// One-off: build a FILLED contract Excel (export/import schema) from the real
// Amman Rotana 2026 contract PDF, showcasing every new field. Not wired into
// the app — safe to delete. Output: Amman-Rotana-2026-filled-v2.xlsx.
const ExcelJS = require('exceljs');
const path = require('path');

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
const SYSTEM_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
const EDITABLE_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F8E8' } };
const README_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBEB' } };
const CURRENCY_CODES = ['USD', 'JOD', 'AED', 'EUR', 'GBP'];

const styleHeader = (s, fill = HEADER_FILL) => s.getRow(1).eachCell((c) => { c.font = { bold: true }; c.fill = fill; });
function paintEditable(sheet, systemHeaders) {
  const sys = new Set(systemHeaders);
  sheet.columns.forEach((col, i) => {
    const isSys = sys.has(String(sheet.getRow(1).getCell(i + 1).value || ''));
    col.eachCell({ includeEmpty: false }, (c, n) => { if (n > 1) c.fill = isSys ? SYSTEM_FILL : EDITABLE_FILL; });
  });
}
function dropdown(sheet, key, values, allowBlank = false) {
  const col = sheet.getColumn(key);
  if (!col || !col.letter) return;
  sheet.dataValidations.add(`${col.letter}2:${col.letter}1000`, {
    type: 'list', allowBlank, formulae: [`"${values.join(',')}"`],
    showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Invalid value', error: `Pick one of: ${values.join(', ')}`,
  });
}

// ---------------- Real contract data ----------------
const CONTRACT_ID = '26f5ea6b-ec13-42b8-b106-1ebd881ca1dd';
const HOTEL_ID = 'f79e5c86-ad7d-4cc4-8d8c-80c9b311aee8';
const CCY = 'JOD'; // real contract is in JOD (system shows USD — change contract currency first to import)
const SALES_TAX = 8; // 8% government tax, NOT included (net)
const SERVICE = 7; // 7% service charge, NOT included (net)

// Seasons → their date ranges (reconstructed from the PDF grid — VERIFY).
const SEASONS = {
  'Season A Low': [['2026-01-01', '2026-01-31'], ['2026-06-01', '2026-06-30'], ['2026-10-01', '2026-12-30'], ['2026-12-31', '2027-01-02']],
  'Season Mid B': [['2026-02-01', '2026-02-17'], ['2026-04-01', '2026-05-24'], ['2026-09-01', '2026-09-30']],
  'Season C High': [['2026-03-19', '2026-03-21'], ['2026-05-25', '2026-05-31'], ['2026-07-01', '2026-08-31']],
  'Ramadan': [['2026-02-18', '2026-03-18']],
};
const SEASON_ORDER = ['Season A Low', 'Season Mid B', 'Season C High', 'Ramadan'];

// Prices: [A_SGL,A_DBL, B_SGL,B_DBL, C_SGL,C_DBL, Ram_SGL,Ram_DBL]. Room names
// are the EXACT system room-category names (so import resolves them).
const ROOMS = [
  { name: 'Guest Room City View - King & Twin 10-24 Floor', ro: [100,100,105,105,120,120,85,85], bb: [100,110,105,115,120,130,90,100] },
  { name: 'Large Corner Room King Bed 10-24 Floor', ro: [110,110,115,115,130,130,95,95], bb: [110,120,115,125,130,140,100,110] },
  { name: 'High Floor Room - King & Twin 25-32 Floor', ro: [120,120,125,125,140,140,105,105], bb: [120,130,125,135,140,150,110,120] },
  { name: 'Large Corner High Floor Room King Bed 25-32 Floor', ro: [130,130,135,135,150,150,115,115], bb: [130,140,135,145,150,160,120,130] },
  { name: 'King/Twin Bed with Club Lounge 32-40 Floor', ro: null, bb: [145,155,150,160,165,175,135,145] },
  { name: 'Large Corner Club Lounge Access King Bed 32-40 Floor', ro: null, bb: [165,175,170,180,185,195,155,165] },
  { name: 'Spacious Room King Bed 35-40 Floor', ro: [170,170,175,175,200,200,165,165], bb: [180,190,185,195,200,210,170,180] },
  { name: 'One Bedroom Suite 10-14 Floor', ro: [180,180,185,185,220,220,175,175], bb: [190,200,195,205,220,230,180,190] },
  { name: 'One Bedroom Suite with Lounge Access 31-43 Floor', ro: null, bb: [240,250,245,255,270,280,230,240] },
  { name: 'Crown Suite Boulevard View 35-39 Floor', ro: null, bb: [900,900,950,950,975,975,800,800] },
  { name: 'Royal Suite Boulevard View 40-41 Floors', ro: null, bb: [2100,2100,2150,2150,2200,2200,2000,2000] },
];

// Build rate rows: room × meal(RO/BB) × season(each date range) × occ(SGL/DBL).
function buildRateRows() {
  const rows = [];
  for (const room of ROOMS) {
    const meals = [['RO', room.ro], ['BB', room.bb]].filter(([, arr]) => arr);
    for (const [meal, prices] of meals) {
      SEASON_ORDER.forEach((season, sIdx) => {
        const sgl = prices[sIdx * 2];
        const dbl = prices[sIdx * 2 + 1];
        for (const [occ, cost] of [['SGL', sgl], ['DBL', dbl]]) {
          for (const [from, to] of SEASONS[season]) {
            rows.push({ room: room.name, occ, meal, season, from, to, cost });
          }
        }
      });
    }
  }
  return rows;
}

// Supplements (real). HB/FB use the mealPlanCode tag; events use date windows.
const SUPPLEMENTS = [
  { type: 'EXTRA_DINNER', meal: 'HB', basis: 'PER_PERSON', amount: 18, mand: 'No', from: '', to: '', notes: 'Half-board supplement, added on top of BB. Subject to govt tax & service charge.' },
  { type: 'EXTRA_DINNER', meal: 'FB', basis: 'PER_PERSON', amount: 36, mand: 'No', from: '', to: '', notes: 'Full-board supplement, added on top of BB. Subject to govt tax & service charge.' },
  { type: 'GALA_DINNER', meal: '', basis: 'PER_ROOM', amount: 20, mand: 'Yes', from: '2026-12-31', to: '2027-01-01', notes: 'NYE event supplement (per room/night).' },
  { type: 'GALA_DINNER', meal: '', basis: 'PER_ROOM', amount: 20, mand: 'Yes', from: '2026-03-19', to: '2026-03-21', notes: 'Exhibition/event supplement (per room/night).' },
  { type: 'GALA_DINNER', meal: '', basis: 'PER_ROOM', amount: 20, mand: 'Yes', from: '2026-05-25', to: '2026-05-25', notes: 'Eid Al Adha event supplement (per room/night).' },
  { type: 'GALA_DINNER', meal: '', basis: 'PER_ROOM', amount: 20, mand: 'Yes', from: '2026-05-30', to: '2026-05-30', notes: '30 May event supplement (per room/night).' },
  { type: 'EXTRA_BED', meal: '', basis: 'PER_NIGHT', amount: 30, mand: 'No', from: '', to: '', notes: '3rd person / extra bed (BB) in King rooms & suites. Room-only extra bed = 40 JOD.' },
];

const MEAL_PLANS = [
  { code: 'RO', def: 'No', active: 'Yes', notes: 'Room only' },
  { code: 'BB', def: 'Yes', active: 'Yes', notes: 'Bed & breakfast (base/default)' },
  { code: 'HB', def: 'No', active: 'Yes', notes: 'Half board via meal supplement (+18 JOD pp)' },
  { code: 'FB', def: 'No', active: 'Yes', notes: 'Full board via meal supplement (+36 JOD pp)' },
];

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DMC Platform (filled from contract PDF)';

  // README
  const rd = wb.addWorksheet('README', { views: [{ state: 'frozen', ySplit: 1 }] });
  rd.columns = [{ header: 'How to use this workbook', key: 'info', width: 120 }];
  styleHeader(rd, README_FILL);
  [
    'Contract: Amman Rotana Hotel 2026 — Axis Destination Management (filled from the signed PDF)',
    'Currency: JOD. Rates are NET — they exclude 8% government tax + 7% service charge (added on top at quote time).',
    '',
    '— New fields demonstrated —',
    '• Rates: Sales Tax 8% / Service Charge 7%, both "Incl = No" (net). The quote engine adds them on top.',
    '• Supplements: HB (+18) and FB (+36) carry a Meal Plan tag; event supplements (NYE / exhibition / Eid)',
    '  carry an Applies From/To date window so they bill only on those nights.',
    '',
    '— Before importing into the system, please note —',
    '1. The system contract currency is currently USD; set it to JOD (Contracts > Edit details) first, or the',
    '   JOD rate rows will be rejected on import (rate currency must match the contract currency).',
    '2. Season date ranges were reconstructed from the PDF rate grid — VERIFY them against the contract.',
    '3. The event supplements are all type GALA_DINNER on all rooms. The import conflict-check is meal-plan-aware',
    '   but not yet date-aware, so importing several dated GALA_DINNER rows together will be blocked as',
    '   "conflicting". Import them one at a time, or treat this as a known follow-up (make the conflict check',
    '   date-window-aware, same idea as the meal-plan-aware fix).',
  ].forEach((l) => rd.addRow([l]));

  // Master
  const ms = wb.addWorksheet('Master', { views: [{ state: 'frozen', ySplit: 1 }] });
  ms.columns = [{ header: 'Field', key: 'f', width: 24 }, { header: 'Value', key: 'v', width: 70 }];
  styleHeader(ms);
  [
    ['Hotel', 'Amman Rotana Hotel (Amman)'],
    ['Contract', '2026 contract — Axis Destination Management'],
    ['Validity', '2026-01-01 → 2027-01-02'],
    ['Currency', 'JOD'],
    ['Tax/Service', '8% government tax + 7% service charge, added on top (net rates)'],
    ['Markets', 'All international markets excl. Jordanian nationals; FIT only (not groups 10+ rooms)'],
  ].forEach(([f, v]) => ms.addRow({ f, v }));
  ms.eachRow({ includeEmpty: false }, (r, n) => { if (n > 1) r.eachCell((c) => (c.fill = SYSTEM_FILL)); });

  // Rates
  const rs = wb.addWorksheet('Rates', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  rs.columns = [
    { header: '_id', key: 'id', width: 38, hidden: true },
    { header: 'Room Category', key: 'roomCategory', width: 46 },
    { header: 'Room Code', key: 'roomCode', width: 12 },
    { header: 'Occupancy', key: 'occupancyType', width: 11 },
    { header: 'Meal Plan', key: 'mealPlan', width: 11 },
    { header: 'Season Name', key: 'seasonName', width: 16 },
    { header: 'Season From', key: 'seasonFrom', width: 14 },
    { header: 'Season To', key: 'seasonTo', width: 14 },
    { header: 'Pricing Basis', key: 'pricingBasis', width: 14 },
    { header: 'Currency', key: 'currency', width: 10 },
    { header: 'Cost', key: 'cost', width: 10 },
    { header: 'Sales Tax %', key: 'salesTaxPercent', width: 12 },
    { header: 'Sales Tax Incl', key: 'salesTaxIncluded', width: 14 },
    { header: 'Service Charge %', key: 'serviceChargePercent', width: 16 },
    { header: 'Service Charge Incl', key: 'serviceChargeIncluded', width: 18 },
    { header: 'Tourism Fee', key: 'tourismFeeAmount', width: 12 },
    { header: 'Tourism Fee Ccy', key: 'tourismFeeCurrency', width: 15 },
    { header: 'Tourism Fee Mode', key: 'tourismFeeMode', width: 22 },
    { header: 'Notes', key: 'notes', width: 24 },
  ];
  styleHeader(rs);
  const rateRows = buildRateRows();
  for (const r of rateRows) {
    rs.addRow({
      id: '', roomCategory: r.room, roomCode: '', occupancyType: r.occ, mealPlan: r.meal,
      seasonName: r.season, seasonFrom: r.from, seasonTo: r.to, pricingBasis: 'PER_ROOM',
      currency: CCY, cost: r.cost, salesTaxPercent: SALES_TAX, salesTaxIncluded: 'No',
      serviceChargePercent: SERVICE, serviceChargeIncluded: 'No', tourismFeeAmount: '',
      tourismFeeCurrency: '', tourismFeeMode: '', notes: '',
    });
  }
  paintEditable(rs, ['_id', 'Room Code']);
  dropdown(rs, 'occupancyType', ['SGL', 'DBL', 'TPL']);
  dropdown(rs, 'mealPlan', ['RO', 'BB', 'HB', 'FB', 'AI']);
  dropdown(rs, 'pricingBasis', ['PER_ROOM', 'PER_PERSON']);
  dropdown(rs, 'currency', CURRENCY_CODES);
  dropdown(rs, 'salesTaxIncluded', ['Yes', 'No']);
  dropdown(rs, 'serviceChargeIncluded', ['Yes', 'No']);
  dropdown(rs, 'tourismFeeCurrency', CURRENCY_CODES, true);
  dropdown(rs, 'tourismFeeMode', ['PER_NIGHT_PER_PERSON', 'PER_NIGHT_PER_ROOM'], true);

  // Supplements
  const sp = wb.addWorksheet('Supplements', { views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }] });
  sp.columns = [
    { header: '_id', key: 'id', width: 38, hidden: true },
    { header: 'Room Category (blank = all rooms)', key: 'roomCategory', width: 32 },
    { header: 'Type', key: 'type', width: 16 },
    { header: 'Meal Plan', key: 'mealPlanCode', width: 11 },
    { header: 'Charge Basis', key: 'chargeBasis', width: 13 },
    { header: 'Amount', key: 'amount', width: 9 },
    { header: 'Currency', key: 'currency', width: 9 },
    { header: 'Applies From', key: 'appliesFrom', width: 13 },
    { header: 'Applies To', key: 'appliesTo', width: 13 },
    { header: 'Mandatory', key: 'isMandatory', width: 10 },
    { header: 'Active', key: 'isActive', width: 8 },
    { header: 'Notes', key: 'notes', width: 52 },
  ];
  styleHeader(sp);
  for (const s of SUPPLEMENTS) {
    sp.addRow({
      id: '', roomCategory: '', type: s.type, mealPlanCode: s.meal, chargeBasis: s.basis,
      amount: s.amount, currency: CCY, appliesFrom: s.from, appliesTo: s.to,
      isMandatory: s.mand, isActive: 'Yes', notes: s.notes,
    });
  }
  paintEditable(sp, ['_id']);
  dropdown(sp, 'type', ['EXTRA_BREAKFAST', 'EXTRA_LUNCH', 'EXTRA_DINNER', 'GALA_DINNER', 'EXTRA_BED']);
  dropdown(sp, 'mealPlanCode', ['RO', 'BB', 'HB', 'FB', 'AI'], true);
  dropdown(sp, 'chargeBasis', ['PER_PERSON', 'PER_ROOM', 'PER_STAY', 'PER_NIGHT']);
  dropdown(sp, 'currency', CURRENCY_CODES);
  dropdown(sp, 'isMandatory', ['Yes', 'No']);
  dropdown(sp, 'isActive', ['Yes', 'No']);

  // Cancellation
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
    { header: 'Policy Notes', key: 'policyNotes', width: 36 },
  ];
  styleHeader(cx);
  cx.addRow({ id: '', rowType: 'POLICY', summary: 'FIT cancellation — varies by season; no-show = full stay', noShowPenaltyType: 'FULL_STAY', noShowPenaltyValue: '', isActive: '', policyNotes: 'No-show / early departure = 100% of total stay (same meal plan booked).' });
  cx.addRow({ id: '', rowType: 'RULE', summary: 'High season — within 72h of arrival', windowFromValue: 72, windowToValue: 0, deadlineUnit: 'HOURS', penaltyType: 'PERCENT', penaltyValue: 50, isActive: 'Yes', policyNotes: '' });
  cx.addRow({ id: '', rowType: 'RULE', summary: 'Low season — within 24h of arrival', windowFromValue: 24, windowToValue: 0, deadlineUnit: 'HOURS', penaltyType: 'NIGHTS', penaltyValue: 1, isActive: 'Yes', policyNotes: '' });
  paintEditable(cx, ['_id', 'Row Type']);
  dropdown(cx, 'rowType', ['POLICY', 'RULE']);
  dropdown(cx, 'noShowPenaltyType', ['PERCENT', 'NIGHTS', 'FULL_STAY', 'FIXED'], true);
  dropdown(cx, 'deadlineUnit', ['DAYS', 'HOURS'], true);
  dropdown(cx, 'penaltyType', ['PERCENT', 'NIGHTS', 'FULL_STAY', 'FIXED'], true);
  dropdown(cx, 'isActive', ['Yes', 'No'], true);

  // ChildPolicy
  const cp = wb.addWorksheet('ChildPolicy', { views: [{ state: 'frozen', ySplit: 1 }] });
  cp.columns = [
    { header: '_id', key: 'id', width: 38, hidden: true },
    { header: 'Row Type', key: 'rowType', width: 12 },
    { header: 'Infant Max Age', key: 'infantMaxAge', width: 14 },
    { header: 'Child Max Age', key: 'childMaxAge', width: 14 },
    { header: 'Band Label', key: 'label', width: 26 },
    { header: 'Band Min Age', key: 'minAge', width: 12 },
    { header: 'Band Max Age', key: 'maxAge', width: 12 },
    { header: 'Charge Basis', key: 'chargeBasis', width: 18 },
    { header: 'Charge Value', key: 'chargeValue', width: 14 },
    { header: 'Active', key: 'isActive', width: 9 },
    { header: 'Notes', key: 'notes', width: 40 },
  ];
  styleHeader(cp);
  cp.addRow({ id: '', rowType: 'POLICY', infantMaxAge: 2, childMaxAge: 12, isActive: '', notes: 'Infant 0–1.99; child 2–11.99. Up to 2 children free on adults’ meal plan w/ 1 extra bed.' });
  cp.addRow({ id: '', rowType: 'BAND', label: 'Infant (0–1)', minAge: 0, maxAge: 1, chargeBasis: 'FREE', chargeValue: '', isActive: 'Yes', notes: 'Free, shares parents’ room & meal plan' });
  cp.addRow({ id: '', rowType: 'BAND', label: 'Child (2–11) sharing', minAge: 2, maxAge: 11, chargeBasis: 'FREE', chargeValue: '', isActive: 'Yes', notes: 'Up to 2 free on existing bedding; à-la-carte meals 50% of adult' });
  paintEditable(cp, ['_id', 'Row Type']);
  dropdown(cp, 'rowType', ['POLICY', 'BAND']);
  dropdown(cp, 'chargeBasis', ['FREE', 'PERCENT_OF_ADULT', 'FIXED_AMOUNT'], true);
  dropdown(cp, 'isActive', ['Yes', 'No'], true);

  // MealPlans
  const mp = wb.addWorksheet('MealPlans', { views: [{ state: 'frozen', ySplit: 1 }] });
  mp.columns = [
    { header: '_id', key: 'id', width: 38, hidden: true },
    { header: 'Code', key: 'code', width: 8 },
    { header: 'Default', key: 'isDefault', width: 9 },
    { header: 'Active', key: 'isActive', width: 9 },
    { header: 'Notes', key: 'notes', width: 44 },
  ];
  styleHeader(mp);
  for (const m of MEAL_PLANS) mp.addRow({ id: '', code: m.code, isDefault: m.def, isActive: m.active, notes: m.notes });
  paintEditable(mp, ['_id', 'Default']);
  dropdown(mp, 'code', ['RO', 'BB', 'HB', 'FB', 'AI']);
  dropdown(mp, 'isDefault', ['Yes', 'No']);
  dropdown(mp, 'isActive', ['Yes', 'No']);

  // _Reference (real IDs so the file is import-matched to this contract)
  const ref = wb.addWorksheet('_Reference');
  ref.columns = [
    { header: 'Metadata Field', key: 'mf', width: 22 },
    { header: 'Metadata Value', key: 'mv', width: 44 },
    { header: '', key: 'sp', width: 2 },
    { header: 'Room Category', key: 'rc', width: 46 },
  ];
  ref.getRow(1).font = { bold: true };
  const meta = [
    ['Schema Version', '1'], ['Contract ID', CONTRACT_ID], ['Hotel ID', HOTEL_ID],
    ['Hotel Name', 'Amman Rotana Hotel'], ['Contract Name', '2026 contract'], ['Currency', CCY],
    ['Exported At (UTC)', new Date().toISOString()],
  ];
  const roomNames = ROOMS.map((r) => r.name);
  for (let i = 0; i < Math.max(meta.length, roomNames.length); i++) {
    const [f, v] = meta[i] ?? ['', ''];
    ref.addRow({ mf: f, mv: v, sp: '', rc: roomNames[i] ?? '' });
  }
  ref.state = 'veryHidden';

  const out = path.join('C:/Users/pc/Downloads', 'Amman-Rotana-2026-filled-v2.xlsx');
  await wb.xlsx.writeFile(out);
  console.log('Wrote', out);
  console.log('Rate rows:', rateRows.length, '| Supplements:', SUPPLEMENTS.length, '| Meal plans:', MEAL_PLANS.length);
}

main().catch((e) => { console.error(e); process.exit(1); });
