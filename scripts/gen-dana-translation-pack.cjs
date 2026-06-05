/* One-off generator: Phase 4B.0 Dana POI translation review pack → .xlsx
 * Review-only deliverable. Does NOT touch the DB. Run: node scripts/gen-dana-translation-pack.cjs
 */
const ExcelJS = require('exceljs');
const path = require('path');

const OUT = path.resolve(
  __dirname,
  '..',
  '.claude',
  'worktrees',
  'dana-seed-4b1',
  'docs',
  'poi-translation-pack-4b0-dana-2026-06-06.xlsx',
);

const rows = [
  {
    field: 'Title',
    en: 'Dana Biosphere Reserve',
    pt: 'Reserva da Biosfera de Dana',
    es: 'Reserva de la Biosfera de Dana',
    ar: 'محمية ضانا للمحيط الحيوي',
  },
  {
    field: 'Short description',
    en: "Jordan's largest nature reserve, spanning four bio-geographic zones.",
    pt: 'A maior reserva natural da Jordânia, abrangendo quatro zonas biogeográficas.',
    es: 'La mayor reserva natural de Jordania, que abarca cuatro zonas biogeográficas.',
    ar: 'أكبر محمية طبيعية في الأردن، تمتد عبر أربع مناطق جغرافية حيوية.',
  },
  {
    field: 'Long description',
    en:
      "Dana Biosphere Reserve is Jordan's largest nature reserve — a dramatic landscape of sandstone cliffs, deep wadis, and ancient villages that descends from the highlands near Tafileh toward the Rift Valley. Spanning four bio-geographic zones, it shelters a remarkable diversity of plants, birds, and wildlife, and offers some of the country's finest scenic walking and eco-tourism experiences.",
    pt:
      'A Reserva da Biosfera de Dana é a maior reserva natural da Jordânia — uma paisagem deslumbrante de falésias de arenito, wadis profundos e aldeias antigas que desce das terras altas próximas de Tafileh em direção ao Vale do Rift. Abrangendo quatro zonas biogeográficas, abriga uma notável diversidade de plantas, aves e vida selvagem, e oferece algumas das melhores caminhadas paisagísticas e experiências de ecoturismo do país.',
    es:
      'La Reserva de la Biosfera de Dana es la mayor reserva natural de Jordania — un paisaje impresionante de acantilados de arenisca, profundos uadis y antiguas aldeas que desciende desde las tierras altas cercanas a Tafileh hacia el valle del Rift. Abarca cuatro zonas biogeográficas y alberga una notable diversidad de plantas, aves y fauna, además de ofrecer algunas de las mejores caminatas paisajísticas y experiencias de ecoturismo del país.',
    ar:
      'محمية ضانا للمحيط الحيوي هي أكبر محمية طبيعية في الأردن — منطقة آسرة من المنحدرات الرملية والأودية العميقة والقرى القديمة، تنحدر من المرتفعات قرب الطفيلة نحو وادي الأردن المتصدّع. تمتد المحمية عبر أربع مناطق جغرافية حيوية، وتضمّ تنوّعاً لافتاً من النباتات والطيور والحياة البرية، وتوفّر بعضاً من أجمل مسارات المشي الطبيعية وتجارب السياحة البيئية في البلاد.',
  },
];

