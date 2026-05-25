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

export function getExcursionOriginFromOverrideReason(value?: string | null) {
  const match = String(value || '').match(/Origin:\s*([^|]+)/i);
  return match?.[1]?.trim() || '';
}

/**
 * Detect a code-shaped string so we can humanize it for client-facing
 * rendering rather than expose the operational code. Mirrors the
 * admin-web helper.
 */
function isCodeShapedName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[A-Z0-9][A-Z0-9_\-\s]*$/.test(trimmed) && /[_\-]/.test(trimmed);
}

function humanizeCodeName(rawCode: string, originCity?: string | null): string {
  let working = rawCode.trim();
  working = working.replace(/^JOR[\-_]TR[\-_][A-Z]+[\-_]/, '');
  working = working.replace(/[\-_]ON$/, ' Overnight').replace(/[\-_]RT$/, ' Round Trip').replace(/[\-_]OW$/, ' One Way');
  working = working.replace(/[_\-]+/g, ' ').trim();
  if (originCity) {
    const originPattern = new RegExp(`\\s+${originCity.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}$`, 'i');
    working = working.replace(originPattern, '');
  }
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
  const originCity =
    input.originCity?.trim() ||
    input.touringRoute?.startCity?.trim() ||
    getExcursionOriginFromOverrideReason(input.overrideReason);

  // Humanize code-shaped template names. This closes the perceived
  // "duplicate operational codes" problem in exports — the second token
  // was always a code-shaped template name passed through unchanged, NOT
  // a second route code. We keep ONE operational code (touringRoute.code,
  // rendered separately by the voucher snapshot) and surface the template
  // as a humanized commercial label here.
  const templateName = isCodeShapedName(rawTemplateName)
    ? humanizeCodeName(rawTemplateName, originCity) || rawTemplateName
    : rawTemplateName;

  if (templateName && originCity) {
    return `${templateName} — From ${originCity}`;
  }

  return templateName || input.touringRoute?.name?.trim() || 'Excursion details pending';
}
