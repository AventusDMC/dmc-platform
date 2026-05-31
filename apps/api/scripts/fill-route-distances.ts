/**
 * Populate Route.distanceKm + Route.durationMinutes for all TRANSFER_ROUTE rows
 * from a Jordan road-distance/drive-time matrix. Enforces symmetry: A→B == B→A.
 * Dry-run by default; pass --apply to write.
 */
import { PrismaClient } from '@prisma/client';

const APPLY = process.argv.includes('--apply');

// endpoint string -> token (SPECIFIC FIRST — "Aqaba Port" before "Aqaba", "AQJ"/"Aqaba Airport" before "Aqaba")
const ALIASES: [string, RegExp][] = [
  ['aqj', /aqj|aqaba airport/i],
  ['aqabaport', /aqaba port/i],
  ['aqabamarina', /aqaba marina/i],
  ['aqabasouthbeach', /south beach/i],
  ['aqabaglassboat', /glass boat/i],
  ['aqabasouthborder', /south border|wadi araba/i],
  ['berenice', /berenice/i],
  ['aqaba', /aqaba/i],
  ['qaia', /qaia|queen alia/i],
  ['marka', /marka/i],
  ['deadsea', /dead sea/i],
  ['wadirum', /wadi rum/i],
  ['petra', /petra/i],
  ['ummqays', /umm qa/i],
  ['sheikhhussein', /sheikh hussein/i],
  ['allenby', /allenby/i],
  ['bethany', /bethany|baptism/i],
  ['madaba', /madaba/i],
  ['jerash', /jerash/i],
  ['ajloun', /ajloun/i],
  ['kerak', /kerak/i],
  ['dana', /dana/i],
  ['shobak', /shobak/i],
  ['mukawir', /mukawir/i],
  ['pella', /pella/i],
  ['amman', /amman/i],
];

function tok(s: string): string | null {
  for (const [t, rx] of ALIASES) if (rx.test(s)) return t;
  return null;
}

// whole-name fallback (no clean separator): blank out matched alias, collect in order
function scanTokens(name: string): string[] {
  let s = ' ' + name + ' ';
  const found: { t: string; i: number }[] = [];
  for (const [t, rx] of ALIASES) {
    const m = s.match(rx);
    if (m && m.index != null) {
      found.push({ t, i: m.index });
      s = s.replace(rx, ' '.repeat(m[0].length));
    }
  }
  return found.sort((a, b) => a.i - b.i).map((x) => x.t).filter((v, i, a) => a.indexOf(v) === i);
}

// unordered pair -> [km, minutes]
const RAW: [string, string, number, number][] = [
  ['amman', 'qaia', 35, 40], ['amman', 'marka', 10, 25], ['amman', 'deadsea', 60, 70],
  ['amman', 'jerash', 50, 60], ['amman', 'ajloun', 75, 90], ['amman', 'madaba', 35, 45],
  ['amman', 'petra', 235, 195], ['amman', 'wadirum', 320, 255], ['amman', 'aqaba', 330, 240],
  ['amman', 'kerak', 125, 135], ['amman', 'dana', 190, 180], ['amman', 'shobak', 210, 200],
  ['amman', 'mukawir', 85, 105], ['amman', 'pella', 95, 105], ['amman', 'ummqays', 120, 135],
  ['amman', 'bethany', 55, 65], ['amman', 'sheikhhussein', 95, 105], ['amman', 'allenby', 57, 70],
  ['qaia', 'deadsea', 55, 55], ['qaia', 'petra', 220, 210], ['qaia', 'wadirum', 300, 240],
  ['qaia', 'aqaba', 310, 225], ['qaia', 'allenby', 65, 75], ['qaia', 'sheikhhussein', 120, 130],
  ['deadsea', 'bethany', 12, 20], ['deadsea', 'petra', 195, 180], ['deadsea', 'wadirum', 290, 240],
  ['deadsea', 'aqaba', 305, 240], ['deadsea', 'madaba', 50, 60], ['deadsea', 'aqabasouthborder', 310, 245],
  ['deadsea', 'aqabaport', 308, 240], ['deadsea', 'aqj', 295, 230], ['deadsea', 'sheikhhussein', 145, 140],
  ['petra', 'wadirum', 105, 90], ['petra', 'aqaba', 125, 105], ['petra', 'dana', 60, 70],
  ['petra', 'shobak', 35, 40], ['petra', 'kerak', 135, 150], ['petra', 'allenby', 245, 225],
  ['petra', 'aqj', 130, 110], ['petra', 'aqabaport', 130, 110], ['petra', 'aqabasouthborder', 135, 115],
  ['petra', 'sheikhhussein', 320, 270],
  ['wadirum', 'aqaba', 60, 60], ['wadirum', 'aqj', 65, 60], ['wadirum', 'aqabaport', 65, 65],
  ['wadirum', 'aqabasouthborder', 70, 70], ['wadirum', 'allenby', 350, 285], ['wadirum', 'sheikhhussein', 410, 330],
  ['aqaba', 'aqj', 10, 15], ['aqaba', 'aqabaport', 8, 15], ['aqaba', 'aqabasouthborder', 12, 20],
  ['aqaba', 'aqabamarina', 5, 12], ['aqaba', 'aqabasouthbeach', 12, 18], ['aqaba', 'aqabaglassboat', 8, 15],
  ['aqaba', 'berenice', 13, 20],
  ['kerak', 'dana', 70, 80], ['kerak', 'deadsea', 90, 100],
];
const PAIR = new Map<string, [number, number]>();
for (const [a, b, km, min] of RAW) PAIR.set([a, b].sort().join('|'), [km, min]);

