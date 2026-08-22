import {
  aiSuggestSubjects,
  callLLMDetailed,
  extractLlmAction,
  instantTutorReply,
  languageCapabilityReply,
  parseCommand,
} from "../src/lib/ai";
import { cleanForSpeech, splitSpeechChunks } from "../src/lib/voice";
import { detectLanguage } from "../src/lib/language";
import { wikiLangFor, searchTerms } from "../src/lib/knowledge";
import { mergeTranscriptSegments } from "../src/lib/transcript";
import { mdToHtml } from "../src/lib/client";
import { buildPlan, countStudyDays, projectCompletionDate } from "../src/lib/planner";
import { cbseCatalogFor, nmimsSem1Subjects } from "../src/lib/curriculum";
import { finiteNumber, isIsoDate } from "../src/lib/validation";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { useStudyClock, type ClockApi } from "../src/lib/useTimer";

let passed = 0;
let failed = 0;

function check(condition: unknown, name: string, detail?: string) {
  if (condition) {
    console.log(`✓ PASS: ${name}`);
    passed++;
  } else {
    console.error(`✗ FAIL: ${name}${detail ? ` (${detail})` : ""}`);
    failed++;
  }
}

async function runTests() {
  console.log("==================================================");
  console.log("RUNNING STUDY PLANNER PRO INTERNAL TEST SUITE");
  console.log("==================================================\n");

  console.log("--- 1. Language Detection & Script Classifier ---");
  check(detectLanguage("Hello, how are you?") === "en-IN", "English detection");
  check(detectLanguage("नमस्ते, आप कैसे हैं?") === "hi-IN", "Hindi Devanagari detection");
  check(detectLanguage("मी मराठीत बोलू शकते") === "mr-IN", "Marathi Devanagari detection");
  check(detectLanguage("বাংলা ভাষা") === "bn-IN", "Bengali script detection");
  check(detectLanguage("தமிழ் மொழி") === "ta-IN", "Tamil script detection");
  check(detectLanguage("తెలుగు భాష") === "te-IN", "Telugu script detection");
  check(detectLanguage("میں اردو بول سکتا ہوں") === "ur-PK", "Urdu script detection");
  check(detectLanguage("مرحبا بك") === "ar-XA", "Arabic script detection");

  console.log("\n--- 2. AI Language Capabilities & Commands ---");
  const hiReply = languageCapabilityReply("Can you speak Hindi?", "female");
  check(typeof hiReply === "string" && hiReply.includes("हिंदी"), "Hindi capability query (female)");
  const mrReply = languageCapabilityReply("Do you know Marathi?", "male");
  check(typeof mrReply === "string" && mrReply.includes("मराठीत"), "Marathi capability query (male)");
  const taReply = languageCapabilityReply("Can you talk in Tamil?", "female");
  check(typeof taReply === "string" && taReply.includes("தமிழில்"), "Tamil capability query");
  const thReply = languageCapabilityReply("Can you speak Thai?", "female");
  check(typeof thReply === "string" && thReply.includes("ภาษาไทย"), "Thai capability query");
  const enReply = languageCapabilityReply("Do you know English?", "female");
  check(typeof enReply === "string" && enReply.includes("English"), "English capability query");
  const hiScriptReply = languageCapabilityReply("क्या तुम हिंदी बोल सकती हो?", "female");
  check(typeof hiScriptReply === "string" && hiScriptReply.includes("हिंदी"), "Hindi-script capability query (no Latin trigger word)");
  const bnScriptReply = languageCapabilityReply("আপনি কি বাংলায় কথা বলতে পারেন?", "female");
  check(typeof bnScriptReply === "string" && bnScriptReply.includes("বাংলা"), "Bengali-script capability query (no Latin trigger word)");
  check(parseCommand("start timer")?.type === "startTimer", "Command: start timer");
  check(parseCommand("pause")?.type === "pause", "Command: pause");
  check(parseCommand("stop timer")?.type === "stopTimer", "Command: stop timer");
  check(parseCommand("replan my schedule")?.type === "replan", "Command: replan");
  check(parseCommand("go to planner")?.type === "navigate", "Command: navigate planner");
  check(parseCommand("change theme to dark")?.type === "theme", "Command: dark theme");
  check(parseCommand("what is supply and demand") === undefined, "Study question is not hijacked as a command");
  check(parseCommand("planner")?.type === "navigate" && parseCommand("planner")?.payload === "planner", "Bare page name navigates");
  check(parseCommand("dark theme")?.type === "theme", "Bare theme command works");
  check(parseCommand("please resume")?.type === "resume", "Please + resume works");
  check(parseCommand("can you open the planner?")?.type === "navigate", "Polite navigation question works");

  console.log("\n--- 2b. Questions must never execute state-changing actions ---");
  check(parseCommand("what is deep work mode?") === undefined, "Question about zen is not a command");
  check(parseCommand("how do I replan?") === undefined, "Question about replan is not a command");
  check(parseCommand("should I replan?") === undefined, "Should-I-replan is not a command");
  check(parseCommand("what is the dark theme?") === undefined, "Question about theme is not a command");
  check(parseCommand("how do I stop the timer?") === undefined, "Question about stop is not a command");
  check(parseCommand("when should I start the timer?") === undefined, "Question about start is not a command");
  check(parseCommand("should I pause?") === undefined, "Question about pause is not a command");
  check(parseCommand("explain how the timer works") === undefined, "How-to question is not a command");
  check(parseCommand("what are my weak points?") === undefined, "Weak-points question is not a command");

  console.log("\n--- 2d. Localized instant plan/progress replies ---");
  {
    const tctx = {
      name: "Aarav", courseName: "Class 10 CBSE", level: "school", examDate: "2026-11-30",
      daysLeft: 100, dailyHours: 2,
      subjects: [{ id: 1, name: "Science", difficulty: "Medium", done: 3, total: 10 }],
      today: [
        { title: "Photosynthesis", kind: "learn", minutes: 60, status: "pending" },
        { title: "Quadratic Equations", kind: "learn", minutes: 45, status: "pending" },
      ],
      progressPct: 55, streak: 6, hoursThisWeek: 8.5, overdue: 2,
    } as Parameters<typeof instantTutorReply>[1];
    const hiToday = instantTutorReply("आज क्या पढ़ना है?", tctx);
    check(typeof hiToday?.text === "string" && hiToday.text.includes("प्राथमिकता") && hiToday.text.includes("Photosynthesis"),
      "Hindi instant today reply lists real tasks");
    const hiProgress = instantTutorReply("मेरी प्रोग्रेस कैसी है?", tctx);
    check(typeof hiProgress?.text === "string" && hiProgress.text.includes("55%") && hiProgress.text.includes("स्ट्रीक"),
      "Hindi instant progress reply uses live data");
    const hiWeakest = instantTutorReply("मेरा सबसे कमजोर विषय कौन सा है?", tctx);
    check(typeof hiWeakest?.text === "string" && hiWeakest.text.includes("Science"), "Hindi instant weakest reply");
    const hiBehind = instantTutorReply("मैं कितना पीछे हूँ?", tctx);
    check(typeof hiBehind?.text === "string" && hiBehind.text.includes("2"), "Hindi instant behind reply");
    const bnToday = instantTutorReply("আজ কী পড়ব?", tctx);
    check(typeof bnToday?.text === "string" && bnToday.text.includes("অগ্রাধিকার"), "Bengali instant today reply");
    const taProgress = instantTutorReply("என் முன்னேற்றம் எப்படி?", tctx);
    check(typeof taProgress?.text === "string" && taProgress.text.includes("55%"), "Tamil instant progress reply");
    const urBehind = instantTutorReply("میرے کتنے کام باقی ہیں?", tctx);
    check(typeof urBehind?.text === "string" && urBehind.text.includes("2"), "Urdu instant behind reply");
    const enUntouched = instantTutorReply("what should I study today?", tctx);
    check(typeof enUntouched?.text === "string" && enUntouched.text.includes("priority order"), "English instant reply unchanged");
  }

  console.log("\n--- 2e. Multilingual knowledge lookup routing ---");
  check(wikiLangFor("फोटोसिंथेसिस क्या है") === "hi", "Devanagari question routes to Hindi Wikipedia");
  check(wikiLangFor("செயலாக்கம் என்றால் என்ன") === "ta", "Tamil question routes to Tamil Wikipedia");
  check(wikiLangFor("What is photosynthesis?") === "en", "English question routes to English Wikipedia");
  check(searchTerms("फोटोसिंथेसिस क्या है समझाओ") === "फोटोसिंथेसिस", "Hindi question words stripped from search");
  check(searchTerms("সালোকসংশ্লেষণ কী ব্যাখ্যা করো") === "সালোকসংশ্লেষণ", "Bengali question words stripped from search");
  check(searchTerms("What is photosynthesis in simple words?") === "photosynthesis", "English question words stripped from search");

  console.log("\n--- 2c. Local curriculum replies must stay on-topic ---");
  {
    // The chat route needs DATABASE_URL only at import time (the pool is lazy);
    // no query runs in this test.
    const oldDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    const { localCurriculumReply } = await import("../src/app/api/chat/route");
    if (oldDbUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldDbUrl;
    const state = {
      subjects: [
        { id: 1, name: "Biology" },
        { id: 2, name: "Physics" },
      ],
      topics: [
        {
          id: 10, subjectId: 1, unit: "Unit 1", title: "Photosynthesis Process",
          summary: "Plants convert light energy into chemical energy.",
          objectives: ["Describe the light-dependent reactions."],
          prerequisites: [], keyConcepts: ["chlorophyll", "ATP"], practice: "Label a chloroplast.",
          depth: "Core", sources: [], difficulty: "Medium", estMinutes: 60, position: 0,
          mastery: 0, status: "pending",
        },
        {
          id: 11, subjectId: 2, unit: "Unit 2", title: "Newton Laws Motion",
          summary: "Forces and acceleration.",
          objectives: ["Apply F=ma."], prerequisites: [], keyConcepts: ["inertia", "momentum"],
          practice: "Solve a friction problem.", depth: "Core", sources: [],
          difficulty: "Hard", estMinutes: 75, position: 0, mastery: 0, status: "pending",
        },
      ],
      tasks: [
        { id: 1, date: "2026-08-22", subjectId: 1, topicId: 10, kind: "learn", title: "Photosynthesis Process",
          detail: "", plannedMinutes: 60, actualMinutes: 0, status: "pending", position: 0 },
      ],
    } as unknown as Parameters<typeof localCurriculumReply>[1];
    check(localCurriculumReply("what is the capital of France?", state) === null,
      "Off-topic question never answered with a random plan lesson");
    check(localCurriculumReply("tell me about the French revolution", state) === null,
      "Unrelated history question never answered with a plan lesson");
    const practice = localCurriculumReply("give me 5 practice questions", state);
    check(typeof practice === "string" && practice.includes("Photosynthesis Process"),
      "Practice request uses the current curriculum lesson");
    const weakest = localCurriculumReply("explain my weakest topic", state);
    check(typeof weakest === "string" && weakest.includes("###"),
      "Weakest-topic request uses the curriculum lesson");
    const onTopic = localCurriculumReply("explain the photosynthesis process in detail", state);
    check(typeof onTopic === "string" && onTopic.includes("Photosynthesis Process"),
      "On-topic lesson question answered from the curriculum");
  }

  console.log("\n--- 3. Safe LLM Action Handling ---");
  const extracted = extractLlmAction("Here is your plan. [[action:navigate:planner]]");
  check(extracted.text === "Here is your plan.", "Final action tag stripped from text");
  check(extracted.action?.type === "navigate" && extracted.action.payload === "planner", "Valid final action parsed");
  check(!extractLlmAction("The syntax [[action:replan]] is an example, not a request.").action, "Inline quoted action cannot execute");
  check(!extractLlmAction("One [[action:pause]] two [[action:replan]]").action, "Multiple action tags cannot execute");
  check(!extractLlmAction("Done [[action:replan:unexpected]]").action, "Bare action with payload is rejected");

  console.log("\n--- 4. Provider Failover ---");
  const originalFetch = globalThis.fetch;
  const oldGemini = process.env.GEMINI_API_KEY;
  const oldGroq = process.env.GROQ_API_KEY;
  const oldOpenRouter = process.env.OPENROUTER_API_KEY;
  process.env.GEMINI_API_KEY = "test-gemini";
  process.env.GROQ_API_KEY = "test-groq";
  delete process.env.OPENROUTER_API_KEY;
  const called: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    called.push(url);
    if (url.includes("generativelanguage")) {
      return new Response(JSON.stringify({ error: { message: "API key rejected" } }), {
        status: 403, headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "Fallback answer" } }] }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const failover = await callLLMDetailed("Tutor", [{ role: "user", content: "Explain demand" }], 200);
  check(failover.text === "Fallback answer" && failover.provider === "groq", "Rejected Gemini key falls through to Groq");
  check(called.filter((url) => url.includes("generativelanguage")).length === 1, "Auth failure does not loop through Gemini models");
  globalThis.fetch = originalFetch;
  if (oldGemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldGemini;
  if (oldGroq === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = oldGroq;
  if (oldOpenRouter === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = oldOpenRouter;

  console.log("\n--- 5. Gemini TTS API Compatibility ---");
  const oldTtsModel = process.env.GEMINI_TTS_MODEL;
  process.env.GEMINI_API_KEY = "test-gemini-tts";
  process.env.GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";
  let ttsUrl = "";
  let ttsBody: Record<string, unknown> = {};
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    ttsUrl = String(input);
    ttsBody = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
    return new Response(JSON.stringify({
      output_audio: { data: Buffer.from([0, 0, 0, 0]).toString("base64"), mime_type: "audio/pcm;rate=24000" },
    }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const { POST: voicePost } = await import("../src/app/api/voice/route");
  const voiceResponse = await voicePost(new Request("http://localhost/api/voice", {
    method: "POST",
    headers: { "content-type": "application/json", "x-user-key": "u_TTSTESTTTSTESTTTSTEST" },
    body: JSON.stringify({ text: "Test this voice", voiceId: "f1" }),
  }));
  const voiceBytes = Buffer.from(await voiceResponse.arrayBuffer());
  check(ttsUrl.endsWith("/v1beta/interactions"), "Gemini 3.1 TTS uses the current Interactions endpoint");
  check(ttsBody.model === "gemini-3.1-flash-tts-preview" && (ttsBody.response_format as { type?: string })?.type === "audio", "Interactions request uses the current audio schema");
  check(voiceResponse.ok && voiceBytes.subarray(0, 4).toString("ascii") === "RIFF", "Interactions PCM response is returned as playable WAV");
  globalThis.fetch = originalFetch;
  if (oldGemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldGemini;
  if (oldTtsModel === undefined) delete process.env.GEMINI_TTS_MODEL; else process.env.GEMINI_TTS_MODEL = oldTtsModel;

  console.log("\n--- 6. TTS Cleaning & Chunking ---");
  const markdownSample = `
# Core Microeconomics Lessons
Here are the key takeaways:
1. **Supply and Demand**: Foundation of pricing.
2. **Elasticity**: Sensitivity to price changes.

| Topic | Difficulty |
| --- | --- |
| Supply | Easy |
`;
  const cleanedText = cleanForSpeech(markdownSample);
  check(!cleanedText.includes("#") && !cleanedText.includes("**"), "Speech text removes markdown noise");
  check(cleanedText.includes("Core Microeconomics Lessons."), "Speech headers become punctuated sentences");
  check(cleanedText.includes("Foundation of pricing."), "Numbered content remains readable");
  const longText = "यह एक विस्तृत वाक्य है। This is a detailed sentence. ".repeat(180);
  const chunks = splitSpeechChunks(longText, 2000);
  const encoder = new TextEncoder();
  check(chunks.length >= 3, "Long multilingual text splits into multiple chunks");
  check(chunks.every((chunk) => chunk.length > 0 && encoder.encode(chunk).length <= 2000), "Every speech chunk stays inside the UTF-8 byte limit");

  console.log("\n--- 7. Study Clock Accounting ---");
  const originalNow = Date.now;
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalDocument = (globalThis as { document?: unknown }).document;
  let now = 1_000_000;
  Date.now = () => now;
  Object.assign(globalThis, {
    window: globalThis,
    document: {
      visibilityState: "visible",
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const loggedMinutes: number[] = [];
  let clock!: ClockApi;
  const Probe = () => {
    clock = useStudyClock((minutes) => loggedMinutes.push(minutes));
    return React.createElement("div");
  };
  let renderer!: TestRenderer.ReactTestRenderer;
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    if (String(args[0] || "").includes("react-test-renderer is deprecated")) return;
    originalConsoleError(...args);
  };
  await act(async () => { renderer = TestRenderer.create(React.createElement(Probe)); });
  console.error = originalConsoleError;
  await act(async () => { clock.clockIn(); });
  now += 65_000;
  await act(async () => { clock.pause(); });
  const afterPause = loggedMinutes.reduce((sum, minutes) => sum + minutes, 0);
  now += 5 * 60_000; // idle pause must never become study time
  await act(async () => { clock.clockOut(); });
  const afterPausedClockOut = loggedMinutes.reduce((sum, minutes) => sum + minutes, 0);
  check(Math.abs(afterPause - 1.08) < 0.01, "Active 65-second segment is logged fractionally");
  check(afterPausedClockOut === afterPause, "Clocking out while paused does not log idle wall time");
  await act(async () => { clock.clockIn(); });
  now += 30_000;
  await act(async () => { clock.takeBreak(); });
  const beforeBreakClockOut = loggedMinutes.reduce((sum, minutes) => sum + minutes, 0);
  now += 10 * 60_000;
  await act(async () => { clock.clockOut(); renderer.unmount(); });
  check(loggedMinutes.reduce((sum, minutes) => sum + minutes, 0) === beforeBreakClockOut, "Clocking out on break does not log break time");
  Date.now = originalNow;
  if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = originalWindow;
  if (originalDocument === undefined) delete (globalThis as { document?: unknown }).document;
  else (globalThis as { document?: unknown }).document = originalDocument;

  console.log("\n--- 8. Curriculum Ground Truth ---");
  check(nmimsSem1Subjects().length === 6, "NMIMS Semester 1 ground truth has 6 subjects");
  const cbseClass10 = cbseCatalogFor("Class 10 CBSE");
  check(cbseClass10 !== null && cbseClass10.length > 0, "CBSE Class 10 catalog found");
  const courseSuggest = await aiSuggestSubjects("Class 10 CBSE", "school");
  check(courseSuggest.subjects.length > 0, "CBSE suggestion returns subjects without a cloud call");

  console.log("\n--- 9. Scheduler Invariants ---");
  const mockSubjects = [
    { id: 1, name: "Economics", difficulty: "Medium", color: "#6366f1" },
    { id: 2, name: "Mathematics", difficulty: "Hard", color: "#10b981" },
  ];
  const mockTopics = Array.from({ length: 22 }, (_, index) => ({
    id: index + 1,
    subjectId: index < 10 ? 1 : 2,
    unit: `Unit ${index + 1}`,
    title: `Topic ${index + 1}`,
    difficulty: index % 4 === 0 ? "Hard" : "Medium",
    estMinutes: 60,
    position: index + 1,
    mastery: 0,
  }));
  const settings = {
    startDate: "2026-08-22", examDate: "2026-10-01", dailyHours: 2,
    subjectsPerDay: 2, studyDays: "weekdays", bufferDays: 3,
    planMode: "syllabus", studyStyle: "balanced", weakSubject: "none", revisionWeeks: 1,
  };
  const plan = buildPlan(mockSubjects, mockTopics, settings);
  const learnedIds = new Set(plan.tasks.filter((task) => task.kind === "learn").map((task) => task.topicId));
  check(plan.tasks.length > 0, "Planner generates calendar tasks");
  check(plan.stats.scheduledTopics === mockTopics.length && learnedIds.size === mockTopics.length, "No lesson is silently dropped");
  check(plan.tasks.every((task) => task.date >= settings.startDate && task.date <= settings.examDate), "Every task stays inside the study window");
  check(countStudyDays("2026-08-22", "2026-08-30", "weekdays") === 5, "Study-day counter excludes weekends");
  check(projectCompletionDate("2026-08-22", 240, 1, "weekdays") === "2026-08-31", "Completion projection follows enabled study days");
  const revisionPlan = buildPlan(mockSubjects, mockTopics, { ...settings, planMode: "revision" });
  check(revisionPlan.tasks.some((task) => task.kind === "revise"), "Revision mode schedules revision cards");

  console.log("\n--- 10. Validation, Transcript & Safe Rendering ---");
  check(isIsoDate("2026-02-28"), "Strict date accepts a real date");
  check(!isIsoDate("2026-02-31") && !isIsoDate("not-a-date"), "Strict date rejects normalized/impossible dates");
  let rejectedInfinity = false;
  try { finiteNumber(Infinity, "minutes", { min: 0, max: 10 }); } catch { rejectedInfinity = true; }
  check(rejectedInfinity, "Numeric validation rejects Infinity");
  check(mergeTranscriptSegments(["Hello world", "Hello world this is a test"]) === "Hello world this is a test", "Cumulative transcript overlap is deduplicated");
  const rendered = mdToHtml("**Bold** and *Italic* with [link](https://example.com)");
  check(rendered.includes("<strong>Bold</strong>") && rendered.includes("<em>Italic</em>"), "Markdown emphasis renders");
  check(rendered.includes('href="https://example.com"') && rendered.includes('rel="noopener noreferrer"'), "Safe links get isolation attributes");
  const unsafe = mdToHtml(`<img src=x onerror=alert(1)> [bad](javascript:alert(1))`);
  check(!unsafe.includes("<img") && !unsafe.includes('href="javascript:'), "Renderer blocks raw HTML and unsafe URL protocols");

  console.log("\n==================================================");
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");
  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error("Test runner exception:", error);
  process.exit(1);
});
