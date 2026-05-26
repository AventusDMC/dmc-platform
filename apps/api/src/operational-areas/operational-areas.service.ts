import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Operational Areas Catalog v1 — CRUD service for the DB-backed dictionary
// of operational movement endpoints. Replaces the hardcoded array that
// previously lived in apps/api/src/route-standards/operational-areas.ts.
//
// The Route Builder, Canonical Builder, Touring Routes, Dispatch, Transfers,
// and Excursion composition all consume this catalog. Codes (AMM, QAIA,
// PET, WR, AQJ, DS, JER, AJL, MAD, NEB, KRK, IRB, ALLENBY, SHB, WAB) drive
// the FROM_TO canonical route-code generator.

export type OperationalAreaType =
  | 'CITY'
  | 'AIRPORT'
  | 'BORDER'
  | 'HOTEL_ZONE'
  | 'TOURISM_SITE'
  | 'CAMP_AREA'
  | 'PORT'
  | 'RESORT_AREA';

export const OPERATIONAL_AREA_TYPES: OperationalAreaType[] = [
  'CITY',
  'AIRPORT',
  'BORDER',
  'HOTEL_ZONE',
  'TOURISM_SITE',
  'CAMP_AREA',
  'PORT',
  'RESORT_AREA',
];

export type OperationalAreaInput = {
  code: string;
  name: string;
  type: OperationalAreaType | string;
  city: string;
  region?: string | null;
  country?: string | null;
  isActive?: boolean;
  airportRouteFlagDefault?: boolean;
  borderCrossingFlagDefault?: boolean;
  mountainRoadFlagDefault?: boolean;
  overnightRiskDefault?: boolean;
  // Preferred Operational Area Logic — lower number wins when multiple
  // areas share a city + type. NULL = lowest priority (operator hasn't
  // opined). See compareAreasByPriority for tie-break order.
  priority?: number | null;
};

/** Same UPPER_SNAKE normalization the canonical route-code generator uses. */
export function normalizeAreaCode(value: string | null | undefined): string {
  return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '_');
}

function requireString(value: string | null | undefined, field: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) throw new BadRequestException(`${field} is required`);
  return trimmed;
}

function requireValidType(type: string): OperationalAreaType {
  if (!OPERATIONAL_AREA_TYPES.includes(type as OperationalAreaType)) {
    throw new BadRequestException(
      `type must be one of: ${OPERATIONAL_AREA_TYPES.join(', ')}`,
    );
  }
  return type as OperationalAreaType;
}

function normalizePriority(value: number | null | undefined): number | null {
  if (value === null || value === undefined || (value as unknown) === '') return null;
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

function buildCreateData(input: OperationalAreaInput) {
  return {
    code: normalizeAreaCode(requireString(input.code, 'code')),
    name: requireString(input.name, 'name'),
    type: requireValidType(requireString(input.type as string, 'type')),
    city: requireString(input.city, 'city'),
    region: input.region?.trim() || null,
    country: input.country?.trim() || 'Jordan',
    isActive: input.isActive === undefined ? true : Boolean(input.isActive),
    airportRouteFlagDefault: Boolean(input.airportRouteFlagDefault),
    borderCrossingFlagDefault: Boolean(input.borderCrossingFlagDefault),
    mountainRoadFlagDefault: Boolean(input.mountainRoadFlagDefault),
    overnightRiskDefault: Boolean(input.overnightRiskDefault),
    priority: normalizePriority(input.priority),
  };
}

function buildUpdateData(input: Partial<OperationalAreaInput>) {
  const data: Record<string, unknown> = {};
  if (input.code !== undefined) data.code = normalizeAreaCode(requireString(input.code, 'code'));
  if (input.name !== undefined) data.name = requireString(input.name, 'name');
  if (input.type !== undefined) data.type = requireValidType(requireString(input.type as string, 'type'));
  if (input.city !== undefined) data.city = requireString(input.city, 'city');
  if (input.region !== undefined) data.region = input.region?.trim() || null;
  if (input.country !== undefined) data.country = input.country?.trim() || 'Jordan';
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);
  if (input.airportRouteFlagDefault !== undefined) data.airportRouteFlagDefault = Boolean(input.airportRouteFlagDefault);
  if (input.borderCrossingFlagDefault !== undefined) data.borderCrossingFlagDefault = Boolean(input.borderCrossingFlagDefault);
  if (input.mountainRoadFlagDefault !== undefined) data.mountainRoadFlagDefault = Boolean(input.mountainRoadFlagDefault);
  if (input.overnightRiskDefault !== undefined) data.overnightRiskDefault = Boolean(input.overnightRiskDefault);
  if (input.priority !== undefined) data.priority = normalizePriority(input.priority);
  return data;
}