const SKIP_RX = /half day|full day|disposal|\(half|\bextra km\b|alpha bus|tala bay/i;

async function main() {
  const prisma = new PrismaClient();
  const rs = await prisma.route.findMany({
    where: { routeType: 'TRANSFER_ROUTE' },
    select: { id: true, name: true, distanceKm: true, durationMinutes: true },
    orderBy: { name: 'asc' },
  });

  let set = 0, changed = 0, skip = 0, miss = 0;
  const missList: string[] = [];
  const ops: (() => Promise<any>)[] = [];

  for (const r of rs) {
    if (SKIP_RX.test(r.name)) { skip++; continue; }
    // split on arrow/dash variants
    let parts = r.name.split(/\s*(?:→|->|—|–)\s*|\s+-\s+/).map((x) => x.trim()).filter(Boolean);
    let a: string | null, b: string | null;
    if (parts.length >= 2) { a = tok(parts[0]); b = tok(parts[parts.length - 1]); }
    else { const t = scanTokens(r.name); a = t[0] ?? null; b = t[1] ?? null; }
    if (!a || !b || a === b) { miss++; missList.push(r.name); continue; }
    const hit = PAIR.get([a, b].sort().join('|'));
    if (!hit) { miss++; missList.push(`${r.name}  (${a}|${b})`); continue; }
    const [km, min] = hit;
    set++;
    if (r.distanceKm !== km || r.durationMinutes !== min) {
      changed++;
      const id = r.id, was = `${r.distanceKm ?? '-'}km/${r.durationMinutes ?? '-'}min`;
      if (r.distanceKm != null && (Math.abs((r.distanceKm ?? 0) - km) > 1 || r.durationMinutes !== min))
        console.log(`  UPD ${r.name.padEnd(40)} ${was} -> ${km}km/${min}min`);
      ops.push(() => prisma.route.update({ where: { id }, data: { distanceKm: km, durationMinutes: min } }));
    }
  }

  console.log(`\nMATCHED ${set} routes  |  to write ${changed}  |  skipped(pseudo) ${skip}  |  no-match ${miss}`);
  if (missList.length) { console.log('\nNO-MATCH (left untouched):'); missList.forEach((m) => console.log('  • ' + m)); }

  if (APPLY) {
    let ok = 0, f = 0;
    for (const op of ops) { try { await op(); ok++; } catch (e: any) { f++; console.log('  ERR ' + (e?.message?.split('\n')[0] || e)); } }
    console.log(`\nApplied: ${ok} updated, ${f} failed`);
  } else console.log('\n(DRY-RUN — pass --apply to write.)');
  await prisma.$disconnect();
}
main();
