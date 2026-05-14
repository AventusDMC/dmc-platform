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

export function formatOriginAwareExcursionName(input: OriginAwareExcursionInput) {
  const templateName =
    input.templateName?.trim() ||
    getExcursionTemplateNameFromOverrideReason(input.overrideReason) ||
    input.serviceName?.trim() ||
    input.touringRoute?.name?.trim() ||
    '';
  const originCity =
    input.originCity?.trim() ||
    input.touringRoute?.startCity?.trim() ||
    getExcursionOriginFromOverrideReason(input.overrideReason);

  if (templateName && originCity) {
    return `${templateName} — From ${originCity}`;
  }

  return templateName || input.touringRoute?.name?.trim() || 'Excursion details pending';
}