// Best-match preference order when a city has multiple areas (Amman →
// Amman City + QAIA). Keep this in sync with the client-side helper in
// admin-web/.../CanonicalBuilderSection.tsx.
/**
 * Preferred Operational Area Logic (v2C addendum) — pure comparator
 * used by findByCity + all matching helpers. Sort order:
 *   1. Lower `priority` integer wins (NULL = lowest priority → 999)
 *   2. Tie → PREFERRED_TYPE_ORDER (CITY first, AIRPORT last)
 *   3. Tie → alphabetical by name
 *
 * Operators set explicit priorities via /operational-areas: QAIA=1,
 * Marka=2 so QAIA wins for Amman AIRPORT. ALLENBY=1, SHB=2, WAB=3 so
 * Allenby wins for the BORDER type within the same city anchor.
 */
export function compareAreasByPriority<T extends { type: string; name: string; priority?: number | null }>(
  a: T,
  b: T,
): number {
  const pa = a.priority ?? 999;
  const pb = b.priority ?? 999;
  if (pa !== pb) return pa - pb;
  const ta = PREFERRED_TYPE_ORDER.indexOf(a.type as OperationalAreaType);
  const tb = PREFERRED_TYPE_ORDER.indexOf(b.type as OperationalAreaType);
  const taOrd = ta < 0 ? 99 : ta;
  const tbOrd = tb < 0 ? 99 : tb;
  if (taOrd !== tbOrd) return taOrd - tbOrd;
  return a.name.localeCompare(b.name);
}

const PREFERRED_TYPE_ORDER: OperationalAreaType[] = [
  'CITY',
  'TOURISM_SITE',
  'RESORT_AREA',
  'CAMP_AREA',
  'BORDER',
  'HOTEL_ZONE',
  'PORT',
  'AIRPORT',
];

