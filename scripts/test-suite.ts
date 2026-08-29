import {
  aiSuggestSubjects,
  callLLMDetailed,
  extractLlmAction,
  instantTutorReply,
  languageCapabilityReply,
  parseCommand,
  probeProviders,
  tutorSystemPrompt,
} from "../src/lib/ai";
import { detectLanguage } from "../src/lib/language";
import { wikiLangFor, searchTerms, teachFromKnowledge, isRelevantKnowledge } from "../src/lib/knowledge";
import { appendChatTurn, isFallbackUser } from "../src/lib/chatTurn";
import { mergeTranscriptSegments } from "../src/lib/transcript";
import { mdToHtml, normalizeCheckpointTitle } from "../src/lib/client";
import { buildPlan, countStudyDays, projectCompletionDate } from "../src/lib/planner";
import { cbseCatalogFor, nmimsSem1Subjects } from "../src/lib/curriculum";
import { finiteNumber, isIsoDate } from "../src/lib/validation";
import { shouldAutoComplete, nextPendingTask } from "../src/lib/completion";
import {
  demoAddSession, demoAddTask, demoDeleteTask, demoFallbackState, demoPatchTask,
  demoResetMutations, demoSessionMinutesForTask,
} from "../src/lib/demoState";
import { nextAction, prioritizeTasks, weakestSubjectIds } from "../src/lib/prioritization";
import {
  backlogFor, backlogToDate, canFitToday, dailyCapacityMinutes, pendingOnDate,
  spreadAcrossDays, suggestedRecovery, todayOverload, GENTLE_EXTRA_PER_DAY,
} from "../src/lib/recovery";
import { validateQuickAdd, QUICK_ADD_KINDS } from "../src/lib/quickAdd";
import type { TaskRow } from "../src/lib/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  const hiReply = languageCapabilityReply("Can you speak Hindi?");
  check(typeof hiReply === "string" && hiReply.includes("हिंदी"), "Hindi capability query");
  const mrReply = languageCapabilityReply("Do you know Marathi?");
  check(typeof mrReply === "string" && mrReply.includes("मराठीत"), "Marathi capability query");
  const taReply = languageCapabilityReply("Can you talk in Tamil?");
  check(typeof taReply === "string" && taReply.includes("தமிழில்"), "Tamil capability query");
  const thReply = languageCapabilityReply("Can you speak Thai?");
  check(typeof thReply === "string" && thReply.includes("ภาษาไทย"), "Thai capability query");
  const enReply = languageCapabilityReply("Do you know English?");
  check(typeof enReply === "string" && enReply.includes("English"), "English capability query");
  const hiScriptReply = languageCapabilityReply("क्या तुम हिंदी बोल सकते हो?");
  check(typeof hiScriptReply === "string" && hiScriptReply.includes("हिंदी"), "Hindi-script capability query (no Latin trigger word)");
  const bnScriptReply = languageCapabilityReply("আপনি কি বাংলায় কথা বলতে পারেন?");
  check(typeof bnScriptReply === "string" && bnScriptReply.includes("বাংলা"), "Bengali-script capability query (no Latin trigger word)");
  check(languageCapabilityReply("explain Hindi grammar") === null, "Study question about Hindi is not a capability reply");
  check(languageCapabilityReply("I need to understand photosynthesis") === null, "Understand + concept is not a capability reply");
  check(languageCapabilityReply("Do you know English literature?") === null, "English literature question is not a capability reply");
  check(parseCommand("I study better in the dark") === undefined, "Casual mention of dark is not a theme command");
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
  check(parseCommand("what is dark mode?") === undefined, "Question about dark mode never changes the theme");
  check(parseCommand("should I re-plan my week?") === undefined, "Should-I question never re-plans");
  check(parseCommand("how do I stop the timer?") === undefined, "Question about stopping never stops the timer");
  check(parseCommand("make today's workload lighter") === undefined, "Vague workload request is answered, not executed");
  check(parseCommand("re-plan my week")?.type === "replan", "Clear imperative re-plan still executes");
  check(parseCommand("stop the timer")?.type === "stopTimer", "Clear imperative stop still executes");
  check(parseCommand("switch to dark mode")?.type === "theme" && parseCommand("switch to dark mode")?.payload === "dark", "Clear imperative theme change still executes");

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
  const englishLesson = teachFromKnowledge({
    title: "Photosynthesis",
    extract: "Photosynthesis is the process by which green plants convert light energy into chemical energy. It takes place mainly in chloroplasts. Carbon dioxide and water are converted into glucose and oxygen. The light-dependent reactions produce ATP and NADPH. The Calvin cycle then fixes carbon into sugar.",
    url: "https://en.wikipedia.org/wiki/Photosynthesis",
    related: ["Chloroplast", "Calvin cycle"],
    lang: "en",
  }, "What is photosynthesis?", "ug");
  check(englishLesson.includes("### Photosynthesis") && englishLesson.includes("**Definition.**"),
    "English local lesson no longer crashes on missing HEADERS.en");
  const marathiLesson = teachFromKnowledge({
    title: "प्रकाशसंश्लेषण",
    extract: "प्रकाशसंश्लेषण ही प्रक्रिया आहे ज्यामध्ये वनस्पती सूर्यप्रकाशाचे रूपांतर रासायनिक ऊर्जेत करतात. ही क्रिया हरितद्रव्यात होते. कार्बन डायऑक्साइड आणि पाणी यांपासून ग्लुकोज तयार होतो.",
    url: "https://mr.wikipedia.org/wiki/x",
    related: [],
    lang: "mr",
  }, "प्रकाशसंश्लेषण म्हणजे काय?", "school");
  check(marathiLesson.includes("###") && marathiLesson.includes("परिभाषा"),
    "Marathi wiki extract uses Hindi structure headers instead of crashing");

  check(isRelevantKnowledge({
    title: "Photosynthesis",
    extract: "Photosynthesis is the process by which green plants convert light energy into chemical energy stored as sugar.",
    url: "https://en.wikipedia.org/wiki/Photosynthesis",
    related: [],
    lang: "en",
  }, "What is photosynthesis?"), "On-topic wiki hit is accepted");
  check(!isRelevantKnowledge({
    title: "The Alabama Solution",
    extract: "The Alabama Solution is a 2025 American documentary film about a prison system.",
    url: "https://en.wikipedia.org/wiki/The_Alabama_Solution",
    related: [],
    lang: "en",
  }, "what is the perfect solution of any war?"), "Off-topic wiki hit is rejected");
  {
    const prompt = tutorSystemPrompt({
      name: "Aarav", courseName: "Class 10 CBSE", level: "school", examDate: "2026-11-30",
      daysLeft: 100, dailyHours: 2,
      subjects: [{ id: 1, name: "Science", difficulty: "Medium", done: 3, total: 10 }],
      today: [{ title: "Photosynthesis", kind: "learn", minutes: 60, status: "pending" }],
      progressPct: 55, streak: 6, hoursThisWeek: 8.5, overdue: 2,
    });
    check(prompt.includes("Photosynthesis") && prompt.includes("Science") && prompt.includes("TEACH"),
      "Tutor prompt includes today's plan, subjects, and teaching instructions");
  }

  console.log("\n--- 2f. Chat turn is never dropped from UI state ---");
  const emptyTurn = appendChatTurn([], "What should I study today?", "Study photosynthesis first.");
  check(emptyTurn.length === 2 && emptyTurn[0].role === "user" && emptyTurn[1].role === "assistant",
    "Empty history receives both sides of the turn");
  const alreadySaved = appendChatTurn(emptyTurn, "What should I study today?", "Study photosynthesis first.");
  check(alreadySaved.length === 2, "Persisted turn is not duplicated");
  const userOnly = appendChatTurn(
    [{ id: 9, userId: 1, role: "user", content: "hello", createdAt: "2026-08-22T00:00:00.000Z" }],
    "hello",
    "Hi — I am Shigun.",
  );
  check(userOnly.length === 2 && userOnly[1].content.includes("Shigun"),
    "Assistant reply is attached when only the user line was saved");
  check(isFallbackUser({ id: 0 }) && isFallbackUser(null) && !isFallbackUser({ id: 4 }),
    "Fallback user detection");

  console.log("\n--- 2c. Local curriculum replies must stay on-topic ---");
  {
    // The chat route needs DATABASE_URL only at import time (the pool is lazy);
    // no query runs in this test.
    const oldDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = "postgres://test:test@localhost:5432/test";
    const { localCurriculumReply, POST } = await import("../src/app/api/chat/route");
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
    const chatRes = await POST(new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-key": "u_CHATTESTCHATTESTCHAT" },
      body: JSON.stringify({ message: "What should I study today?" }),
    }));
    const chatJson = await chatRes.json() as { reply?: string; state?: { messages?: { role: string }[] } };
    check(chatRes.ok && typeof chatJson.reply === "string" && chatJson.reply.length > 0,
      "Chat POST always returns a visible reply");
    check(Array.isArray(chatJson.state?.messages) && chatJson.state.messages.some((m) => m.role === "assistant"),
      "Chat POST state includes the assistant message even without a database");
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
  const oldCerebras = process.env.CEREBRAS_API_KEY;
  const oldMistral = process.env.MISTRAL_API_KEY;
  process.env.GEMINI_API_KEY = "test-gemini";
  process.env.CEREBRAS_API_KEY = "test-cerebras";
  delete process.env.MISTRAL_API_KEY;
  const called: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    called.push(url);
    if (url.includes("cerebras")) {
      return new Response(JSON.stringify({ error: { message: "API key rejected" } }), {
        status: 403, headers: { "content-type": "application/json" },
      });
    }
    if (url.includes("generativelanguage")) {
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Fallback answer" }] } }] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "Fallback answer" } }] }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const failover = await callLLMDetailed("Tutor", [{ role: "user", content: "Explain demand" }], 200);
  check(failover.text === "Fallback answer" && failover.provider === "gemini", "Rejected Cerebras key falls through to Gemini");
  check(called.filter((url) => url.includes("cerebras")).length === 1, "Auth failure does not loop through Cerebras models");
  globalThis.fetch = originalFetch;
  if (oldGemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldGemini;
  if (oldCerebras === undefined) delete process.env.CEREBRAS_API_KEY; else process.env.CEREBRAS_API_KEY = oldCerebras;
  if (oldMistral === undefined) delete process.env.MISTRAL_API_KEY; else process.env.MISTRAL_API_KEY = oldMistral;

  console.log("\n--- 4b. v9 Provider Chain: retired models, sticky success, probe ---");
  {
    const originalFetch = globalThis.fetch;
    const oldGemini = process.env.GEMINI_API_KEY;
    const oldCerebras = process.env.CEREBRAS_API_KEY;
    const oldMistral = process.env.MISTRAL_API_KEY;
    const oldSambanova = process.env.SAMBANOVA_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.MISTRAL_API_KEY;
    delete process.env.SAMBANOVA_API_KEY;
    process.env.CEREBRAS_API_KEY = "test-cerebras";
    const stickyGlobal = globalThis as { __studyPlannerPreferred?: { provider: string; model: string } };
    delete stickyGlobal.__studyPlannerPreferred;

    const calls: { url: string; model: string }[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const model = String(JSON.parse(String(init?.body || "{}")).model || "");
      calls.push({ url, model });
      // Simulate a retired Cerebras model: first call 404s, second model answers.
      if (model === "llama-3.3-70b" && calls.filter((c) => c.model === "llama-3.3-70b").length === 1) {
        return new Response(JSON.stringify({ error: { message: "model not found: decommissioned" } }), {
          status: 404, headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ choices: [{ message: { content: "Chain answer" } }] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;

    const first = await callLLMDetailed("Tutor", [{ role: "user", content: "explain demand" }], 200);
    check(first.text === "Chain answer" && first.provider === "cerebras",
      "Retired Cerebras model falls through the chain to a live replacement");
    check(first.model && first.model !== "llama-3.3-70b",
      "Fallback picked a replacement model, not the retired ID");

    const second = await callLLMDetailed("Tutor", [{ role: "user", content: "explain supply" }], 200);
    check(second.provider === "cerebras" && second.model === first.model && second.text === "Chain answer",
      "Sticky success reuses the provider+model that answered");
    check(calls[calls.length - 1].model === first.model,
      "Second call goes straight to the sticky model");

    const probes = await probeProviders();
    check(Array.isArray(probes) && probes.some((probe) => probe.label === "Cerebras" && probe.ok),
      "Connectivity probe verifies the live provider end-to-end");
    check(probes.every((probe) => !JSON.stringify(probe).includes("test-cerebras")),
      "Probe results never leak the API key");

    globalThis.fetch = originalFetch;
    delete stickyGlobal.__studyPlannerPreferred;
    if (oldGemini === undefined) delete process.env.GEMINI_API_KEY; else process.env.GEMINI_API_KEY = oldGemini;
    if (oldCerebras === undefined) delete process.env.CEREBRAS_API_KEY; else process.env.CEREBRAS_API_KEY = oldCerebras;
    if (oldMistral === undefined) delete process.env.MISTRAL_API_KEY; else process.env.MISTRAL_API_KEY = oldMistral;
    if (oldSambanova === undefined) delete process.env.SAMBANOVA_API_KEY; else process.env.SAMBANOVA_API_KEY = oldSambanova;
  }

  console.log("\n--- 5. Study Clock Accounting ---");
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

  // Switching lessons mid-session banks the ACTIVE minutes of the previous
  // lesson — the running session's partial time is never silently eaten.
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Probe));
  });
  const beforeSwitch = loggedMinutes.reduce((sum, minutes) => sum + minutes, 0);
  await act(async () => { clock.clockIn({ taskId: 1 }); });
  now += 40_000;
  await act(async () => { clock.clockIn({ taskId: 2 }); });
  const afterSwitch = loggedMinutes.reduce((sum, minutes) => sum + minutes, 0);
  check(Math.abs(afterSwitch - beforeSwitch - 40 / 60) < 0.02, "Switching lessons banks the active 40-second segment");
  await act(async () => { clock.clockOut(); renderer.unmount(); });
  Date.now = originalNow;
  if (originalWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = originalWindow;
  if (originalDocument === undefined) delete (globalThis as { document?: unknown }).document;
  else (globalThis as { document?: unknown }).document = originalDocument;

  console.log("\n--- 5b. Study-Clock Auto-Completion Rule ---");
  check(shouldAutoComplete(28, 15, "pending"), "28 logged minutes complete a 15-minute recall");
  check(shouldAutoComplete(15, 15, "pending"), "Exactly the planned time completes");
  check(!shouldAutoComplete(14, 15, "pending"), "Below planned time stays pending");
  check(!shouldAutoComplete(30, 15, "done"), "Already-done task is never re-marked");
  check(!shouldAutoComplete(30, 15, "skipped"), "Skipped task is never auto-completed");
  const dayTasks = [
    { id: 1, date: "2026-08-27", status: "done", position: 0 },
    { id: 2, date: "2026-08-27", status: "pending", position: 1 },
    { id: 3, date: "2026-08-27", status: "pending", position: 2 },
    { id: 4, date: "2026-08-28", status: "pending", position: 0 },
  ];
  check(nextPendingTask(dayTasks, "2026-08-27", null)?.id === 2, "Next task is the first pending one of the day");
  check(nextPendingTask(dayTasks, "2026-08-27", 1)?.id === 2, "Completed task is excluded from the queue");
  check(nextPendingTask(dayTasks, "2026-08-27", 2)?.id === 3, "Next task follows schedule order after the exclusion");
  check(nextPendingTask(dayTasks, "2026-08-28", null)?.id === 4, "Next-day tasks are found by their own date");
  check(nextPendingTask(dayTasks, "2026-08-29", null) === null, "No pending task returns null");

  console.log("\n--- 5c. Weekly Checkpoint Title Normalization ---");
  check(
    normalizeCheckpointTitle("Weekly Checkpoint Test #0") === "Weekly Checkpoint · Test #1",
    "Legacy space-form #0 normalizes to Test #1"
  );
  check(
    normalizeCheckpointTitle("Weekly Checkpoint · Test #0") === "Weekly Checkpoint · Test #1",
    "Dotted legacy #0 normalizes to Test #1"
  );
  check(
    normalizeCheckpointTitle("Weekly Checkpoint Test #3") === "Weekly Checkpoint · Test #3",
    "Unspaced later numbers keep their count and gain the dot"
  );
  check(
    normalizeCheckpointTitle("Weekly Checkpoint · Test #4") === "Weekly Checkpoint · Test #4",
    "Canonical dotted form is already stable"
  );
  check(
    normalizeCheckpointTitle("Recall: Photosynthesis") === "Recall: Photosynthesis",
    "Non-checkpoint titles are never touched"
  );

  console.log("\n--- 5d. Preview Demo Layer (in-memory mutations) ---");
  {
    const baseState = demoFallbackState("u_demo_test");
    check(baseState.tasks.length === 28, "Demo plan has 28 tasks");
    const pending = baseState.tasks.find((t) => t.status === "pending");
    check(!!pending, "Demo plan contains pending tasks");
    if (pending) {
      demoAddSession({
        subjectId: pending.subjectId, taskId: pending.id, date: pending.date,
        minutes: pending.plannedMinutes + 5, mode: "clock", eventId: "evt-demo-test",
        createdAt: new Date().toISOString(),
      });
      check(
        demoSessionMinutesForTask(pending.id) >= pending.plannedMinutes,
        "Demo session minutes accumulate for the task"
      );
      demoPatchTask(pending.id, { status: "done" });
      check(
        demoFallbackState("u_demo_test").tasks.find((t) => t.id === pending.id)?.status === "done",
        "Demo task override survives state regeneration"
      );
      demoDeleteTask(pending.id);
      check(
        !demoFallbackState("u_demo_test").tasks.some((t) => t.id === pending.id),
        "Demo task deletion survives state regeneration"
      );
    }
    const added = demoAddTask({
      date: "2026-08-28", subjectId: null, topicId: null, kind: "practice",
      title: "Demo added task", detail: "Added in the preview.",
      plannedMinutes: 30, actualMinutes: 0, status: "pending", position: 99,
    });
    check(
      demoFallbackState("u_demo_test").tasks.some((t) => t.id === added.id),
      "Demo added task appears in the next state"
    );
    demoResetMutations();
    check(
      demoFallbackState("u_demo_test").tasks.length === 28,
      "Demo reset restores the baseline plan"
    );
  }

  console.log("\n--- 6. Curriculum Ground Truth ---");
  check(nmimsSem1Subjects().length === 6, "NMIMS Semester 1 ground truth has 6 subjects");
  const cbseClass10 = cbseCatalogFor("Class 10 CBSE");
  check(cbseClass10 !== null && cbseClass10.length > 0, "CBSE Class 10 catalog found");
  const courseSuggest = await aiSuggestSubjects("Class 10 CBSE", "school");
  check(courseSuggest.subjects.length > 0, "CBSE suggestion returns subjects without a cloud call");

  console.log("\n--- 7. Scheduler Invariants ---");
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

  console.log("\n--- 8. Validation, Transcript & Safe Rendering ---");
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

  console.log("\n--- 9. Unconfigured-Database Guard ---");
  // Without DATABASE_URL the db handle must reject full drizzle-style chains
  // with one clear sentinel error — never a confusing TypeError, and never an
  // orphaned rejected promise (regression: `db.select(...).from is not a function`).
  const { unavailableDb, DatabaseUnavailableError } = await import("../src/db");
  const { users } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { withDbGuard, isDatabaseConfigError } = await import("../src/lib/routeGuard");
  // A fresh handle, independent of how earlier sections mutated DATABASE_URL.
  const db = unavailableDb();
  let chainedRejection: unknown = null;
  try {
    await db.select().from(users).where(eq(users.userKey, "u_testsuite")).limit(1);
  } catch (error) { chainedRejection = error; }
  check(chainedRejection instanceof DatabaseUnavailableError, "Chained select rejects with the DATABASE_URL sentinel");
  check(isDatabaseConfigError(chainedRejection), "Guard classifies the sentinel as a config error");
  let insertRejection: unknown = null;
  try {
    await db.insert(users).values({ userKey: "u_testsuite" }).onConflictDoNothing().returning();
  } catch (error) { insertRejection = error; }
  check(insertRejection instanceof DatabaseUnavailableError, "Chained insert rejects with the DATABASE_URL sentinel");
  let transactionRan = false;
  let transactionRejection: unknown = null;
  try {
    await db.transaction(async () => { transactionRan = true; });
  } catch (error) { transactionRejection = error; }
  check(transactionRejection instanceof DatabaseUnavailableError && !transactionRan, "Transaction rejects without invoking its callback");
  let unhandled = false;
  const onUnhandled = () => { unhandled = true; };
  process.on("unhandledRejection", onUnhandled);
  try {
    try {
      await db.update(users).set({ name: "x" }).where(eq(users.userKey, "u_testsuite"));
      await db.delete(users).where(eq(users.userKey, "u_testsuite"));
    } catch { /* expected sentinel rejections */ }
    await new Promise((resolve) => setTimeout(resolve, 20));
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
  check(!unhandled, "No orphaned rejections leak from the unavailable handle");
  const guarded = withDbGuard(async () => { throw new DatabaseUnavailableError(); });
  let guardedResponse: Response | null = null;
  try { guardedResponse = await guarded(new Request("https://app.test/api/x")); } catch { /* not thrown */ }
  check(guardedResponse?.status === 503, "withDbGuard converts the sentinel into a friendly 503");
  const guardedBody = guardedResponse ? await guardedResponse.json() as { code?: string } : null;
  check(guardedBody?.code === "DATABASE_UNAVAILABLE", "503 body carries the DATABASE_UNAVAILABLE code");
  const passthrough = withDbGuard(async () => { throw new Error("a genuine bug"); });
  let passthroughCode = 0;
  try { await passthrough(new Request("https://app.test/api/x")); } catch { passthroughCode = 500; }
  check(passthroughCode === 500, "Non-database errors are rethrown untouched");

  console.log("\n--- 10. Task Prioritization (What should I do now?) ---");
  const T = "2026-08-29";
  const mkTask = (patch: Partial<TaskRow>): TaskRow => ({
    id: 1, userId: 1, date: T, subjectId: null, topicId: null,
    kind: "learn", title: "Task", detail: "", plannedMinutes: 30,
    actualMinutes: 0, status: "pending", position: 0, ...patch,
  });
  let ranked = prioritizeTasks([
    mkTask({ id: 1, date: T }),
    mkTask({ id: 2, date: "2026-08-27" }),
    mkTask({ id: 3, date: "2026-08-28" }),
  ], T);
  check(ranked[0].id === 2 && ranked[0].reason === "overdue", "Overdue task comes first");
  check(ranked[1].id === 3, "Older overdue work outranks newer overdue work");
  check(ranked[0].priorityLabel === "Start here", "Top task is labelled Start here");
  ranked = prioritizeTasks([
    mkTask({ id: 11, date: "2026-09-05" }),
    mkTask({ id: 12, date: T }),
  ], T);
  check(ranked[0].id === 12 && ranked[0].reason === "due-today", "Today's task outranks a normal future task");
  ranked = prioritizeTasks([
    mkTask({ id: 21, kind: "learn", date: T }),
    mkTask({ id: 22, kind: "revise", date: T }),
  ], T);
  check(ranked[0].id === 22 && ranked[0].reason === "revision", "Revision due gets appropriate priority");
  ranked = prioritizeTasks([
    mkTask({ id: 31, status: "done", date: "2026-08-27" }),
    mkTask({ id: 32, status: "skipped", date: "2026-08-27" }),
    mkTask({ id: 33, date: T }),
  ], T);
  check(ranked.length === 1 && ranked[0].id === 33, "Completed and skipped tasks are excluded");
  ranked = prioritizeTasks([
    mkTask({ id: 41, subjectId: 1, date: "2026-09-12" }),
    mkTask({ id: 42, subjectId: 2, date: "2026-09-12" }),
  ], T, { weakSubjectIds: [2] });
  check(ranked[0].id === 42 && ranked[0].reason === "weak-subject", "Weak-subject tasks are prioritised");
  const detA = prioritizeTasks([mkTask({ id: 51, date: T }), mkTask({ id: 52, date: T })], T).map((x) => x.id).join(",");
  const detB = prioritizeTasks([mkTask({ id: 52, date: T }), mkTask({ id: 51, date: T })], T).map((x) => x.id).join(",");
  check(detA === detB && detA === "51,52", "Ordering is deterministic regardless of input order");
  const pair = nextAction([mkTask({ id: 61, date: T }), mkTask({ id: 62, date: T })], T);
  check(pair.now?.id === 61 && pair.next?.id === 62, "nextAction exposes the NOW/NEXT pair");
  const partial = prioritizeTasks([mkTask({ id: 63, date: T, actualMinutes: 10 })], T);
  check(partial[0].priorityLabel === "Continue with this", "Partially-started task reads as Continue");
  check(weakestSubjectIds([{ id: 1, done: 2, total: 4 }, { id: 2, done: 0, total: 4 }]).join(",") === "2",
    "weakestSubjectIds finds the lowest-completion subject");

  console.log("\n--- 11. Quick Add Validation ---");
  const good = validateQuickAdd({ title: "Physics — Current Electricity", minutes: 30, date: T, subjectId: 2, kind: "practice" });
  check(good.valid, "Valid quick-add input passes");
  const noTitle = validateQuickAdd({ title: "   ", minutes: 30, date: T, subjectId: null, kind: "practice" });
  check(!noTitle.valid && !!noTitle.errors.title, "Missing title is rejected");
  check(!validateQuickAdd({ title: "X", minutes: 0, date: T, subjectId: null, kind: "practice" }).valid, "Zero minutes is rejected");
  check(!validateQuickAdd({ title: "X", minutes: 999, date: T, subjectId: null, kind: "practice" }).valid, "Absurd duration is rejected");
  check(!validateQuickAdd({ title: "X", minutes: 12.5, date: T, subjectId: null, kind: "practice" }).valid, "Fractional minutes are rejected");
  check(!validateQuickAdd({ title: "X", minutes: 30, date: "2026-02-31", subjectId: null, kind: "practice" }).valid,
    "Impossible dates are rejected");
  check(!validateQuickAdd({ title: "X", minutes: 30, date: T, subjectId: -3, kind: "practice" }).valid,
    "Invalid subject ids are rejected");
  check(!validateQuickAdd({ title: "X", minutes: 30, date: T, subjectId: null, kind: "buffer" }).valid,
    "Scheduler-internal task kinds are rejected");
  const withSubject = validateQuickAdd({ title: "X", minutes: 30, date: T, subjectId: 7, kind: "learn" });
  check(withSubject.valid, "A valid subject association passes through");
  check(!(QUICK_ADD_KINDS as readonly string[]).includes("buffer"), "Quick add never creates buffer tasks");

  console.log("\n--- 12. Backlog Recovery & Realistic Redistribution ---");
  const capacity = 120; // a 2-hour day
  const backlogTasks = [
    mkTask({ id: 71, date: "2026-08-25", plannedMinutes: 60 }),
    mkTask({ id: 72, date: "2026-08-26", plannedMinutes: 60 }),
    mkTask({ id: 73, date: "2026-08-28", plannedMinutes: 30 }),
  ];
  const todayPlan = [mkTask({ id: 74, date: T, plannedMinutes: 120 })];
  const all = [...todayPlan, ...backlogTasks];
  const backlog = backlogFor(all, T);
  check(backlog.count === 3 && backlog.minutes === 150, "Backlog counts only pending past-dated work");
  check(pendingOnDate(all, T).minutes === 120, "Today's pending minutes are measured separately");
  check(dailyCapacityMinutes({ dailyHours: 2 }) === 120, "Daily capacity derives from settings");
  check(todayOverload(all, T, capacity) === 150, "Overload = today's plan + backlog beyond capacity");
  check(!canFitToday(all, T, capacity), "A 150-minute backlog does not fit a full 2-hour day");
  check(canFitToday(todayPlan, T, capacity), "An empty backlog always fits");
  const pace = suggestedRecovery(180, 20);
  check(pace !== null && pace.minutesPerDay === GENTLE_EXTRA_PER_DAY && pace.days === 6,
    "Suggested recovery: +30 min/day for 6 days");
  check(suggestedRecovery(0, 20) === null, "No overload → no recovery needed");
  const spread = spreadAcrossDays(all, T, capacity);
  check(spread.assignments.length === backlogTasks.length, "Every backlog task is represented in the spread");
  check(spread.assignments.every((a) => a.date > T), "Spread moves work forward, never backward");
  const load = new Map<string, number>();
  for (const assignment of spread.assignments) {
    const minutes = all.find((task) => task.id === assignment.id)?.plannedMinutes ?? 0;
    load.set(assignment.date, (load.get(assignment.date) || 0) + minutes);
  }
  check([...load.values()].every((minutes) => minutes <= capacity), "Spread never overloads a day beyond capacity");
  const spreadAgain = spreadAcrossDays(all, T, capacity);
  check(JSON.stringify(spread.assignments) === JSON.stringify(spreadAgain.assignments), "Spread assignment is deterministic");
  const dateByTask = new Map(spread.assignments.map((assignment) => [assignment.id, assignment.date]));
  check((dateByTask.get(71) || "z") <= (dateByTask.get(73) || "z"), "Oldest overdue task is placed no later than newer ones");
  const toTomorrow = backlogToDate(all, T, "2026-08-30");
  check(toTomorrow.length === 3 && toTomorrow.every((assignment) => assignment.date === "2026-08-30"),
    "Move-to-tomorrow targets every backlog task");

  console.log("\n--- 13. Responsive & Accessibility Static Checks ---");
  const enhancementCss = readFileSync(join(process.cwd(), "src/app/practical-enhancements.css"), "utf8");
  check(enhancementCss.includes("@media(max-width:640px)"), "Enhancement CSS carries the phone breakpoint");
  check(enhancementCss.includes("clamp(") && enhancementCss.includes("minmax(") && enhancementCss.includes("auto-fit"),
    "Enhancement layouts use fluid sizing (clamp/minmax/auto-fit)");
  check(enhancementCss.includes("prefers-reduced-motion"), "Reduced motion is respected");
  check(enhancementCss.includes("prefers-contrast"), "High contrast is respected");
  check(enhancementCss.includes("--tap"), "Touch targets use the shared tap token");
  const globalsCss = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  check(globalsCss.includes("--tap:44px"), "The shared touch floor is 44px");

  console.log("\n==================================================");
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");
  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error("Test runner exception:", error);
  process.exit(1);
});
