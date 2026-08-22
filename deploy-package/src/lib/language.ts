/** Shared language detection for STT, TTS, and tutor replies.
 *  Script ranges come first; Hinglish / romanised Indian languages are
 *  recognised from common function words so Latin-script speech is not
 *  forced into English. */

export type LangTag =
  | "en-IN" | "hi-IN" | "mr-IN" | "bn-IN" | "ta-IN" | "te-IN" | "kn-IN"
  | "ml-IN" | "gu-IN" | "pa-IN" | "or-IN" | "ur-PK" | "ar-XA" | "ne-NP"
  | "es-ES" | "fr-FR" | "de-DE" | "pt-BR" | "it-IT" | "ru-RU" | "zh-CN"
  | "ja-JP" | "ko-KR" | "th-TH" | "id-ID" | "tr-TR";

export type LangInfo = {
  code: string;
  bcp: LangTag;
  /** Unicode script range. Empty for Latin-only languages. */
  range?: RegExp;
};

export const LANGS: LangInfo[] = [
  { code: "hi", bcp: "hi-IN", range: /[\u0900-\u097F]/ },
  { code: "mr", bcp: "mr-IN", range: /[\u0900-\u097F]/ },
  { code: "ne", bcp: "ne-NP", range: /[\u0900-\u097F]/ },
  { code: "bn", bcp: "bn-IN", range: /[\u0980-\u09FF]/ },
  { code: "pa", bcp: "pa-IN", range: /[\u0A00-\u0A7F]/ },
  { code: "gu", bcp: "gu-IN", range: /[\u0A80-\u0AFF]/ },
  { code: "or", bcp: "or-IN", range: /[\u0B00-\u0B7F]/ },
  { code: "ta", bcp: "ta-IN", range: /[\u0B80-\u0BFF]/ },
  { code: "te", bcp: "te-IN", range: /[\u0C00-\u0C7F]/ },
  { code: "kn", bcp: "kn-IN", range: /[\u0C80-\u0CFF]/ },
  { code: "ml", bcp: "ml-IN", range: /[\u0D00-\u0D7F]/ },
  { code: "ur", bcp: "ur-PK", range: /[\u0600-\u06FF]/ },
  { code: "ar", bcp: "ar-XA", range: /[\u0600-\u06FF]/ },
  { code: "ru", bcp: "ru-RU", range: /[\u0400-\u04FF]/ },
  { code: "zh", bcp: "zh-CN", range: /[\u4E00-\u9FFF]/ },
  { code: "ja", bcp: "ja-JP", range: /[\u3040-\u30FF]/ },
  { code: "ko", bcp: "ko-KR", range: /[\uAC00-\uD7AF]/ },
  { code: "th", bcp: "th-TH", range: /[\u0E00-\u0E7F]/ },
  { code: "es", bcp: "es-ES" },
  { code: "fr", bcp: "fr-FR" },
  { code: "de", bcp: "de-DE" },
  { code: "pt", bcp: "pt-BR" },
  { code: "it", bcp: "it-IT" },
  { code: "id", bcp: "id-ID" },
  { code: "tr", bcp: "tr-TR" },
  { code: "en", bcp: "en-IN" },
];

const MARATHI_MARKERS = /[ळऱ]|(\b(मी|आहे|आहेत|तुम्ही|तुमचा|अभ्यास|करू|शकते|शकतो|आम्ही)\b)/;
const NEPALI_MARKERS = /(\b(हो|छु|छौं|तपाईं|पढाइ|सक्छु|मद्दत)\b)/;
const URDU_MARKERS = /[\u0679\u067E\u0686\u0688\u0691\u0698\u06A9\u06AF\u06BE\u06C1-\u06C3\u06CC\u06D2\u06BA]/;
// Latin-script Hindi is deliberately not used for automatic locale switching.
// Ambiguous words such as "hai", "kal", "do", and "please" occur in ordinary
// English, names, and technical prose. Hinglish commands remain supported by
// the command parser, but locale selection requires an actual script signal.
const MARATHI_LATIN = /\b(ahe|aahe|tumhi|maza|majha|abhyas|kasa|kashi|kay)\b/i;
const SPANISH_LATIN = /\b(qué|que|cómo|como|estoy|hola|gracias|puedes|ayuda|estudios)\b/i;
const FRENCH_LATIN = /\b(quoi|comment|bonjour|merci|peux|aider|études|etudes)\b/i;

export function scriptHits(text: string, range: RegExp): number {
  return text.match(range)?.length || 0;
}

/** Best BCP-47 tag for a reply or transcript. Defaults to Indian English. */
export function detectLanguage(text: string): LangTag {
  const sample = text.slice(0, 4000);
  const devanagari = scriptHits(sample, /[\u0900-\u097F]/g);
  const arabic = scriptHits(sample, /[\u0600-\u06FF]/g);

  if (devanagari >= 3) {
    if (MARATHI_MARKERS.test(sample)) return "mr-IN";
    if (NEPALI_MARKERS.test(sample)) return "ne-NP";
    return "hi-IN";
  }
  if (arabic >= 3) return URDU_MARKERS.test(sample) ? "ur-PK" : "ar-XA";

  let best: { tag: LangTag; count: number } = { tag: "en-IN", count: 0 };
  for (const lang of LANGS) {
    if (!lang.range || lang.code === "hi" || lang.code === "mr" || lang.code === "ne" || lang.code === "ur" || lang.code === "ar") continue;
    const count = scriptHits(sample, new RegExp(lang.range.source, "g"));
    if (count > best.count) best = { tag: lang.bcp, count };
  }
  if (best.count >= 3) return best.tag;

  // Never guess an Indian language from Latin text. This prevents a single
  // ambiguous English word from pinning the microphone to Hindi. Hinglish is
  // handled conversationally by the tutor prompt, not as a locale guess.
  if (MARATHI_LATIN.test(sample) && /\b(aahe|tumhi|abhyas)\b/i.test(sample)) return "mr-IN";
  if (SPANISH_LATIN.test(sample) && /[áéíóúñ¿¡]/i.test(sample)) return "es-ES";
  if (FRENCH_LATIN.test(sample) && /[àâçéèêëîïôùûü]/i.test(sample)) return "fr-FR";
  return "en-IN";
}

export function isMostlyEnglish(text: string): boolean {
  const tag = detectLanguage(text);
  return tag === "en-IN";
}

export function bcpForCode(code: string): LangTag {
  return LANGS.find((lang) => lang.code === code)?.bcp || "en-IN";
}

export function shortLang(tag: string): string {
  return tag.slice(0, 2);
}