@Injectable()
export class OperationalAreasService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: { onlyActive?: boolean; type?: string; search?: string } = {}) {
    const where: any = {};
    if (filters.onlyActive) where.isActive = true;
    if (filters.type) where.type = filters.type;
    if (filters.search) {
      const term = filters.search.trim();
      if (term) {
        where.OR = [
          { code: { contains: term, mode: 'insensitive' } },
          { name: { contains: term, mode: 'insensitive' } },
          { city: { contains: term, mode: 'insensitive' } },
        ];
      }
    }
    return (this.prisma as any).operationalArea.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { type: 'asc' }, { code: 'asc' }],
    });
  }

  async findOne(id: string) {
    const row = await (this.prisma as any).operationalArea.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Operational area not found');
    return row;
  }

  findByCode(code: string) {
    const normalized = normalizeAreaCode(code);
    if (!normalized) return null;
    return (this.prisma as any).operationalArea.findUnique({ where: { code: normalized } });
  }

  /**
   * Best-match for a city name. When multiple areas anchor to the same
   * city (e.g. Amman → Amman City + QAIA), preference order picks the
   * most operationally-likely one (CITY first, then attractions, then
   * borders/airports). Used by the Route Standard edit page to preselect
   * From/To dropdowns from the row's current fromCity/toCity values.
   */
  async findByCity(city: string, options: { preferType?: OperationalAreaType } = {}) {
    if (!city || !city.trim()) return null;
    const rows = await (this.prisma as any).operationalArea.findMany({
      where: { city: { equals: city.trim(), mode: 'insensitive' }, isActive: true },
    });
    if (!rows.length) return null;
    if (rows.length === 1) return rows[0];

    // Preferred Operational Area Logic — if the caller explicitly
    // asked for a type, surface that type first when present.
    if (options.preferType) {
      const sameTypeRows = (rows as any[]).filter((r) => r.type === options.preferType);
      if (sameTypeRows.length > 0) {
        return sameTypeRows.sort(compareAreasByPriority)[0];
      }
    }

    // Otherwise sort the full candidate set by priority (NULL last),
    // type preference, then alphabetical. QAIA (priority 1) wins over
    // Marka (priority 2) within Amman AIRPORT etc.
    return (rows as any[]).sort(compareAreasByPriority)[0];
  }

  async create(input: OperationalAreaInput) {
    try {
      return await (this.prisma as any).operationalArea.create({ data: buildCreateData(input) });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException(`Operational area code "${normalizeAreaCode(input.code)}" is already in use`);
      }
      throw error;
    }
  }

  async update(id: string, input: Partial<OperationalAreaInput>) {
    await this.findOne(id);
    try {
      return await (this.prisma as any).operationalArea.update({
        where: { id },
        data: buildUpdateData(input),
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException(`Operational area code "${normalizeAreaCode(input.code || '')}" is already in use`);
      }
      throw error;
    }
  }

  async remove(id: string) {
    // Soft-deactivate by default — operational history (Route Standards
    // already referencing this area via fromCity/toCity) stays intact.
    await this.findOne(id);
    return (this.prisma as any).operationalArea.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // -------------------------------------------------------------------------
  // Operational Area Auto-Code Generation & Smart Duplicate Detection v1
  // -------------------------------------------------------------------------

  /**
   * Live preview of the suggested code when an operator types a name +
   * picks a type. Returns alternatives + confidence so the form can:
   *   - auto-fill the Code field (unless operator manually edited it)
   *   - show a green / yellow / red chip
   *   - block save when duplicate (red) — pick an alternative or rename
   *
   * excludeId lets the EDIT form ignore the row it's editing when checking
   * for duplicates (otherwise it'd flag itself).
   *
   * When `manualCode` is provided (operator typed into the Code field
   * directly OR adopted an alternative chip), duplicate detection
   * validates THAT code instead of the auto-generated one. The auto-
   * generated suggestion is still returned so the form can offer
   * ↻ Use suggested.
   */
  async previewAreaCode(input: {
    name: string;
    type?: OperationalAreaType | string;
    excludeId?: string;
    manualCode?: string;
  }) {
    const name = (input.name || '').trim();
    if (!name) {
      return {
        suggestedCode: '',
        alternatives: [] as string[],
        existingMatch: null,
        similarMatch: null,
        confidence: 'empty' as const,
        reason: 'Name is empty.',
        usingManualCode: false,
      };
    }
    const type = (input.type as OperationalAreaType) || undefined;
    const suggestedCode = suggestAreaCodeFromName(name, type);
    const manualCode = input.manualCode ? normalizeAreaCode(input.manualCode) : '';
    // The code we actually validate against the catalog is whichever the
    // operator is about to save: their manual code wins, else the
    // auto-generated one.
    const codeToCheck = manualCode || suggestedCode;
    if (!codeToCheck) {
      return {
        suggestedCode: '',
        alternatives: [] as string[],
        existingMatch: null,
        similarMatch: null,
        confidence: 'empty' as const,
        reason: 'Could not derive a code from the name — type one manually.',
        usingManualCode: false,
      };
    }

    // Hard duplicate: another row already has the exact code.
    const exactMatch = await (this.prisma as any).operationalArea.findUnique({
      where: { code: codeToCheck },
    });
    const conflictsWithSelf = exactMatch && exactMatch.id === input.excludeId;
    const conflictingMatch = exactMatch && !conflictsWithSelf ? exactMatch : null;

    // Soft signal: a similarly-named area already exists. Helps the
    // operator dedupe when they typed "Petra Visitor Center" but the
    // catalog already has a "Petra Visitor Centre" (UK spelling) — the
    // suggested code would differ but the operational identity is the
    // same.
    const similar = !conflictingMatch ? await this.findSimilarAreaByName(name, input.excludeId) : null;

    // Alternatives are seeded from whichever code we're checking
    // (manual or generated) — so adopting an alternative chip swaps to
    // a free alias.
    const alternatives = conflictingMatch ? this.buildAlternativeCodes(codeToCheck, type) : [];
    const availableAlternatives: string[] = [];
    if (alternatives.length > 0) {
      const matches = await (this.prisma as any).operationalArea.findMany({
        where: { code: { in: alternatives } },
        select: { code: true },
      });
      const taken = new Set<string>((matches as any[]).map((m) => m.code));
      for (const alt of alternatives) {
        if (!taken.has(alt)) availableAlternatives.push(alt);
      }
    }

    const confidence: 'unique' | 'similar_exists' | 'duplicate' = conflictingMatch
      ? 'duplicate'
      : similar
        ? 'similar_exists'
        : 'unique';

    return {
      // suggestedCode = the auto-generated suggestion (drives the
      // "↻ Use suggested" button + the auto-fill behaviour). Never
      // changes based on manualCode.
      suggestedCode,
      // The code we actually validated. When the operator manually
      // typed AQS, this is AQS — the chip / alternatives / reason all
      // describe AQS's situation, not AQJ's.
      checkedCode: codeToCheck,
      usingManualCode: Boolean(manualCode && manualCode !== suggestedCode),
      alternatives: availableAlternatives,
      existingMatch: conflictingMatch
        ? {
            id: conflictingMatch.id,
            code: conflictingMatch.code,
            name: conflictingMatch.name,
            type: conflictingMatch.type,
            city: conflictingMatch.city,
            isActive: conflictingMatch.isActive,
          }
        : null,
      similarMatch: similar
        ? {
            id: similar.id,
            code: similar.code,
            name: similar.name,
            type: similar.type,
            city: similar.city,
          }
        : null,
      confidence,
      reason:
        confidence === 'duplicate'
          ? `Code ${codeToCheck} is already in use by ${conflictingMatch?.name} (${conflictingMatch?.code}). Pick an alternative or rename.`
          : confidence === 'similar_exists'
            ? `A similarly-named area already exists: ${similar?.name} (${similar?.code}). Verify this isn't a duplicate operational identity before creating.`
            : 'Unique and safe.',
    };
  }

  /**
   * Build type-aware alternative codes when the base code collides.
   * Examples (per spec):
   *   - AQJ + PORT      -> AQJ_PORT
   *   - AQJ + AIRPORT   -> AQJ_ARP
   *   - AMM + CITY      -> AMM_CITY (rare; usually CITY is the canonical)
   *   - any -> base_2, base_3 numeric fallbacks
   */
  private buildAlternativeCodes(baseCode: string, type?: OperationalAreaType | string): string[] {
    const out: string[] = [];
    const typeSuffix: Record<string, string> = {
      AIRPORT: '_ARP',
      PORT: '_PORT',
      BORDER: '_BRD',
      HOTEL_ZONE: '_HTL',
      TOURISM_SITE: '_SITE',
      CAMP_AREA: '_CAMP',
      RESORT_AREA: '_RES',
      CITY: '_CITY',
    };
    if (type && typeSuffix[type]) {
      out.push(`${baseCode}${typeSuffix[type]}`);
    }
    // Numeric fallbacks
    out.push(`${baseCode}_2`);
    out.push(`${baseCode}_3`);
    return out;
  }

  /**
   * Find an existing area whose name strongly resembles the candidate.
   * Used by the live form (yellow "similar exists" warning) and by future
   * import-normalization paths. "Strong" = sharing at least one
   * significant token after filler-word stripping, OR same city + similar
   * type. Returns the first reasonable match or null.
   */
  async findSimilarAreaByName(candidateName: string, excludeId?: string) {
    if (!candidateName || !candidateName.trim()) return null;
    const candidateTokens = extractSignificantTokens(candidateName);
    if (candidateTokens.length === 0) return null;
    const all = await (this.prisma as any).operationalArea.findMany({
      where: { isActive: true },
    });
    let bestScore = 0;
    let bestMatch: any = null;
    for (const row of all as any[]) {
      if (excludeId && row.id === excludeId) continue;
      const rowTokens = extractSignificantTokens(row.name || '');
      const overlap = candidateTokens.filter((t) => rowTokens.includes(t)).length;
      if (overlap === 0) continue;
      // Score: token overlap, weighted by token count (longer names that
      // share most tokens win over shorter names sharing one token).
      const score = overlap / Math.max(candidateTokens.length, rowTokens.length);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = row;
      }
    }
    // Threshold: need at least 50% token overlap to be called "similar".
    return bestScore >= 0.5 ? bestMatch : null;
  }
}

