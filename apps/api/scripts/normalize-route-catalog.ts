/**
 * Route catalog normalization — dry-run by default, --apply to write. Idempotent.
 *
 *   npx tsx scripts/normalize-route-catalog.ts            (dry-run)
 *   npx tsx scripts/normalize-route-catalog.ts --apply
 *
 * Transfer routes (Route, directional A→B only — pseudo/disposal routes excluded):
 *   - canonicalize endpoints via a place-alias map (Amman City Center=Amman,
 *     Allenby Bridge=Allenby Border, QAIA/Queen Alia=QAIA Airport, …)
 *   - one record per canonical journey: name + normalizedKey set to the canonical
 *     form, routeType=TRANSFER_ROUTE; duplicate journeys merged (re-point pricing
 *     rules / vehicle rates / quote items to the keeper, then delete the twin)
 *   - create any missing reverse direction (clone, endpoints swapped) — UNPRICED
 * Touring routes (TouringRoute): legacy codes → JOR-TR-<REGION>-<NAME>[-ON]; COPY deleted.
 * Routes whose endpoints don't resolve, or non-transfer routeTypes, are LEFT UNTOUCHED (listed).
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const TRANSFER_TYPES = new Set(['TRANSFER_ROUTE', 'transfer', 'airport-transfer', 'border-transfer', 'intercity-transfer', 'private-transfer']);
// place tokens — ORDER MATTERS (specific before general)
const PLACES: Array<{ token: string; display: string; rx: RegExp }> = [
  { token: 'QAIA', display: 'QAIA Airport', rx: /qaia|queen alia/ },
  { token: 'MARKA', display: 'Marka Airport', rx: /marka/ },
  { token: 'AQJ', display: 'AQJ Airport', rx: /aqj|king hussein international/ },
  { token: 'AQABA_SOUTH_BORDER', display: 'Aqaba South Border', rx: /aqaba south border/ },
  { token: 'AQABA_PORT', display: 'Aqaba Port', rx: /aqaba port/ },
  { token: 'AQABA', display: 'Aqaba', rx: /^aqaba( city)?( center)?$/ },
  { token: 'ALLENBY', display: 'Allenby Border', rx: /allenby|king hussein bridge/ },
  { token: 'SHEIKH_HUSSEIN', display: 'Sheikh Hussein Border', rx: /sheikh hussein/ },
  { token: 'DEAD_SEA', display: 'Dead Sea', rx: /dead sea/ },
  { token: 'PETRA', display: 'Petra', rx: /petra/ },
  { token: 'WADI_RUM', display: 'Wadi Rum', rx: /wadi rum/ },
  { token: 'JERASH', display: 'Jerash', rx: /jerash/ },
  { token: 'AJLOUN', display: 'Ajloun', rx: /ajloun/ },
  { token: 'UMM_QAIS', display: 'Umm Qais', rx: /umm qais|umm qays/ },
  { token: 'MADABA', display: 'Madaba', rx: /madaba/ },
  { token: 'MUKAWIR', display: 'Mukawir', rx: /mukawir/ },
  { token: 'PELLA', display: 'Pella', rx: /pella/ },
  { token: 'KERAK', display: 'Kerak', rx: /kerak/ },
  { token: 'SHOBAK', display: 'Shobak', rx: /shobak/ },
  { token: 'DANA', display: 'Dana', rx: /dana/ },
  { token: 'BETHANY', display: 'Bethany', rx: /bethany/ },
  { token: 'AMMAN', display: 'Amman', rx: /^amman( city)?( center)?$/ },
];
const slug = (s: string) => (s || '').toLowerCase().replace(/→|->|>/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '_');
const place = (part: string) => { const p = part.toLowerCase().trim().replace(/\(.*?\)/g, '').trim(); return PLACES.find((pl) => pl.rx.test(p)) || null; };
const splitArrow = (s: string) => (s || '').split(/\s*(?:→|->)\s*/).map((x) => x.trim()).filter(Boolean);

type R = { id: string; name: string; normalizedKey: string; routeType: string | null; isActive: boolean; fromPlaceId: string; toPlaceId: string };

