import * as assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  buildEntranceFeeUpdateData,
  decideEntranceFeeCoverage,
  isPetraEntranceSite,
  type EntranceFeePricingResult,
} from './jordan-pass-coverage';

// ---------------------------------------------------------------------------
// Reference implementations: a verbatim copy of the logic that previously lived
// inline in QuotesService.syncJordanPassEntranceFees (pre-extraction). The tests
// assert the extracted pure functions reproduce these byte-for-byte, so this PR
// is provably behavior-preserving.
// ---------------------------------------------------------------------------

interface RefItem {
  optionId: string | null;
  variantIncluded?: boolean | null;
  entranceIncluded: boolean;
  siteName: string;
}

// Mirrors the prior inline per-option Petra-cap loop exactly.
function oldCoverageLoop(items: RefItem[], passType: string, petraDayCount: number): boolean[] {
  const petraCoverageByOption = new Map<string, number>();
  const out: boolean[] = [];
  for (const item of items) {
    let covered = passType !== 'NONE' && (item.variantIncluded ?? item.entranceIncluded);
    if (covered && /\bpetra\b/i.test(item.siteName)) {
      const key = item.optionId || 'base';
      const used = petraCoverageByOption.get(key) || 0;
      covered = used < petraDayCount;
      if (covered) {
        petraCoverageByOption.set(key, used + 1);
      }
    }
    out.push(Boolean(covered));
  }
  return out;
}

// The same loop, but driven by the extracted pure decision function.
function newCoverageLoop(items: RefItem[], passType: string, petraDayCount: number): boolean[] {
  const petraCoverageByOption = new Map<string, number>();
  const out: boolean[] = [];
  for (const item of items) {
    const key = item.optionId || 'base';
    const used = petraCoverageByOption.get(key) || 0;
    const decision = decideEntranceFeeCoverage({
      passType,
      variantIncludedInJordanPass: item.variantIncluded,
      entranceFeeIncludedInJordanPass: item.entranceIncluded,
      siteName: item.siteName,
      petraVisitsUsedForOption: used,
      petraDayCount,
    });
    if (decision.consumesPetraVisit) {
      petraCoverageByOption.set(key, used + 1);
    }
    out.push(decision.covered);
  }
  return out;
}

const PRICING: EntranceFeePricingResult = {
  totalCost: 123.45,
  totalSell: 150.0,
  quoteCurrency: 'USD',
  fxRate: 1.41,
  fxFromCurrency: 'JOD',
  fxToCurrency: 'USD',
  fxRateDate: new Date('2026-04-23T00:00:00.000Z'),
};

// Verbatim copy of the prior inline `data: { ... }` object passed to quoteItem.update.
function oldUpdateData(
  covered: boolean,
  ticketUnitCost: number,
  ticketCurrency: string,
  ticketLabel: string,
  siteName: string,
  pricing: EntranceFeePricingResult,
) {
  const unitCost = covered ? 0 : ticketUnitCost;
  return {
    jordanPassCovered: covered,
    jordanPassSavingsJod: covered ? ticketUnitCost : 0,
    pricingDescription: covered
      ? `${siteName}${ticketLabel} | Covered by Jordan Pass`
      : `${siteName}${ticketLabel} | Entrance fee`,
    baseCost: pricing.totalCost,
    costBaseAmount: unitCost,
    costCurrency: ticketCurrency,
    currency: pricing.quoteCurrency,
    quoteCurrency: pricing.quoteCurrency,
    fxRate: pricing.fxRate,
    fxFromCurrency: pricing.fxFromCurrency,
    fxToCurrency: pricing.fxToCurrency,
    fxRateDate: pricing.fxRateDate,
    finalCost: pricing.totalCost,
    totalCost: pricing.totalCost,
    totalSell: pricing.totalSell,
  };
}

