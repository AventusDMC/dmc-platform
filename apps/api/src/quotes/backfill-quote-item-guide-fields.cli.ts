import { PrismaClient } from '@prisma/client';

/**
 * Controlled backfill for QuoteItem.guideType / guideDuration / guideOvernight
 * (PR A enabler).
 *
 * Sets the three guide columns ONLY for items whose pricingDescription EXACTLY
 * matches the generated guide template:
 *   `Guide | {Local|Escort} | {Half day|Full day} | Overnight: {Yes|No}`
 * Parsing is fully anchored (^...$) — never a partial/substring match. Rows that
 * do not match exactly are left null (safe fallback). Idempotent: only rows with
 * guideType IS NULL are touched. Read-only in dry-run mode.
 *
 * Usage:
 *   ts-node src/quotes/backfill-quote-item-guide-fields.cli.ts dry-run
 *   ts-node src/quotes/backfill-quote-item-guide-fields.cli.ts apply
 */

// Anchored full-string match for the exact generated guide descriptor. Capture
// groups: 1=type label, 2=duration label, 3=overnight label.
export const GUIDE_PRICING_DESCRIPTION_RE =
  /^Guide \| (Local|Escort) \| (Half day|Full day) \| Overnight: (Yes|No)$/;

export interface ParsedGuideFields {
  guideType: 'local' | 'escort';
  guideDuration: 'half_day' | 'full_day';
  guideOvernight: boolean;
}

/**
 * Pure: parse a generated guide pricingDescription into canonical column values.
 * Returns null unless the string matches the exact anchored guide template.
 */
export function parseGuidePricingDescription(pricingDescription: unknown): ParsedGuideFields | null {
  if (typeof pricingDescription !== 'string') {
    return null;
  }
  const m = GUIDE_PRICING_DESCRIPTION_RE.exec(pricingDescription);
  if (!m) {
    return null;
  }
  return {
    guideType: m[1] === 'Local' ? 'local' : 'escort',
    guideDuration: m[2] === 'Half day' ? 'half_day' : 'full_day',
    guideOvernight: m[3] === 'Yes',
  };
}

export interface GuideBackfillResult {
  candidates: number;
  matched: number;
  skipped: number;
  alreadyPopulated: number;
  applied: number;
  samples: Array<{ id: string; fields: ParsedGuideFields }>;
}

/** Run the backfill against a Prisma client. apply=false = dry-run (no writes). */
export async function runGuideFieldsBackfill(
  prisma: { quoteItem: any },
  options: { apply: boolean },
): Promise<GuideBackfillResult> {
  // Prefilter cheaply on the literal template prefix; the anchored regex below
  // is the authoritative match. Only guideType-null rows → idempotent.
  const candidates: Array<{ id: string; pricingDescription: string | null }> = await prisma.quoteItem.findMany({
    where: {
      guideType: null,
      pricingDescription: { startsWith: 'Guide | ' },
    },
    select: { id: true, pricingDescription: true },
  });

  const updates: Array<{ id: string; fields: ParsedGuideFields }> = [];
  let skipped = 0;
  for (const row of candidates) {
    const fields = parseGuidePricingDescription(row.pricingDescription);
    if (fields) {
      updates.push({ id: row.id, fields });
    } else {
      skipped += 1;
    }
  }

  const alreadyPopulated: number = await prisma.quoteItem.count({ where: { guideType: { not: null } } });

  let applied = 0;
  if (options.apply) {
    for (const update of updates) {
      await prisma.quoteItem.update({
        where: { id: update.id },
        data: {
          guideType: update.fields.guideType,
          guideDuration: update.fields.guideDuration,
          guideOvernight: update.fields.guideOvernight,
        },
      });
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
    const result = await runGuideFieldsBackfill(prisma as any, { apply: mode === 'apply' });
    console.log(`[backfill:guideFields] mode=${mode}`);
    console.log(`  candidates (guideType null + guide-template):  ${result.candidates}`);
    console.log(`  matched (would set / set):                     ${result.matched}`);
    console.log(`  skipped (no exact template match):             ${result.skipped}`);
    console.log(`  already populated (guideType not null):        ${result.alreadyPopulated}`);
    console.log(`  applied (writes):                              ${result.applied}`);
    if (result.samples.length) {
      console.log('  examples:');
      for (const s of result.samples) {
        console.log(`    ${s.id} -> ${JSON.stringify(s.fields)}`);
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