async function main() {
  console.log(`MODE: ${APPLY ? 'APPLY (writes)' : 'DRY-RUN'}\n`);
  const all = (await prisma.route.findMany({ select: { id: true, name: true, normalizedKey: true, routeType: true, isActive: true, fromPlaceId: true, toPlaceId: true } })) as R[];
  const ruleC = new Map((await prisma.transportPricingRule.groupBy({ by: ['routeId'], _count: { _all: true } })).map((g: any) => [g.routeId, g._count._all]));
  const rateC = new Map((await prisma.vehicleRate.groupBy({ by: ['routeId'], _count: { _all: true } })).map((g: any) => [g.routeId, g._count._all]));
  const itemC = new Map((await prisma.quoteItem.groupBy({ by: ['routeId'], _count: { _all: true } })).map((g: any) => [g.routeId, g._count._all]));
  const refs = (id: string) => `${ruleC.get(id) || 0}r/${rateC.get(id) || 0}v/${itemC.get(id) || 0}q`;

  // classify
  type Canon = { route: R; fromTok: string; toTok: string; canonName: string; canonKey: string };
  const canon: Canon[] = []; const skipped: R[] = [];
  for (const r of all) {
    const parts = splitArrow(r.name);
    const f = parts[0] ? place(parts[0]) : null; const t = parts[1] ? place(parts[1]) : null;
    if (parts.length !== 2 || !f || !t || f.token === t.token || !TRANSFER_TYPES.has(r.routeType || '')) { skipped.push(r); continue; }
    const canonName = `${f.display} → ${t.display}`;
    canon.push({ route: r, fromTok: f.token, toTok: t.token, canonName, canonKey: slug(canonName) });
  }

  // group by canonical key
  const groups = new Map<string, Canon[]>();
  for (const c of canon) (groups.get(c.canonKey) || groups.set(c.canonKey, []).get(c.canonKey)!).push(c);

  const ops: Array<() => Promise<void>> = [];
  let dedupe = 0, renamed = 0, repR = 0, repV = 0, repQ = 0;
  const keepByKey = new Map<string, Canon>();
  console.log('===== TRANSFER ROUTES =====');
  for (const [key, gs] of [...groups.entries()].sort()) {
    const keep = gs.slice().sort((a, b) =>
      (Number(b.route.isActive) - Number(a.route.isActive)) ||
      ((rateC.get(b.route.id) || 0) - (rateC.get(a.route.id) || 0)) ||
      ((ruleC.get(b.route.id) || 0) - (ruleC.get(a.route.id) || 0)))[0];
    keepByKey.set(key, keep);
    const retire = gs.filter((g) => g.route.id !== keep.route.id);
    const needName = keep.route.name !== keep.canonName; const needKey = keep.route.normalizedKey !== key; const needType = keep.route.routeType !== 'TRANSFER_ROUTE';
    if (retire.length || needName || needKey || needType) {
      console.log(`\n• ${keep.canonName}`);
      console.log(`   KEEP   "${keep.route.name}" key=${keep.route.normalizedKey} [${refs(keep.route.id)}] type=${keep.route.routeType}` + (needName ? `  ⇒ name→"${keep.canonName}"` : '') + (needKey ? `  ⇒ key→${key}` : '') + (needType ? `  ⇒ type→TRANSFER_ROUTE` : ''));
      if (needName || needKey || needType) renamed++;
      for (const g of retire) {
        dedupe++; repR += ruleC.get(g.route.id) || 0; repV += rateC.get(g.route.id) || 0; repQ += itemC.get(g.route.id) || 0;
        console.log(`   RETIRE "${g.route.name}" key=${g.route.normalizedKey} [${refs(g.route.id)}] ⇒ re-point→KEEP & delete`);
        ops.push(async () => {
          await prisma.transportPricingRule.updateMany({ where: { routeId: g.route.id }, data: { routeId: keep.route.id } });
          await prisma.vehicleRate.updateMany({ where: { routeId: g.route.id }, data: { routeId: keep.route.id } });
          await prisma.quoteItem.updateMany({ where: { routeId: g.route.id }, data: { routeId: keep.route.id } });
          await prisma.route.delete({ where: { id: g.route.id } });
        });
      }
      ops.push(async () => { await prisma.route.update({ where: { id: keep.route.id }, data: { name: keep.canonName, normalizedKey: key, routeType: 'TRANSFER_ROUTE' } }); });
    }
  }

  // ensure both directions
  let created = 0;
  console.log('\n--- MISSING REVERSES (create, UNPRICED) ---');
  for (const [key, keep] of keepByKey) {
    const revName = `${keep.toTok && PLACES.find((p) => p.token === keep.toTok)!.display} → ${PLACES.find((p) => p.token === keep.fromTok)!.display}`;
    const revKey = slug(revName);
    if (!keepByKey.has(revKey)) {
      created++;
      console.log(`   + ${revName} (key ${revKey})  ← clone of ${keep.canonName}`);
      const from = keep.route.toPlaceId, to = keep.route.fromPlaceId;
      ops.push(async () => { await prisma.route.create({ data: { name: revName, normalizedKey: revKey, routeType: 'TRANSFER_ROUTE', isActive: true, fromPlaceId: from, toPlaceId: to } }); });
      keepByKey.set(revKey, { ...keep, fromTok: keep.toTok, toTok: keep.fromTok, canonName: revName, canonKey: revKey });
    }
  }

  console.log(`\n--- TRANSFER SUMMARY --- canonical journeys:${groups.size} dedupe:${dedupe} normalize(name/key/type):${renamed} reversesToCreate:${created} | re-point ${repR}rules/${repV}vr/${repQ}qi`);
  console.log(`\n--- LEFT UNTOUCHED (non-transfer / unresolved endpoints): ${skipped.length} --- (sample)`);
  skipped.slice(0, 20).forEach((r) => console.log(`   - "${r.name}" type=${r.routeType} [${refs(r.id)}]`));

  // ---- TOURING ----
  const tr = await (prisma as any).touringRoute.findMany({ select: { id: true, code: true, name: true, region: true, startCity: true, overnight: true } });
  const reg = (t: any) => (t.region || t.startCity || 'GEN').toString().toUpperCase().replace(/[^A-Z]/g, '').slice(0, 8) || 'GEN';
  const nm = (s: string) => (s || '').toUpperCase().replace(/&/g, ' ').replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28);
  const proposed = new Map<string, string[]>(); let tRen = 0, tDel = 0;
  const tOps: Array<() => Promise<void>> = [];
  console.log('\n\n===== TOURING ROUTES =====');
  for (const t of tr) {
    if (/copy/i.test(t.code || '') || /copy/i.test(t.name || '')) { tDel++; console.log(`   DELETE ${t.code} | ${t.name}`); tOps.push(async () => { await (prisma as any).touringRoute.delete({ where: { id: t.id } }); }); continue; }
    if (/^JOR-TR-/.test(t.code || '')) continue;
    const pc = `JOR-TR-${reg(t)}-${nm(t.name)}${t.overnight ? '-ON' : ''}`;
    (proposed.get(pc) || proposed.set(pc, []).get(pc)!).push(t.code); tRen++;
    console.log(`   RENAME ${t.code} → ${pc} | ${t.name}`);
    tOps.push(async () => { await (prisma as any).touringRoute.update({ where: { id: t.id }, data: { code: pc } }); });
  }
  const coll = [...proposed.entries()].filter(([, v]) => v.length > 1);
  if (coll.length) { console.log('\n⚠ TOURING CODE COLLISIONS (resolve before apply):'); coll.forEach(([c, v]) => console.log(`   ${c} ← ${v.join(', ')}`)); }
  console.log(`\n--- TOURING SUMMARY --- rename:${tRen} delete:${tDel} collisions:${coll.length}`);

  if (APPLY) {
    if (coll.length) { console.log('\nABORTED: resolve touring collisions first.'); return; }
    console.log('\nApplying…');
    let okN = 0, failN = 0; const errs: string[] = [];
    for (const op of [...ops, ...tOps]) { try { await op(); okN++; } catch (e: any) { failN++; if (errs.length < 20) errs.push(e?.message?.split('\n')[0]?.slice(0, 140) || String(e)); } }
    console.log(`Applied: ${okN} ops OK, ${failN} failed`);
    errs.forEach((e) => console.log('  ERR: ' + e));
    // verify
    const total = await prisma.route.count();
    const legacyTouring = await (prisma as any).touringRoute.count({ where: { NOT: { code: { startsWith: 'JOR-TR-' } } } });
    const spot = await prisma.route.findFirst({ where: { normalizedKey: 'qaia_airport_amman' }, select: { name: true, normalizedKey: true, routeType: true } });
    console.log(`\nVERIFY — routes total now: ${total} | touring still non-JOR-TR-: ${legacyTouring}`);
    console.log('  spot qaia_airport_amman → ' + JSON.stringify(spot));
  } else console.log('\n(DRY-RUN — nothing written.)');
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