describe('jordan-pass-coverage — behavior-preserving extraction', () => {
  it('isPetraEntranceSite matches the prior regex behavior', () => {
    for (const name of ['Petra', 'petra by night', 'Little Petra', 'PETRA Visit']) {
      assert.equal(isPetraEntranceSite(name), /\bpetra\b/i.test(name), name);
    }
    for (const name of ['Jerash', 'Wadi Rum', 'petrarch', 'Amman Citadel']) {
      assert.equal(isPetraEntranceSite(name), /\bpetra\b/i.test(name), name);
    }
  });

  it('decideEntranceFeeCoverage matches the old inline decision across a matrix', () => {
    const passTypes = ['NONE', 'JORDAN_PASS_2_DAY', 'JORDAN_PASS_3_DAY'];
    const variantFlags: Array<boolean | null | undefined> = [true, false, null, undefined];
    const entranceFlags = [true, false];
    const sites = ['Petra', 'Jerash', 'Little Petra'];

    for (const passType of passTypes) {
      for (const variant of variantFlags) {
        for (const entrance of entranceFlags) {
          for (const site of sites) {
            for (const petraDayCount of [0, 1, 2]) {
              for (const used of [0, 1, 2]) {
                // Single-item parity vs the prior inline expression.
                let oldCovered = passType !== 'NONE' && (variant ?? entrance);
                let consumes = false;
                if (oldCovered && /\bpetra\b/i.test(site)) {
                  oldCovered = used < petraDayCount;
                  consumes = oldCovered;
                }
                const decision = decideEntranceFeeCoverage({
                  passType,
                  variantIncludedInJordanPass: variant,
                  entranceFeeIncludedInJordanPass: entrance,
                  siteName: site,
                  petraVisitsUsedForOption: used,
                  petraDayCount,
                });
                assert.equal(decision.covered, Boolean(oldCovered));
                assert.equal(decision.consumesPetraVisit, consumes);
              }
            }
          }
        }
      }
    }
  });

  it('reproduces the per-option Petra day-cap loop exactly (cap exhaustion + per-option isolation)', () => {
    const items: RefItem[] = [
      { optionId: null, entranceIncluded: true, siteName: 'Petra Day 1' },
      { optionId: null, entranceIncluded: true, siteName: 'Petra Day 2' },
      { optionId: null, entranceIncluded: true, siteName: 'Petra Day 3' }, // exceeds a 2-day cap
      { optionId: 'opt-A', entranceIncluded: true, siteName: 'Petra Day 1' }, // separate option scope
      { optionId: null, entranceIncluded: true, siteName: 'Jerash' }, // non-Petra always covered
      { optionId: null, variantIncluded: false, entranceIncluded: true, siteName: 'Petra Day 4' }, // variant excludes
    ];
    for (const passType of ['NONE', 'JORDAN_PASS_2_DAY']) {
      for (const petraDayCount of [0, 1, 2]) {
        assert.deepEqual(
          newCoverageLoop(items, passType, petraDayCount),
          oldCoverageLoop(items, passType, petraDayCount),
          `passType=${passType} cap=${petraDayCount}`,
        );
      }
    }
  });

  it('buildEntranceFeeUpdateData matches the old inline update payload (covered + uncovered)', () => {
    for (const covered of [true, false]) {
      for (const label of ['', ' | Adult']) {
        for (const cur of ['JOD', 'USD']) {
          const got = buildEntranceFeeUpdateData({
            covered,
            ticketUnitCost: 50,
            ticketCurrency: cur,
            ticketLabel: label,
            siteName: 'Petra',
            pricing: PRICING,
          });
          assert.deepEqual(got, oldUpdateData(covered, 50, cur, label, 'Petra', PRICING));
        }
      }
    }
  });

  it('is pure: does not mutate inputs and returns a fresh object', () => {
    const coverageInput = Object.freeze({
      passType: 'JORDAN_PASS_2_DAY',
      variantIncludedInJordanPass: true,
      entranceFeeIncludedInJordanPass: true,
      siteName: 'Petra',
      petraVisitsUsedForOption: 0,
      petraDayCount: 2,
    });
    // Would throw if the function attempted to mutate a frozen input.
    assert.doesNotThrow(() => decideEntranceFeeCoverage(coverageInput));

    const pricing = Object.freeze({ ...PRICING });
    const updateInput = Object.freeze({
      covered: true,
      ticketUnitCost: 50,
      ticketCurrency: 'JOD',
      ticketLabel: '',
      siteName: 'Petra',
      pricing,
    });
    const out = buildEntranceFeeUpdateData(updateInput);
    assert.doesNotThrow(() => buildEntranceFeeUpdateData(updateInput));
    assert.notEqual(out, updateInput);
    assert.notEqual(out as unknown, pricing as unknown);
  });

  it('performs no Prisma / DB / IO (static guard on the module source)', () => {
    const src = readFileSync(join(__dirname, 'jordan-pass-coverage.ts'), 'utf8');
    for (const forbidden of [
      'prisma',
      'PrismaService',
      'this.',
      'fetch(',
      'await ',
      'process.env',
      'console.',
    ]) {
      assert.ok(!src.includes(forbidden), `pure module must not contain: ${forbidden}`);
    }
  });
});
