/* Keyless knowledge retrieval used by the SHIGUN tutor when no LLM key is set.
   Runs server-side only.
   Multilingual: a question written in an Indic/Arabic/East-Asian script is
   looked up on that language's Wikipedia, and the lesson is structured with
   headers in that language — so the voice tutor's local fallback is actually
   useful to Hindi/Bengali/Tamil/... learners, not just English speakers. */

import { detectLanguage, LANGS } from "./language";

const UA = "StudyPlannerPro/1.0 (educational study planner)";

async function jget<T>(url: string, ms = 3500): Promise<T | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(ms),
      headers: { "user-agent": UA, accept: "application/json" },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

const STOP = new Set([
  // English question words & fillers
  "what", "whats", "is", "are", "the", "a", "an", "of", "in", "on", "to", "for", "and", "or",
  "explain", "define", "definition", "describe", "tell", "me", "about", "how", "does", "do",
  "did", "can", "you", "please", "give", "why", "when", "which", "with", "that", "this", "it",
  "i", "my", "concept", "topic", "meaning", "means", "simple", "words", "short", "notes",
  "difference", "between", "help", "understand", "understanding", "study", "learn", "teach",
  // Hindi / Marathi / Nepali (Devanagari)
  "क्या", "है", "हैं", "और", "में", "का", "की", "के", "को", "से", "पर", "यह", "वह", "कैसे", "कब",
  "कौन", "किस", "बताओ", "बताइए", "समझाओ", "समझाइए", "करो", "करें", "मतलब", "अर्थ", "के बारे में",
  "विषय", "शब्दों", "आसान", "नोट्स", "क्या है",
  "मी", "आहे", "आहेत", "तुम्ही", "काय", "कसे", "करा", "सांगा", "समजावून", // Marathi
  "हो", "छु", "तपाईं", "कसरी", "के", "बारे", "मा", // Nepali
  // Bengali
  "কী", "কি", "কিভাবে", "কেমন", "কখন", "কেন", "কোন", "ব্যাখ্যা", "করো", "বলো", "মানে", "সম্বন্ধে",
  "আছে", "আর", "এবং", "একটি", "এই", "সে",
  // Tamil
  "என்ன", "எப்படி", "ஏன்", "எப்போது", "எந்த", "விளக்கு", "சொல்", "பொருள்", "பற்றி", "உள்ளது",
  "இருக்கிறது", "மற்றும்", "ஒரு", "இது", "அது",
  // Telugu
  "ఏమిటి", "ఎలా", "ఎందుకు", "ఎప్పుడు", "ఏ", "వివరించు", "చెప్పు", "అర్థం", "గురించి", "ఉంది",
  "మరియు", "ఒక", "ఇది", "అది",
  // Kannada
  "ಏನು", "ಹೇಗೆ", "ಯಾಕೆ", "ಯಾವಾಗ", "ಯಾವ", "ವಿವರಿಸು", "ಹೇಳು", "ಅರ್ಥ", "ಬಗ್ಗೆ", "ಇದೆ", "ಮತ್ತು",
  "ಒಂದು", "ಇದು", "ಅದು",
  // Malayalam
  "എന്ത്", "എങ്ങനെ", "എന്തുകൊണ്ട്", "എപ്പോൾ", "ഏത്", "വിശദീകരിക്കുക", "പറയുക", "അർത്ഥം",
  "കുറിച്ച്", "ഉണ്ട്", "ഒരു", "ഇത്", "അത്",
  // Gujarati
  "શું", "કેવી", "કેવું", "કેમ", "ક્યારે", "કયું", "સમજાવો", "કહો", "અર્થ", "વિશે", "છે",
  "અને", "એક", "આ", "તે",
  // Punjabi
  "ਕੀ", "ਕਿਵੇਂ", "ਕਿਉਂ", "ਕਦੋਂ", "ਕਿਹੜਾ", "ਸਮਝਾਓ", "ਦੱਸੋ", "ਮਤਲਬ", "ਬਾਰੇ", "ਹੈ", "ਅਤੇ", "ਇੱਕ",
  "ਇਹ", "ਉਹ",
  // Odia
  "କଣ", "କେମିତି", "କାହିଁକି", "କେବେ", "କେଉଁ", "ବୁଝାଅ", "କୁହ", "ଅର୍ଥ", "ବିଷୟରେ", "ଅଛି", "ଏବଂ",
  "ଏକ", "ଏହା", "ସେହି",
  // Urdu
  "کیا", "کیسے", "کیوں", "کب", "کون", "کس", "سمجھاؤ", "بتاؤ", "مطلب", "کے بارے میں", "ہے", "اور",
  "ایک", "یہ", "وہ",
  // Arabic
  "ما", "ماذا", "كيف", "لماذا", "متى", "أي", "اشرح", "قل", "معنى", "عن", "هو", "هي", "و", "في",
  "على", "من", "إلى",
]);

