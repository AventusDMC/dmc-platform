export type OriginAwareExcursionInput = {
  serviceName?: string | null;
  templateName?: string | null;
  overrideReason?: string | null;
  originCity?: string | null;
  touringRoute?: {
    name?: string | null;
    startCity?: string | null;
  } | null;
};

export function getExcursionTemplateNameFromOverrideReason(value?: string | null) {
  const match = String(value || '').match(/Excursion template:\s*([^|]+)/i);
  return match?.[1]?.trim() || '';
}

/**
 * Detect a code-shaped string (all caps, underscores, digits) so we can
 * humanize it into a commercial label rather than render it as if it were
 * a presentable name. Closes the "AMM_PET / PETRA_FULL_DAY_AMMAN" duplicate-
 * codes problem in exports: the second token was always a code-shaped
 * template name being passed through unchanged, NOT a second route code.
 */
function isCodeShapedName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Pure code shape: ALL_CAPS_WITH_UNDERSCORES_OR_DASHES_AND_DIGITS
  return /^[A-Z0-9][A-Z0-9_\-\s]*$/.test(trimmed) && /[_\-]/.test(trimmed);
}

/**
 * Convert a code-shaped string into a commercial label.
 * "PETRA_FULL_DAY_AMMAN" + originCity "Amman" -> "Petra Full Day"
 * "JOR-TR-SOUTH-AMMAN-PETRA-ON" + originCity "Amman" -> "Amman Petra Overnight"
 * Strips canonical prefixes (JOR-TR-{REGION}-), drops the originCity tail if
 * it matches the operator's origin selection, expands type suffixes
 * (-ON -> Overnight, -RT -> Round Trip, -OW -> One Way), and title-cases.
 */
function humanizeCodeName(rawCode: string, originCity?: string | null): string {
  let working = rawCode.trim();
  // Strip canonical "JOR-TR-{REGION}-" prefix (region = NORTH/SOUTH/CENTRAL/
  // ISLAMIC/LAYOVER/AQABA/etc).
  working = working.replace(/^JOR[\-_]TR[\-_][A-Z]+[\-_]/, '');
  // Expand type suffixes.
  working = working.replace(/[\-_]ON$/, ' Overnight').replace(/[\-_]RT$/, ' Round Trip').replace(/[\-_]OW$/, ' One Way');
  // Normalize separators to spaces.
  working = working.replace(/[_\-]+/g, ' ').trim();
  // Drop trailing originCity if redundant ("Petra Full Day Amman" + origin
  // "Amman" -> "Petra Full Day").
  if (originCity) {
    const originPattern = new RegExp(`\\s+${originCity.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}$`, 'i');
    working = working.replace(originPattern, '');
  }
  // Title-case each word.
  return working
    .toLowerCase()
    .split(/\s+/)
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : ''))
    .join(' ')
    .trim();
}

export function formatOriginAwareExcursionName(input: OriginAwareExcursionInput) {
  const rawTemplateName =
    input.templateName?.trim() ||
    getExcursionTemplateNameFromOverrideReason(input.overrideReason) ||
    input.serviceName?.trim() ||
    input.touringRoute?.name?.trim() ||
    '';
  const originCity = input.originCity?.trim() || input.touringRoute?.startCity?.trim() || '';

  // Humanize code-shaped template names so an excursion seeded with
  // name="PETRA_FULL_DAY_AMMAN" renders as "Petra Full Day — From Amman"
  // instead of looking like a second route code next to touringRoute.code.
  const templateName = isCodeShapedName(rawTemplateName)
    ? humanizeCodeName(rawTemplateName, originCity) || rawTemplateName
    : rawTemplateName;

  if (templateName && originCity) {
    return `${templateName} — From ${originCity}`;
  }

  return templateName || input.touringRoute?.name?.trim() || 'Excursion details pending';
}

export function getQuoteItemOriginAwareExcursionName(item: OriginAwareExcursionInput) {
  return formatOriginAwareExcursionName({
    serviceName: item.serviceName,
    overrideReason: item.overrideReason,
    touringRoute: item.touringRoute,
  });
}
