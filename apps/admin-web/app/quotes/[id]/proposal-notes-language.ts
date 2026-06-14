// Phase P.3X-5E-2.1 — conservative, advisory notes-language mismatch detector for
// the proposal export UI. PURE + deterministic; no network, no AI, no translation.
//
// It answers one question: "the operator is about to export a non-English proposal —
// do the visible day notes still look English (or, for Arabic, non-Arabic)?" It is
// intentionally conservative (a heuristic, never a guarantee) and is used ONLY to
// show a non-blocking advisory. English selection never warns; empty notes never warn.

export type ProposalLanguageInput = string | null | undefined;

// Arabic Unicode block (same range the Route Planner R.7B-5B hint uses).
const ARABIC_SCRIPT = /[؀-ۿ]/;

// High-confidence English operational PHRASES — any single match is enough.
const STRONG_ENGLISH_PHRASES: RegExp[] = [
  /\bmeet\s*&\s*assist\b/i,
  /\bmeet and assist\b/i,
  /\bovernight in\b/i,
  /\btransfer\s+(?:to|from)\b/i,
  /\bcontinue to\b/i,
  /\bat leisure\b/i,
  /\bdeparture flight\b/i,
];

// Single English operational MARKERS — need at least two DISTINCT ones to fire,
// so a lone "Visit Petra" (a localized note keeping an English proper name) does not
// trip the warning. Word-boundaried so Spanish "Visita"/"noche" never match.
const ENGLISH_MARKERS: RegExp[] = [
  /\bovernight\b/i,
  /\btransfer\b/i,
  /\barrival\b/i,
  /\bdeparture\b/i,
  /\bbreakfast\b/i,
  /\bvisit\b/i,
  /\bcontinue\b/i,
  /\bleisure\b/i,
];

function isWarnableLanguage(language: ProposalLanguageInput): language is 'es' | 'pt' | 'ar' {
  return language === 'es' || language === 'pt' || language === 'ar';
}

/**
 * True when a non-English proposal is being exported and the visible day notes
 * likely don't match that language. English (or any non-es/pt/ar) → always false.
 * Empty notes → false.
 */
export function detectNotesLanguageMismatch(notes: Array<string | null | undefined>, language: ProposalLanguageInput): boolean {
  if (!isWarnableLanguage(language)) return false;

  const texts = (notes || []).map((note) => String(note ?? '').trim()).filter(Boolean);
  if (texts.length === 0) return false;
  const combined = texts.join('\n');

  if (language === 'ar') {
    // Arabic export: warn when the notes carry Latin letters but no Arabic script.
    const hasArabic = ARABIC_SCRIPT.test(combined);
    const hasLatin = /[A-Za-z]/.test(combined);
    return hasLatin && !hasArabic;
  }

  // Spanish / Portuguese export: conservative English-prose detection.
  if (STRONG_ENGLISH_PHRASES.some((pattern) => pattern.test(combined))) return true;
  const distinctMarkers = ENGLISH_MARKERS.filter((pattern) => pattern.test(combined)).length;
  return distinctMarkers >= 2;
}

/** English display name for the warning copy (es → Spanish, etc.). */
export function proposalLanguageEnglishName(language: ProposalLanguageInput): string {
  switch (language) {
    case 'es':
      return 'Spanish';
    case 'pt':
      return 'Portuguese';
    case 'ar':
      return 'Arabic';
    default:
      return 'English';
  }
}