/** Wikipedia language code for a question's script (defaults to "en"). */
export function wikiLangFor(question: string): string {
  const tag = detectLanguage(question);
  const code = tag.slice(0, 2);
  if (code === "en") return "en";
  const lang = LANGS.find((l) => l.code === code);
  if (!lang) return "en";
  // Only route to a wiki domain we know exists and can answer with.
  const WIKI_LANGS = new Set([
    "hi", "mr", "ne", "bn", "pa", "gu", "or", "ta", "te", "kn", "ml", "ur", "ar",
    "ru", "zh", "ja", "ko", "th", "es", "fr", "de", "pt", "it", "id", "tr",
  ]);
  return WIKI_LANGS.has(code) ? code : "en";
}

export function searchTerms(q: string): string {
  const cleaned = q
    .toLowerCase()
    .replace(/[?!.,;:"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter((w) => w.length > 1 && !STOP.has(w));
  return (words.length ? words : cleaned.split(" ")).slice(0, 8).join(" ");
}

export type Knowledge = {
  title: string;
  extract: string;
  url: string;
  related: string[];
  /** Wikipedia language the extract came from ("en", "hi", "bn", ...). */
  lang: string;
};

type WikiSearch = { query?: { search?: { title: string; pageid: number }[] } };
type WikiSummary = {
  title?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
  type?: string;
};
type WikiExtract = {
  query?: { pages?: Record<string, { title?: string; extract?: string; pageid?: number }> };
};

async function searchAndExtract(lang: string, term: string): Promise<Knowledge | null> {
  const host = lang === "en" ? "en.wikipedia.org" : `${lang}.wikipedia.org`;
  const search = await jget<WikiSearch>(
    `https://${host}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
      term
    )}&srlimit=4&format=json&origin=*`
  );
  const hits = search?.query?.search || [];
  if (!hits.length) return null;

  const best = hits[0];
  const ex = await jget<WikiExtract>(
    `https://${host}/w/api.php?action=query&prop=extracts&explaintext=1&exintro=0&exchars=2400&pageids=${best.pageid}&format=json&origin=*`
  );
  let extract = "";
  const pages = ex?.query?.pages;
  if (pages) {
    const first = Object.values(pages)[0];
    extract = (first?.extract || "").trim();
  }
  if (!extract) {
    const sum = await jget<WikiSummary>(
      `https://${host}/api/rest_v1/page/summary/${encodeURIComponent(best.title.replace(/ /g, "_"))}`
    );
    extract = (sum?.extract || "").trim();
  }
  if (!extract || extract.length < 60) return null;

  return {
    title: best.title,
    extract,
    url: `https://${host}/wiki/${encodeURIComponent(best.title.replace(/ /g, "_"))}`,
    related: hits.slice(1, 4).map((h) => h.title),
    lang,
  };
}

/** True when the encyclopedia hit is actually about the asked topic, not a
 *  loosely related article that happened to share one common word. */
export function isRelevantKnowledge(k: Knowledge, question: string): boolean {
  const term = searchTerms(question).toLowerCase();
  if (!term) return false;
  const title = k.title.toLowerCase();
  const extract = k.extract.toLowerCase();
  const words = term.split(/\s+/).filter((word) => word.length >= 3);
  if (!words.length) {
    return title.includes(term) || extract.slice(0, 400).includes(term);
  }
  if (words.length === 1) {
    return title.includes(words[0]) || extract.slice(0, 600).includes(words[0]);
  }
  const hits = words.filter((word) => title.includes(word) || extract.slice(0, 800).includes(word));
  return hits.length >= Math.min(2, words.length);
}

/** Search Wikipedia (in the question's language, falling back to English)
 *  and return a rich extract for the best matching article. */
export async function lookupKnowledge(question: string): Promise<Knowledge | null> {
  const term = searchTerms(question);
  if (!term) return null;

  const lang = wikiLangFor(question);
  const found = await searchAndExtract(lang, term);
  if (found && isRelevantKnowledge(found, question)) return found;

  // Some technical topics only exist (or are far richer) on the English wiki.
  // A non-English learner still gets a useful, correctly structured lesson —
  // the bilingual lesson headers below stay in their language.
  if (lang === "en") return null;
  const english = await searchAndExtract("en", term);
  return english && isRelevantKnowledge(english, question) ? english : null;
}

function sentences(text: string): string[] {
  return text
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?।॥])\s+(?=[\p{L}\p{N}])/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 25);
}