async function main() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DMC Platform — Phase 4B.0';
  wb.created = new Date('2026-06-06T00:00:00.000Z');

  // ---- Sheet 1: translations ----
  const ws = wb.addWorksheet('Dana POI Translations', { views: [{ state: 'frozen', ySplit: 3 }] });
  ws.columns = [
    { key: 'field', width: 18 },
    { key: 'en', width: 52 },
    { key: 'pt', width: 52 },
    { key: 'es', width: 52 },
    { key: 'ar', width: 52 },
    { key: 'status', width: 16 },
    { key: 'notes', width: 34 },
  ];

  // Banner
  ws.mergeCells('A1:G1');
  const banner = ws.getCell('A1');
  banner.value =
    'REVIEW ONLY — Phase 4B.0 · Dana Biosphere Reserve · DRAFT translations · NOT applied to the database · no machine translation into production';
  banner.font = { bold: true, color: { argb: 'FF7A1F1F' }, size: 11 };
  banner.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBE3E3' } };
  banner.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  ws.getRow(1).height = 30;

  // Sub note
  ws.mergeCells('A2:G2');
  const sub = ws.getCell('A2');
  sub.value =
    'APPROVED. The richer EN long below was approved and the seed updates the English long to match (EN title + short unchanged); PT/ES/AR are translations of it. All four locales share this long narrative.';
  sub.font = { italic: true, color: { argb: 'FF555555' }, size: 10 };
  sub.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  ws.getRow(2).height = 26;

  // Header row (row 3)
  const header = ['Field', 'EN (source)', 'PT (draft)', 'ES (draft)', 'AR (draft) — RTL', 'Reviewer status', 'Reviewer notes'];
  const hr = ws.getRow(3);
  header.forEach((h, i) => {
    const c = hr.getCell(i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = { bottom: { style: 'thin', color: { argb: 'FFBBBBBB' } } };
  });
  hr.height = 22;

  // Data rows
  rows.forEach((r) => {
    const row = ws.addRow({ field: r.field, en: r.en, pt: r.pt, es: r.es, ar: r.ar, status: '', notes: '' });
    row.eachCell((cell, col) => {
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFDDDDDD' } } };
      if (col === 1) cell.font = { bold: true };
      if (col === 5) cell.alignment = { vertical: 'top', wrapText: true, horizontal: 'right', readingOrder: 'rtl' };
    });
    row.height = r.field === 'Long description' ? 120 : r.field === 'Short description' ? 44 : 22;
  });

  // ---- Sheet 2: instructions / checklist ----
  const ws2 = wb.addWorksheet('Review & Application');
  ws2.columns = [{ key: 'a', width: 4 }, { key: 'b', width: 110 }];
  const lines = [
    ['', 'PHASE 4B.0 — DANA BIOSPHERE RESERVE TRANSLATION PACK'],
    ['', 'Status: Content APPROVED 2026-06-06 (richer long; EN long updated to match). PR #353 open; prod apply held until explicit go. No machine translation into production.'],
    ['', ''],
    ['', 'WHY THIS EXISTS'],
    ['', "Dana Biosphere Reserve currently stores only an English (en) POI translation, so the proposal renders Dana in"],
    ['', 'English even when the client language is PT/ES/AR (Petra has all four locales and renders correctly). The renderer'],
    ['', 'fallback chain is working as designed; the fix is human-authored PT/ES/AR content — drafted on the first sheet.'],
    ['', ''],
    ['', 'REVIEW CHECKLIST'],
    ['☑', 'APPROVED richer long: the seed updates the EN long to this text (EN title + short unchanged); PT/ES/AR are translations of it.'],
    ['☐', 'Verify the PT title / short / long read naturally for a client audience.'],
    ['☐', 'Verify the ES title / short / long.'],
    ['☐', 'Verify the AR title / short / long, including RTL rendering and "Dana" (ضانا).'],
    ['☐', 'Decide whether "biosphere reserve" should use the local convention (محمية المحيط الحيوي) or an alternate phrasing.'],
    ['', ''],
    ['', 'APPLICATION PATH (only after your sign-off — NOT done here)'],
    ['1.', 'You approve the four-locale content on sheet 1 (edit inline as needed).'],
    ['2.', 'Approved content is added to the idempotent POI translation seed (upsert keyed on [poiId, locale]), as in Phase 4A.1.'],
    ['3.', 'Dry-run, then apply WITH EXPLICIT APPROVAL — same gate as the 4A.1 top-15 pack. No machine translation into prod.'],
    ['4.', 'Re-render the Amman → Dana → Petra proposal in PT/ES/AR and confirm Dana now reads in the selected language.'],
  ];
  lines.forEach(([a, b], i) => {
    const row = ws2.addRow({ a, b });
    const isHeading = b === b.toUpperCase() && b.length > 3 && !b.startsWith('Status');
    row.getCell(2).font = { bold: isHeading, color: { argb: isHeading ? 'FF1F4E79' : 'FF222222' } };
    row.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    if (i === 1) row.getCell(2).font = { bold: true, color: { argb: 'FF7A1F1F' } };
  });

  await wb.xlsx.writeFile(OUT);
  console.log('WROTE', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