// ---------------------------------------------------------------------------
// Pure helpers — exported so the controller can preview without DB access
// and so tests can exercise the algorithm directly.
// ---------------------------------------------------------------------------

/**
 * Filler words the auto-code generator strips before deriving the code.
 * These don't carry operational identity — they describe the *kind* of
 * place, not its identity. "Petra Visitor Center" and "Petra" should both
 * canonicalize to PET; only the leading identity word matters.
 */
const FILLER_WORDS = new Set<string>([
  'the',
  'of',
  'and',
  'a',
  'an',
  // Type descriptors per spec
  'visitor',
  'center',
  'centre',
  'area',
  'resort',
  'resorts',
  'international',
  'airport',
  'city',
  'camp',
  'archaeological',
  'site',
  // Operational fillers we've seen in bootstrap codes
  'jordan',
  'royal',
  'historical',
  'castle',
  'bridge',
  'border',
  'crossing',
  'main',
  'central',
  'north',
  'south',
  'east',
  'west',
]);

/**
 * Known compound aliases that beat the generic token-extraction algorithm.
 * "Wadi Rum" → WR (not WAD_RUM); "Queen Alia" → QAIA (IATA-style); etc.
 * Keys are normalized lowercase forms; lookup is case-insensitive.
 */
const KNOWN_COMPOUND_ALIASES: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /\bqueen\s+alia\b/i, code: 'QAIA' },
  { pattern: /\bking\s+hussein\s+international/i, code: 'AQJ' }, // Aqaba airport
  { pattern: /\bking\s+hussein\s+bridge\b|\ballenby\s+bridge\b|\ballenby\b/i, code: 'ALLENBY' },
  { pattern: /\bsheikh\s+hussein\b/i, code: 'SHB' },
  { pattern: /\bwadi\s+araba\b/i, code: 'WAB' },
  { pattern: /\bwadi\s+rum\b/i, code: 'WR' },
  { pattern: /\bwadi\s+musa\b/i, code: 'WM' },
  { pattern: /\bdead\s+sea\b/i, code: 'DS' },
  { pattern: /\bmount\s+nebo\b/i, code: 'NEB' },
  { pattern: /\bumm\s+qais\b/i, code: 'UMQ' },
];