/** Pull the most information-dense sentences (definitions, causes, mechanisms). */
function keySentences(all: string[], max: number): string[] {
  const scored = all.map((s) => {
    let score = 0;
    if (/\bis\b|\bare\b|\brefers to\b|\bdefined as\b|\bmeans\b/.test(s)) score += 3;
    if (/\bbecause\b|\bcauses?\b|\bresults? in\b|\bleads? to\b|\bdue to\b/.test(s)) score += 2;
    if (/\bconsists? of\b|\bcomprises?\b|\bincludes?\b|\btypes?\b|\bcategor/.test(s)) score += 2;
    if (/\d/.test(s)) score += 1;
    if (s.length > 200) score -= 1;
    return { s, score };
  });
  return scored.sort((a, b) => b.score - a.score).slice(0, max).map((x) => x.s);
}

/** Bilingual lesson-structure headers for the languages the tutor supports.
 *  Keeps the DEFINITION/MECHANISM/EXAM/MISTAKES/SELFTEST structure identical
 *  to the English version while the extract itself stays in the learner's
 *  language, so TTS reads the whole answer in one consistent voice. */
const HEADERS: Record<string, {
  oneLine: string; definition: string; whyMatters: string; howWorks: string;
  keyMechanisms: string; examAngle: string; watchOut: string; testNow: string;
  explainInOne: string; exampleNonExample: string; solveOne: string; nameLimitation: string;
  studyNext: string; askMe: string; reference: string;
}> = {
  en: {
    oneLine: "**In one line:**", definition: "**Definition.**", whyMatters: "**Why it matters.**",
    howWorks: "**How it actually works**", keyMechanisms: "**Key mechanisms & structure**",
    examAngle: "**Exam angle**", watchOut: "**Watch out**", testNow: "**Test yourself now**",
    explainInOne: "Explain it in one sentence without looking.", exampleNonExample: "Give one example and one non-example.",
    solveOne: "Solve one question that uses this.",
    nameLimitation: "Name one limitation and a source that addresses it.",
    studyNext: "**Study next:**", askMe: "Explain", reference: "**Source:**",
  },
  hi: {
    oneLine: "**एक पंक्ति में:**", definition: "**परिभाषा.**", whyMatters: "**यह क्यों ज़रूरी है.**",
    howWorks: "**यह वास्तव में कैसे काम करता है**", keyMechanisms: "**मुख्य तंत्र और संरचना**",
    examAngle: "**परीक्षा का नज़रिया**", watchOut: "**ध्यान रखें**", testNow: "**अब स्वयं को जाँचें**",
    explainInOne: "बिना देखे एक वाक्य में समझाइए।", exampleNonExample: "एक उदाहरण और एक गैर-उदाहरण दीजिए।",
    solveOne: "एक प्रश्न हल कीजिए जो इसका उपयोग करता है।",
    nameLimitation: "एक सीमा और उसे संबोधित करने वाला स्रोत बताइए।",
    studyNext: "**आगे पढ़ें:**", askMe: "समझाइए", reference: "**स्रोत:**",
  },
  bn: {
    oneLine: "**এক লাইনে:**", definition: "**সংজ্ঞা.**", whyMatters: "**কেন এটি গুরুত্বপূর্ণ.**",
    howWorks: "**এটি আসলে কীভাবে কাজ করে**", keyMechanisms: "**মূল প্রক্রিয়া ও গঠন**",
    examAngle: "**পরীক্ষার দৃষ্টিকোণ**", watchOut: "**সতর্ক থাকুন**", testNow: "**এখন নিজেকে যাচাই করুন**",
    explainInOne: "না দেখে এক বাক্যে ব্যাখ্যা করুন।", exampleNonExample: "একটি উদাহরণ এবং একটি অ-উদাহরণ দিন।",
    solveOne: "এটি ব্যবহার করে একটি প্রশ্ন সমাধান করুন।",
    nameLimitation: "একটি সীমাবদ্ধতা ও তার সমাধানের উৎস বলুন।",
    studyNext: "**এরপর পড়ুন:**", askMe: "ব্যাখ্যা করুন", reference: "**উৎস:**",
  },
  ta: {
    oneLine: "**ஒரு வரியில்:**", definition: "**வரையறை.**", whyMatters: "**இது ஏன் முக்கியம்.**",
    howWorks: "**இது உண்மையில் எப்படி செயல்படுகிறது**", keyMechanisms: "**முக்கிய வழிமுறைகள் & அமைப்பு**",
    examAngle: "**தேர்வுக் கோணம்**", watchOut: "**கவனமாக இருங்கள்**", testNow: "**இப்போது உங்களைச் சோதிக்கவும்**",
    explainInOne: "பார்க்காமல் ஒரு வாக்கியத்தில் விளக்குங்கள்.", exampleNonExample: "ஒரு எடுத்துக்காட்டும் ஒரு எதிர்-எடுத்துக்காட்டும் கொடுங்கள்.",
    solveOne: "இதைப் பயன்படுத்தும் ஒரு கேள்வியைத் தீர்க்கவும்.",
    nameLimitation: "ஒரு வரம்பையும் அதைக் கையாளும் மூலத்தையும் கூறுங்கள்.",
    studyNext: "**அடுத்து படிக்க:**", askMe: "விளக்குங்கள்", reference: "**மூலம்:**",
  },
  te: {
    oneLine: "**ఒక లైనులో:**", definition: "**నిర్వచనం.**", whyMatters: "**ఇది ఎందుకు ముఖ్యం.**",
    howWorks: "**ఇది నిజంగా ఎలా పనిచేస్తుంది**", keyMechanisms: "**కీలక విధానాలు & నిర్మాణం**",
    examAngle: "**పరీక్ష కోణం**", watchOut: "**జాగ్రత్తగా ఉండండి**", testNow: "**ఇప్పుడు మిమ్మల్ని మీరు పరీక్షించుకోండి**",
    explainInOne: "చూడకుండా ఒక వాక్యంలో వివరించండి.", exampleNonExample: "ఒక ఉదాహరణ మరియు ఒక వ్యతిరేక ఉదాహరణ ఇవ్వండి.",
    solveOne: "దీన్ని ఉపయోగించే ప్రశ్నను పరిష్కరించండి.",
    nameLimitation: "ఒక పరిమితిని మరియు దాన్ని పరిష్కరించే మూలాన్ని చెప్పండి.",
    studyNext: "**తర్వాత చదవండి:**", askMe: "వివరించండి", reference: "**మూలం:**",
  },
  kn: {
    oneLine: "**ಒಂದು ಸಾಲಿನಲ್ಲಿ:**", definition: "**ವ್ಯಾಖ್ಯೆ.**", whyMatters: "**ಇದು ಏಕೆ ಮುಖ್ಯ.**",
    howWorks: "**ಇದು ನಿಜವಾಗಿ ಹೇಗೆ ಕೆಲಸ ಮಾಡುತ್ತದೆ**", keyMechanisms: "**ಪ್ರಮುಖ ಕಾರ್ಯವಿಧಾನಗಳು & ರಚನೆ**",
    examAngle: "**ಪರೀಕ್ಷಾ ದೃಷ್ಟಿಕೋನ**", watchOut: "**ಎಚ್ಚರಿಕೆ ವಹಿಸಿ**", testNow: "**ಈಗ ನಿಮ್ಮನ್ನು ಪರೀಕ್ಷಿಸಿಕೊಳ್ಳಿ**",
    explainInOne: "ನೋಡದೆ ಒಂದು ವಾಕ್ಯದಲ್ಲಿ ವಿವರಿಸಿ.", exampleNonExample: "ಒಂದು ಉದಾಹರಣೆ ಮತ್ತು ಒಂದು ಅಲ್ಲದ-ಉದಾಹರಣೆ ನೀಡಿ.",
    solveOne: "ಇದನ್ನು ಬಳಸುವ ಪ್ರಶ್ನೆಯನ್ನು ಪರಿಹರಿಸಿ.",
    nameLimitation: "ಒಂದು ಮಿತಿ ಮತ್ತು ಅದನ್ನು ಪರಿಹರಿಸುವ ಮೂಲವನ್ನು ಹೇಳಿ.",
    studyNext: "**ಮುಂದೆ ಓದಿ:**", askMe: "ವಿವರಿಸಿ", reference: "**ಮೂಲ:**",
  },
  ml: {
    oneLine: "**ഒരു വരിയിൽ:**", definition: "**നിർവചനം.**", whyMatters: "**ഇത് എന്തുകൊണ്ട് പ്രധാനമാണ്.**",
    howWorks: "**ഇത് യഥാർത്ഥത്തിൽ എങ്ങനെ പ്രവർത്തിക്കുന്നു**", keyMechanisms: "**പ്രധാന സംവിധാനങ്ങൾ & ഘടന**",
    examAngle: "**പരീക്ഷാ കോണ്**", watchOut: "**ശ്രദ്ധിക്കുക**", testNow: "**ഇപ്പോൾ സ്വയം പരിശോധിക്കുക**",
    explainInOne: "നോക്കാതെ ഒരു വാക്യത്തിൽ വിശദീകരിക്കുക.", exampleNonExample: "ഒരു ഉദാഹരണവും ഒരു എതിർ-ഉദാഹരണവും നൽകുക.",
    solveOne: "ഇത് ഉപയോഗിക്കുന്ന ഒരു ചോദ്യം പരിഹരിക്കുക.",
    nameLimitation: "ഒരു പരിമിതിയും അത് പരിഹരിക്കുന്ന ഉറവിടവും പറയുക.",
    studyNext: "**അടുത്തത് വായിക്കുക:**", askMe: "വിശദീകരിക്കുക", reference: "**ഉറവിടം:**",
  },
  gu: {
    oneLine: "**એક લીટીમાં:**", definition: "**વ્યાખ્યા.**", whyMatters: "**તે શા માટે મહત્વનું છે.**",
    howWorks: "**તે ખરેખર કેવી રીતે કામ કરે છે**", keyMechanisms: "**મુખ્ય પદ્ધતિઓ અને રચના**",
    examAngle: "**પરીક્ષાનો દૃષ્ટિકોણ**", watchOut: "**સાવધાન રહો**", testNow: "**હવે તમારી જાતને ચકાસો**",
    explainInOne: "જોયા વિના એક વાક્યમાં સમજાવો.", exampleNonExample: "એક ઉદાહરણ અને એક બિન-ઉદાહરણ આપો.",
    solveOne: "તેનો ઉપયોગ કરતો એક પ્રશ્ન ઉકેલો.",
    nameLimitation: "એક મર્યાદા અને તેને સંબોધતો સ્ત્રોત જણાવો.",
    studyNext: "**આગળ વાંચો:**", askMe: "સમજાવો", reference: "**સ્ત્રોત:**",
  },
  pa: {
    oneLine: "**ਇੱਕ ਲਾਈਨ ਵਿੱਚ:**", definition: "**ਪਰਿਭਾਸ਼ਾ.**", whyMatters: "**ਇਹ ਕਿਉਂ ਮਹੱਤਵਪੂਰਨ ਹੈ।**",
    howWorks: "**ਇਹ ਅਸਲ ਵਿੱਚ ਕਿਵੇਂ ਕੰਮ ਕਰਦਾ ਹੈ**", keyMechanisms: "**ਮੁੱਖ ਵਿਧੀਆਂ ਅਤੇ ਬਣਤਰ**",
    examAngle: "**ਪ੍ਰੀਖਿਆ ਦਾ ਨਜ਼ਰੀਆ**", watchOut: "**ਧਿਆਨ ਰੱਖੋ**", testNow: "**ਹੁਣ ਆਪਣੇ ਆਪ ਨੂੰ ਪਰਖੋ**",
    explainInOne: "ਬਿਨਾਂ ਦੇਖੇ ਇੱਕ ਵਾਕ ਵਿੱਚ ਸਮਝਾਓ।", exampleNonExample: "ਇੱਕ ਉਦਾਹਰਨ ਅਤੇ ਇੱਕ ਗ਼ੈਰ-ਉਦਾਹਰਨ ਦਿਓ।",
    solveOne: "ਇੱਕ ਸਵਾਲ ਹੱਲ ਕਰੋ ਜੋ ਇਸਨੂੰ ਵਰਤਦਾ ਹੈ।",
    nameLimitation: "ਇੱਕ ਸੀਮਾ ਅਤੇ ਇਸਨੂੰ ਹੱਲ ਕਰਨ ਵਾਲਾ ਸਰੋਤ ਦੱਸੋ।",
    studyNext: "**ਅੱਗੇ ਪੜ੍ਹੋ:**", askMe: "ਸਮਝਾਓ", reference: "**ਸਰੋਤ:**",
  },
  or: {
    oneLine: "**ଗୋଟିଏ ଧାଡ଼ିରେ:**", definition: "**ସଂଜ୍ଞା.**", whyMatters: "**ଏହା କାହିଁକି ଗୁରୁତ୍ୱପୂର୍ଣ୍ଣ।**",
    howWorks: "**ଏହା ପ୍ରକୃତରେ କିପରି କାମ କରେ**", keyMechanisms: "**ମୁଖ୍ୟ ପ୍ରଣାଳୀ ଏବଂ ଗଠନ**",
    examAngle: "**ପରୀକ୍ଷା ଦୃଷ୍ଟିକୋଣ**", watchOut: "**ସାବଧାନ ରୁହନ୍ତୁ**", testNow: "**ବର୍ତ୍ତମାନ ନିଜକୁ ଯାଞ୍ଚ କରନ୍ତୁ**",
    explainInOne: "ନ ଦେଖି ଗୋଟିଏ ବାକ୍ୟରେ ବୁଝାନ୍ତୁ।", exampleNonExample: "ଗୋଟିଏ ଉଦାହରଣ ଏବଂ ଗୋଟିଏ ଅଣ-ଉଦାହରଣ ଦିଅନ୍ତୁ।",
    solveOne: "ଏହାକୁ ବ୍ୟବହାର କରୁଥିବା ଗୋଟିଏ ପ୍ରଶ୍ନ ସମାଧାନ କରନ୍ତୁ।",
    nameLimitation: "ଗୋଟିଏ ସୀମା ଏବଂ ଏହାର ସମାଧାନ ଉତ୍ସ କୁହନ୍ତୁ।",
    studyNext: "**ପରେ ପଢ଼ନ୍ତୁ:**", askMe: "ବୁଝାନ୍ତୁ", reference: "**ଉତ୍ସ:**",
  },
  ur: {
    oneLine: "**ایک لائن میں:**", definition: "**تعریف.**", whyMatters: "**یہ کیوں اہم ہے۔**",
    howWorks: "**یہ حقیقت میں کیسے کام کرتا ہے**", keyMechanisms: "**کلیدی میکانزم اور ساخت**",
    examAngle: "**امتحانی زاویہ**", watchOut: "**احتیاط رکھیں**", testNow: "**اب خود کو آزمائیں**",
    explainInOne: "بغیر دیکھے ایک جملے میں سمجھائیں۔", exampleNonExample: "ایک مثال اور ایک غیر مثال دیں۔",
    solveOne: "ایک سوال حل کریں جو اسے استعمال کرتا ہے۔",
    nameLimitation: "ایک حد اور اسے حل کرنے والا ماخذ بتائیں۔",
    studyNext: "**آگے پڑھیں:**", askMe: "سمجھائیں", reference: "**ماخذ:**",
  },
  ar: {
    oneLine: "**في سطر واحد:**", definition: "**التعريف.**", whyMatters: "**لماذا هو مهم.**",
    howWorks: "**كيف يعمل فعليًا**", keyMechanisms: "**الآليات والبنية الأساسية**",
    examAngle: "**زاوية الامتحان**", watchOut: "**انتبه**", testNow: "**اختبر نفسك الآن**",
    explainInOne: "اشرح في جملة واحدة دون النظر.", exampleNonExample: "أعط مثالًا ومثالًا مضادًا.",
    solveOne: "حل سؤالًا يستخدم هذا المفهوم.",
    nameLimitation: "اذكر حدًا واحدًا والمصدر الذي يعالجه.",
    studyNext: "**ادرس بعد ذلك:**", askMe: "اشرح", reference: "**المصدر:**",
  },
};

