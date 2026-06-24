import { PrismaClient } from '@prisma/client';

/**
 * Controlled backfill for QuoteItem.customServiceName (PR A enabler).
 *
 * Sets customServiceName ONLY for meal items whose pricingDescription exactly
 * matches the generated meal template suffix ` | Meal | PER_PERSON | <n> pax`.
 * The name is recovered by stripping that ANCHORED suffix, so meal names that
 * contain internal `|` are preserved. Rows that do not match are left null
 * (safe fallback). Idempotent: only rows with customServiceName IS NULL are
 * touched. Read-only in dry-run mode.
 *
 * Usage:
 *   ts-node src/quotes/backfill-meal-custom-service-name.cli.ts dry-run
 *   ts-node src/quotes/backfill-meal-custom-service-name.cli.ts apply
 */

// Anchored to end-of-string; \d+ for the pax count. Only the generated meal
// template matches — never a transport/entrance/activity description.
export const MEAL_PRICING_DESCRIPTION_SUFFIX = / \| Meal \| PER_PERSON \| \d+ pax$/;

/**
 * Pure: extract the meal name from a generated meal pricingDescription by
 * stripping the anchored template suffix. Returns null when the string does
 * not match the exact meal template, or when the recovered name is empty.
 */
export function extractMealCustomServiceName(pricingDescription: unknown): string | null {
  if (typeof pricingDescription !== 'string') {
    return null;
  }
  if (!MEAL_PRICING_DESCRIPTION_SUFFIX.test(pricingDescription)) {
    return null;
  }
  const name = pricingDescription.replace(MEAL_PRICING_DESCRIPTION_SUFFIX, '');
  return name.length > 0 ? name : null;
}

export interface BackfillResult {
  candidates: number;
  matched: number;
  skipped: number;
  alreadyPopulated: number;
  applied: number;
  samples: Array<{ id: string; name: string }>;
}

/** Run the backfill against a Prisma client. apply=false = dry-run (no writes). */
export async function runMealCustomServiceNameBackfill(
  prisma: { quoteItem: any },
  options: { apply: boolean },
): Promise<BackfillResult> {
  // Prefilter cheaply on the literal template fragment; the anchored regex below
  // is the authoritative match. Only null rows → idempotent.
  const candidates: Array<{ id: string; pricingDescription: string | null }> = await prisma.quoteItem.findMany({
    where: {
      customServiceName: null,
      pricingDescription: { contains: ' | Meal | PER_PERSON | ' },
    },
    select: { id: true, pricingDescription: true },
  });

  const updates: Array<{ id: string; name: string }> = [];
  let skipped = 0;
  for (const row of candidates) {
    const name = extractMealCustomServiceName(row.pricingDescription);
    if (name) {
      updates.push({ id: row.id, name });
    } else {
      skipped += 1;
    }
  }

  const alreadyPopulated: number = await prisma.quoteItem.count({ where: { customServiceName: { not: null } } });

  let applied = 0;
  if (options.apply) {
    for (const update of updates) {
      await prisma.quoteItem.update({ where: { id: update.id }, data: { customServiceName: update.name } });
      applied += 1;
    }
  }

  return {
    candidates: candidates.length,
    matched: updates.length,
    skipped,
    alreadyPopulated,
    applied,
    samples: updates.slice(0, 5),
  };
}

async function main() {
  const mode = (process.argv[2] || 'dry-run').trim();
  if (mode !== 'dry-run' && mode !== 'apply') {
    console.error(`Unknown mode "${mode}". Use "dry-run" or "apply".`);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const result = await runMealCustomServiceNameBackfill(prisma as any, { apply: mode === 'apply' });
    console.log(`[backfill:customServiceName] mode=${mode}`);
    console.log(`  candidates (null + meal-template):  ${result.candidates}`);
    console.log(`  matched (would set / set):          ${result.matched}`);
    console.log(`  skipped (no exact suffix match):    ${result.skipped}`);
    console.log(`  already populated (customServiceName not null): ${result.alreadyPopulated}`);
    console.log(`  applied (writes):                   ${result.applied}`);
    if (result.samples.length) {
      console.log('  examples:');
      for (const s of result.samples) {
        console.log(`    ${s.id} -> ${JSON.stringify(s.name)}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