/** Extract the significant (non-filler) lowercase tokens from a name. */
export function extractSignificantTokens(name: string): string[] {
  const cleaned = String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return [];
  return cleaned.split(' ').filter((tok) => tok && !FILLER_WORDS.has(tok));
}

/**
 * Generate a canonical operational-area code from a place name.
 *
 * Algorithm:
 *   1. Try known compound aliases (Wadi Rum → WR, etc.). First hit wins.
 *   2. Strip filler words; keep significant tokens.
 *   3. Pick the first significant token → first 3 letters uppercased.
 *      (Madaba → MAD, Petra → PET, Jerash → JER, Aqaba → AQJ — wait,
 *      Aqaba's first 3 are AQA, not AQJ. AQJ is the IATA code.)
 *   4. Special override for cities whose codes are IATA-based: handled
 *      via KNOWN_COMPOUND_ALIASES or by spec convention.
 *
 * Returns '' when no significant token can be extracted (caller should
 * ask the operator to type the code manually).
 */
export function suggestAreaCodeFromName(
  name: string,
  type?: OperationalAreaType | string,
): string {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '';

  // 1. Known compound aliases first.
  for (const { pattern, code } of KNOWN_COMPOUND_ALIASES) {
    if (pattern.test(trimmed)) return code;
  }

  // 2. Special-case Aqaba — operationally IATA-coded (AQJ) regardless
  //    of whether the name says "Aqaba City" or "Aqaba".
  if (/\baqaba\b/i.test(trimmed)) {
    // Spec: PORT type uses AQJ_PORT to distinguish from AQJ city/airport
    if ((type as string) === 'PORT') return 'AQJ_PORT';
    return 'AQJ';
  }

  // 3. Generic token extraction.
  const tokens = extractSignificantTokens(trimmed);
  if (tokens.length === 0) return '';

  // 4. Single-token names → first 3 letters of that token (Petra→PET,
  //    Madaba→MAD, Jerash→JER, Ajloun→AJL, Karak→KRK, Irbid→IRB, Salt→SLT).
  if (tokens.length === 1) {
    return tokens[0].slice(0, 3).toUpperCase();
  }

  // 5. Multi-token names → initials of the first 2-3 tokens, capped
  //    at 4 chars. Tuned for things like "King Talal Airport" → KTA,
  //    "Royal Tomb Garden" → would have all filler stripped → tokens
  //    would be ['tomb','garden'] → TG, but that's rare in practice.
  //    Most real names collapse to a single significant token after
  //    filler stripping (the compound aliases above catch the rest).
  const initials = tokens.slice(0, 4).map((t) => t[0].toUpperCase()).join('');
  if (initials.length >= 3) return initials;

  // Fallback: first 3 chars of the first significant token.
  return tokens[0].slice(0, 3).toUpperCase();
}