function lessonHeaders(lang: string) {
  if (HEADERS[lang]) return HEADERS[lang];
  // Marathi / Nepali share Devanagari with Hindi; everything else uses English
  // structure labels so teachFromKnowledge never reads undefined fields.
  if (lang === "mr" || lang === "ne") return HEADERS.hi;
  return HEADERS.en;
}

/**
 * Turn a raw encyclopedia extract into a genuine tutor-style lesson — not a
 * copy-paste. It restructures the material into: one-line definition, why it
 * matters, a mechanism/components breakdown, a worked/exam angle, common
 * mistakes, and a self-test — all adapted to the learner's level. When the
 * extract came from a non-English Wikipedia, the structure headers switch to
 * the learner's language so the whole answer reads (and speaks) coherently.
 */
export function teachFromKnowledge(
  k: Knowledge,
  question: string,
  level: string,
  subjectHint?: string
): string {
  const h = lessonHeaders(k.lang);
  const s = sentences(k.extract);
  if (!s.length) return k.lang === "en"
    ? `I found a reference for **${k.title}** but couldn't extract a clean explanation. Try rephrasing, or give me the exact sub-topic.`
    : `मैंने **${k.title}** का संदर्भ ढूँढा, लेकिन साफ़ व्याख्या नहीं निकाल सका। दोबारा पूछें या सटीक उप-विषय बताएँ।`;

  const definition = s[0];
  const supporting = keySentences(s.slice(1), 4);
  const young = level === "nursery" || level === "school" || level === "primary";
  const deep = level === "phd" || level === "pg";

  const out: string[] = [];
  out.push(`### ${k.title}`);
  out.push("");

  // 1. Definition, level-adapted
  out.push(young ? `${h.oneLine} ${simplify(definition)}` : `${h.definition} ${definition}`);

  // 2. Why it matters / where it fits
  out.push("");
  out.push(`${h.whyMatters} ${whyItMatters(k.title, subjectHint, question, k.lang)}`);

  // 3. The mechanism / components — restructured, not dumped
  if (supporting.length) {
    out.push("");
    out.push(deep ? h.keyMechanisms : h.howWorks);
    supporting.forEach((d, i) => out.push(`${i + 1}. ${d}`));
  }

  // 4. Exam / application angle — this is the part that isn't "wikipedia"
  out.push("");
  out.push(h.examAngle);
  const devanagari = k.lang === "hi" || k.lang === "mr" || k.lang === "ne";
  if (young) {
    out.push(`- ${devanagari ? `यदि प्रश्न *${k.title}* के बारे में हो, तो पहले बताएँ कि यह क्या है, फिर एक रोज़मर्रा का उदाहरण दें।` : `If a question asks about *${k.title}*, first say what it is, then give one everyday example.`}`);
    out.push(`- ${devanagari ? "हो सके तो चित्र बनाएँ — लेबल वाला चित्र आसान अंक दिलाता है।" : "Draw it if you can — a labelled picture earns easy marks."}`);
  } else if (deep) {
    out.push(`- ${devanagari ? "मान्यताएँ, किनारे के मामले और मानक दृष्टिकोण की एक आलोचना बताने के लिए तैयार रहें।" : `Be ready to state assumptions, edge cases, and one criticism of the standard view.`}`);
    out.push(`- ${devanagari ? `*${k.title}* को पास के ढाँचे से जोड़ें और बताएँ कि वे कहाँ अलग होते हैं।` : `Link *${k.title}* to an adjacent framework and explain where they diverge.`}`);
  } else {
    out.push(`- ${devanagari ? "उत्तर की शुरुआत एक स्पष्ट एक-पंक्ति परिभाषा से करें, फिर ऊपर के बिंदुओं के आसपास शरीर बनाएँ।" : "Lead your answer with a crisp 1-line definition, then structure the body around the points above."}`);
    out.push(`- ${devanagari ? "एक ठोस उदाहरण या हल किया गया संख्यात्मक जोड़ें — परीक्षक रटने की नहीं, प्रयोग की सराहना करते हैं।" : "Add one concrete example or a worked numerical — examiners reward application, not recall."}`);
  }

  // 5. Common mistakes + self test
  out.push("");
  out.push(h.watchOut);
  out.push(`- ${devanagari ? "परिभाषा को उसके *उदाहरण* से न मिलाएँ — दोनों को अलग-अलग बताएँ।" : "Don't confuse the *definition* with an *example* of it — state both separately."}`);
  out.push(`- ${devanagari ? "सीमा की शर्तें सीखें: यह **कब** लागू नहीं होता?" : "Learn the boundary conditions: when does this **not** apply?"}`);
  out.push("");
  out.push(h.testNow);
  out.push(`1. ${h.explainInOne} (*${k.title}*)`);
  out.push(`2. ${h.exampleNonExample}`);
  out.push(`3. ${deep ? h.nameLimitation : h.solveOne}`);

  if (subjectHint) {
    out.push("");
    out.push(`_${devanagari ? `यह आपकी योजना में **${subjectHint}** के अंदर है। ऊपर की स्वयं-जाँच पास करते ही पाठ को पूर्ण चिह्नित करें।` : `This sits inside **${subjectHint}** in your plan. Mark the lesson done once you can pass the self-test above.`}_`);
  }
  if (k.related.length) {
    out.push("");
    out.push(`${h.studyNext} ${k.related.join(" · ")} — ${h.askMe} *"${k.related[0]}"*`);
  }
  out.push("");
  out.push(`_${h.reference} [${k.title}](${k.url})_`);
  return out.join("\n");
}

