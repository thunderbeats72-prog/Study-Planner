import {
  activeProvider,
  commandReply,
  languageCapabilityReply,
  parseCommand,
  instantTutorReply,
  localTutor,
  tutorSystemPrompt,
  voiceGenderFor,
  extractLlmAction,
  aiSuggestSubjects,
  aiGenerateTopics,
} from "../src/lib/ai";
import {
  cleanForSpeech,
  splitSpeechChunks,
  resolveVoiceId,
  splitLanguageRuns,
} from "../src/lib/voice";
import { detectLanguage, isMostlyEnglish } from "../src/lib/language";
import { mergeTranscriptSegments } from "../src/lib/transcript";
import { mdToHtml, escapeHtml } from "../src/lib/client";
import { buildPlan } from "../src/lib/planner";
import { nmimsSem1Subjects, cbseCatalogFor } from "../src/lib/curriculum";

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    console.log(`✓ PASS: ${name}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${name} ${detail ? `(${detail})` : ""}`);
    failed++;
  }
}

async function runTests() {
  console.log("==================================================");
  console.log("RUNNING STUDY PLANNER PRO INTERNAL TEST SUITE");
  console.log("==================================================\n");

  // 1. LANGUAGE DETECTION TESTS
  console.log("--- 1. Language Detection & Script Classifier ---");
  assert(detectLanguage("Hello, how are you?") === "en-IN", "English detection");
  assert(detectLanguage("नमस्ते, आप कैसे हैं?") === "hi-IN", "Hindi Devanagari detection");
  assert(detectLanguage("मी मराठीत बोलू शकते") === "mr-IN", "Marathi Devanagari detection");
  assert(detectLanguage("বাংলা ভাষা") === "bn-IN", "Bengali script detection");
  assert(detectLanguage("தமிழ் மொழி") === "ta-IN", "Tamil script detection");
  assert(detectLanguage("తెలుగు భాష") === "te-IN", "Telugu script detection");
  assert(detectLanguage("مرحبا بك") === "ar-XA", "Arabic script detection");

  // 2. AI GREETINGS & LANGUAGE CAPABILITY
  console.log("\n--- 2. AI Greetings & Language Capabilities ---");
  const hiReply = languageCapabilityReply("Can you speak Hindi?", "female");
  assert(typeof hiReply === "string" && hiReply.includes("हिंदी"), "Hindi capability query (female)");
  const mrReply = languageCapabilityReply("Do you know Marathi?", "male");
  assert(typeof mrReply === "string" && mrReply.includes("मराठीत"), "Marathi capability query (male)");
  const taReply = languageCapabilityReply("Can you talk in Tamil?", "female");
  assert(typeof taReply === "string" && taReply.includes("தமிழில்"), "Tamil capability query");

  // 2b. KEYLESS MULTILINGUAL FALLBACK (must never return a useless English
  //     "tell me more" line to a Hindi/Hinglish learner when cloud fails).
  const tutorCtx = {
    name: "Test", courseName: "Class 12 CBSE", level: "school", examDate: "2026-12-01",
    daysLeft: 100, dailyHours: 2, progressPct: 42, streak: 5, hoursThisWeek: 6.5, overdue: 2,
    subjects: [
      { id: 1, name: "Physics", difficulty: "Hard", done: 2, total: 10 },
      { id: 2, name: "Business Communication", difficulty: "Medium", done: 1, total: 8 },
    ],
    today: [{ title: "Physics: Waves", kind: "learn", minutes: 60, status: "pending" }],
  };
  const hinglishToday = await localTutor("aaj kya padhu", tutorCtx, { skipCloud: true });
  assert(hinglishToday.text.includes("Aaj ke liye priority order"), "Hinglish today answer stays in Hinglish");
  const hindiToday = await localTutor("मुझे आज क्या पढ़ना है?", tutorCtx, { skipCloud: true });
  assert(hindiToday.text.includes("आज के लिए"), "Hindi today answer stays in Hindi");
  const hinglishVague = await localTutor("kuch batao", tutorCtx, { skipCloud: true });
  assert(!hinglishVague.text.startsWith("I need") && !hinglishVague.text.startsWith("That's an open-ended"), "Hinglish vague ask does not get English tell-me-more");
  const hindiVague = await localTutor("सही जवाब चाहिए", tutorCtx, { skipCloud: true });
  assert(hindiVague.text.includes("सही जवाब"), "Hindi vague ask answers in Hindi");

  // 3. COMMAND PARSER & ACTION TAG EXTRACTION
  console.log("\n--- 3. Command Parser & Action Tag Handling ---");
  assert(parseCommand("start timer")?.type === "startTimer", "Command: start timer");
  assert(parseCommand("pause")?.type === "pause", "Command: pause");
  assert(parseCommand("stop timer")?.type === "stopTimer", "Command: stop timer");
  assert(parseCommand("replan my schedule")?.type === "replan", "Command: replan");
  assert(parseCommand("go to planner")?.type === "navigate", "Command: navigate planner");
  assert(parseCommand("change theme to dark")?.type === "theme", "Command: dark theme");
  assert(parseCommand("what is supply and demand") === undefined, "Study question not hijacked by command parser");

  const hinglishCmd = commandReply({ type: "startTimer" }, "timer shuru karo", 30, "female");
  assert(hinglishCmd.includes("Clock shuru"), "Hinglish command confirmation stays in Hinglish");
  const hindiCmd = commandReply({ type: "stopTimer" }, "घड़ी बंद करो", 30, "male");
  assert(hindiCmd.includes("घड़ी बंद"), "Hindi command confirmation stays in Hindi");

  // Vague theme asks must still be handled locally (this used to fall through
  // to "I need one more detail..." when the cloud provider failed).
  const vagueThemeAction = parseCommand("could you please change theme to something brighter");
  assert(vagueThemeAction?.type === "theme" && vagueThemeAction.payload === "silver-lavender", "Vague brighter theme parsed locally");
  const vagueThemeLocal = await localTutor("could you please change theme to something brighter", tutorCtx, { skipCloud: true });
  assert(vagueThemeLocal.action?.type === "theme" && vagueThemeLocal.action.payload === "silver-lavender", "Vague brighter theme executes without cloud");
  assert(!vagueThemeLocal.text.includes("I need one more detail"), "Vague theme does not produce irrelevant fallback");

  // A learner can ask about a subject already in their plan even keyless.
  const subjectLocal = await localTutor("what about Business Communication?", tutorCtx, { skipCloud: true });
  assert(subjectLocal.text.includes("Business Communication"), "Keyless subject question stays relevant");
  assert(!subjectLocal.text.includes("I need one more detail"), "Keyless subject question does not dump generic fallback");

  const extracted = extractLlmAction("Here is your plan. [[action:navigate:planner]]");
  assert(extracted.text === "Here is your plan.", "Action tag stripped from text");
  assert(extracted.action?.type === "navigate" && extracted.action.payload === "planner", "Action tag parsed correctly");

  // 4. TTS CLEANING & CHUNKING TESTS
  console.log("\n--- 4. TTS Cleaning & Speech Chunking ---");
  const markdownSample = `
# Core Microeconomics Lessons
Here are the key takeaways:
1. **Supply and Demand**: Foundation of pricing.
2. **Elasticity**: Sensitivity to price changes.
3. **Consumer Surplus**: Difference between willingness to pay and market price.

| Topic | Difficulty |
| Supply | Easy |
| Elasticity | Medium |
`;
  const cleanedText = cleanForSpeech(markdownSample);
  assert(!cleanedText.includes("#"), "Markdown hashes removed");
  assert(!cleanedText.includes("**"), "Markdown asterisks removed");
  assert(cleanedText.includes("Core Microeconomics Lessons."), "Headers converted to punctuated sentences");
  assert(cleanedText.includes("Foundation of pricing."), "Numbered items converted to punctuated sentences");

  const longText = "This is a sentence. ".repeat(300); // ~6000 chars
  const chunks = splitSpeechChunks(longText, 2000);
  assert(chunks.length >= 3, "Long text split into multiple chunks");
  assert(chunks.every((c) => c.length > 0 && c.length <= 2000), "Every chunk strictly within budget limit");

  // 5. CURRICULUM GROUND TRUTH & GENERATION
  console.log("\n--- 5. Curriculum Ground Truth & Generation ---");
  const nmimsSubjects = nmimsSem1Subjects();
  assert(nmimsSubjects.length === 6, "NMIMS Semester 1 ground truth has 6 subjects");

  const cbseClass10 = cbseCatalogFor("Class 10 CBSE");
  assert(cbseClass10 !== null && cbseClass10.length > 0, "CBSE Class 10 catalog found");

  const courseSuggest = await aiSuggestSubjects("Class 10 CBSE", "school");
  assert(courseSuggest.subjects.length > 0, "CBSE course suggest returned subjects");

  // 6. SCHEDULER & PLANNER TESTS
  console.log("\n--- 6. Scheduler & Plan Generation ---");
  const mockSubjects = [
    { id: 1, userId: "u1", name: "Economics", units: 10, difficulty: "Medium", color: "#6366f1", createdAt: new Date() },
    { id: 2, userId: "u1", name: "Mathematics", units: 12, difficulty: "Hard", color: "#10b981", createdAt: new Date() },
  ];
  const mockTopics = Array.from({ length: 22 }, (_, i) => ({
    id: i + 1,
    subjectId: i < 10 ? 1 : 2,
    unit: `Unit ${i + 1}`,
    title: `Topic ${i + 1}`,
    summary: `Summary ${i + 1}`,
    objectives: ["Obj 1"],
    prerequisites: [],
    keyConcepts: ["Concept 1"],
    practice: "Practice",
    depth: "Core" as const,
    sources: [],
    difficulty: "Medium" as const,
    estMinutes: 60,
    position: i + 1,
  }));

  const planResult = buildPlan(mockSubjects, mockTopics, {
    startDate: "2026-08-22",
    examDate: "2026-10-01",
    dailyHours: 2,
    subjectsPerDay: 2,
    studyDays: "weekdays",
    bufferDays: 3,
    planMode: "standard",
    studyStyle: "balanced",
    weakSubject: "none",
    revisionWeeks: 1,
  });
  assert(planResult.tasks.length > 0, "Planner generated tasks across calendar days");
  assert(planResult.tasks.some((t) => t.date >= "2026-08-22"), "Planned dates start from current/future window");

  // 7. TRANSCRIPT & CLIENT RENDERER TESTS
  console.log("\n--- 7. Transcript Deduplication & Client Rendering ---");
  const dupes = mergeTranscriptSegments(["Hello world", "Hello world this is a test"]);
  assert(dupes === "Hello world this is a test", "Transcript deduplication merged cumulative overlap");

  const renderedHtml = mdToHtml("**Bold** and *Italic* text with [link](https://example.com)");
  assert(renderedHtml.includes("<strong>Bold</strong>"), "mdToHtml renders bold text");
  assert(renderedHtml.includes("<em>Italic</em>"), "mdToHtml renders italic text");
  assert(renderedHtml.includes("href=\"https://example.com\""), "mdToHtml renders links with rel/target attributes");

  console.log("\n==================================================");
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Test runner exception:", err);
  process.exit(1);
});
