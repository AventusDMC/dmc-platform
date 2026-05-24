import 'reflect-metadata';
import { PrismaService } from '../prisma/prisma.service';

// One-shot scrubber for vouchers whose stored snapshotJson.operationalNotes
// contains supplier cost text (e.g. "Rate USD 45.00 x 2 pax x 1 night").
// Root cause is fixed in buildOperationalVoucherSnapshot — see commit ac07ca4
// (PR #22). This handles snapshots already persisted before that change.
//
// Action: nulls snapshotJson.operationalNotes (and snapshotJson.notes if
// somehow set) on matching rows, leaving every other field intact. Operators
// can re-generate the voucher from the UI to repopulate operator-typed notes
// if any actually existed (almost certainly none — the leak was purely the
// contract-metadata fallback).
//
// Usage (from apps/api):
//   dry-run: npm run cleanup:vouchers:cost-leak:dry-run
//   apply:   npm run cleanup:vouchers:cost-leak:apply -- --confirm=SCRUB_VOUCHER_SNAPSHOT_COST_LEAK

const APPLY_CONFIRM_TOKEN = 'SCRUB_VOUCHER_SNAPSHOT_COST_LEAK';

// Recognises any value that looks like a supplier rate-card line. Matches
// "Rate USD 45.00", "USD 110", "EUR 200", and the broader "Supplements USD"
// pattern observed on hotel rows. Designed for over-matching: we'd rather
// scrub a legitimate "USD 100 cancellation fee" mention than leak a margin.
const COST_PATTERN = /\b(rate\s+)?(usd|eur|gbp|jod)\s*\d/i;

function parseArgs(argv: string[]) {
  const [mode, ...rest] = argv;
  const args = new Map<string, string>();
  for (const entry of rest) {
    if (!entry.startsWith('--')) continue;
    const [key, ...valueParts] = entry.slice(2).split('=');
    args.set(key, valueParts.join('='));
  }
  return { mode, args };
}

function printJson(payload: unknown) {
  console.log(JSON.stringify(payload, null, 2));
}

type Leak = { source: 'snapshot' | 'column'; field: string; value: string };

function findLeakedFields(voucher: any): Leak[] {
  const leaks: Leak[] = [];
  const snapshot = voucher.snapshotJson;
  if (snapshot && typeof snapshot === 'object') {
    for (const field of ['operationalNotes', 'notes']) {
      const value = (snapshot as any)[field];
      if (typeof value === 'string' && COST_PATTERN.test(value)) {
        leaks.push({ source: 'snapshot', field, value });
      }
    }
  }
  // voucher.notes is a top-level column (set by generateOperationalVoucher /
  // createServiceVoucher). The detail page renders it as a fallback when
  // snapshot.operationalNotes is null, so a rate-laden value here leaks too.
  if (typeof voucher.notes === 'string' && COST_PATTERN.test(voucher.notes)) {
    leaks.push({ source: 'column', field: 'notes', value: voucher.notes });
  }
  return leaks;
}

async function findLeakedVouchers(prisma: PrismaService) {
  const vouchers = await (prisma as any).voucher.findMany({
    select: {
      id: true,
      bookingId: true,
      bookingServiceId: true,
      type: true,
      status: true,
      snapshotJson: true,
      notes: true,
    },
  });
  return vouchers
    .map((v: any) => {
      const leaks = findLeakedFields(v);
      return leaks.length > 0 ? { voucher: v, leaks } : null;
    })
    .filter(Boolean) as Array<{ voucher: any; leaks: Leak[] }>;
}

async function main() {
  const { mode, args } = parseArgs(process.argv.slice(2));
  const prisma = new PrismaService();
  await prisma.$connect();

  try {
    const leaked = await findLeakedVouchers(prisma);
    const sample = leaked.slice(0, 20).map((entry) => ({
      voucherId: entry.voucher.id,
      bookingId: entry.voucher.bookingId,
      bookingServiceId: entry.voucher.bookingServiceId,
      type: entry.voucher.type,
      status: entry.voucher.status,
      leakedFields: entry.leaks.map((leak) => `${leak.source}.${leak.field}`),
      leakedValues: entry.leaks.map((leak) => leak.value),
    }));

    if (mode === 'dry-run') {
      printJson({
        mode: 'dry-run',
        mutatesData: false,
        totalLeakedVouchers: leaked.length,
        sample,
      });
      return;
    }

    if (mode === 'apply') {
      if (args.get('confirm') !== APPLY_CONFIRM_TOKEN) {
        printJson({
          success: false,
          error: `Refusing to apply: pass --confirm=${APPLY_CONFIRM_TOKEN} to acknowledge this will mutate vouchers.snapshotJson.`,
          totalLeakedVouchers: leaked.length,
        });
        process.exitCode = 1;
        return;
      }

      if (leaked.length === 0) {
        printJson({ mode: 'apply', mutatesData: true, scrubbed: 0, message: 'No matching vouchers.' });
        return;
      }

      const scrubbed = await prisma.$transaction(async (tx) => {
        let count = 0;
        for (const entry of leaked) {
          const update: Record<string, any> = {};
          const snapshotLeaks = entry.leaks.filter((l) => l.source === 'snapshot');
          if (snapshotLeaks.length > 0 && entry.voucher.snapshotJson && typeof entry.voucher.snapshotJson === 'object') {
            const after = { ...(entry.voucher.snapshotJson as Record<string, any>) };
            for (const leak of snapshotLeaks) {
              after[leak.field] = null;
            }
            update.snapshotJson = after;
          }
          const columnLeak = entry.leaks.find((l) => l.source === 'column' && l.field === 'notes');
          if (columnLeak) {
            update.notes = null;
          }
          await (tx as any).voucher.update({ where: { id: entry.voucher.id }, data: update });
          await (tx as any).bookingAuditLog.create({
            data: {
              bookingId: entry.voucher.bookingId,
              bookingServiceId: entry.voucher.bookingServiceId,
              entityType: 'booking_service' as const,
              entityId: entry.voucher.bookingServiceId,
              action: 'voucher_snapshot_cost_leak_scrubbed',
              oldValue: entry.leaks.map((l) => `${l.source}.${l.field}: ${l.value}`).join(' | '),
              newValue: null,
              actor: 'cleanup-voucher-snapshot-cost-leak.cli',
            },
          });
          count += 1;
        }
        return count;
      });

      printJson({
        mode: 'apply',
        mutatesData: true,
        scrubbed,
        sample,
      });
      return;
    }

    throw new Error(
      `Usage: ts-node src/bookings/cleanup-voucher-snapshot-cost-leak.cli.ts <dry-run|apply> [--confirm=${APPLY_CONFIRM_TOKEN}]`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  printJson({ success: false, error: message });
  process.exitCode = 1;
});