function simplify(sentence: string): string {
  // Shorten and de-jargon a definition for young learners.
  const first = sentence.split(/[,;(]/)[0].trim();
  return first.length > 20 ? first + "." : sentence;
}

function whyItMatters(title: string, subject: string | undefined, question: string, lang: string): string {
  // Hindi/Marathi/Nepali share the Devanagari script; for other non-English
  // languages the (English) connector stays minimal and the headers + extract
  // carry the lesson in the learner's own language.
  const devanagari = lang === "hi" || lang === "mr" || lang === "ne";
  if (devanagari) {
    if (/exam|marks|score/i.test(question)) {
      return `यह बार-बार आने वाला परीक्षा विषय है — इसे अच्छी तरह समझना आसान अंक सुरक्षित करता है।`;
    }
    if (subject) {
      return `यह **${subject}** की आधारशिला है — आगे के विषय मानते हैं कि आप ${title} पहले ही समझ चुके हैं।`;
    }
    return `${title} को समझना उस पर बने विषयों को बहुत आसान बना देता है, इसलिए इसे अभी अच्छी तरह सीखें।`;
  }
  if (/exam|marks|score/i.test(question)) return `It's a recurring exam topic — understanding it well protects easy marks.`;
  if (subject) return `It's a building block in **${subject}** — later topics assume you already understand ${title}.`;
  return `Grasping ${title} makes the topics built on top of it far easier, so it's worth over-learning now.`;
}
