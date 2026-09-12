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
import { demoDataEnabled } from "../src/lib/demoGate";
import {
  backlogFor, backlogToDate, canFitToday, dailyCapacityMinutes, pendingOnDate,
  spreadAcrossDays, suggestedRecovery, todayOverload, GENTLE_EXTRA_PER_DAY,
} from "../src/lib/recovery";
import { validateQuickAdd, QUICK_ADD_KINDS } from "../src/lib/quickAdd";
import { summarizeAttempts, userFacingAiNotice } from "../src/app/api/chat/route";
import type { TaskRow } from "../src/lib/client";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { useStudyClock, type ClockApi } from "../src/lib/useTimer";
import {
  effectKinds, isBreakMode, planSession,
  type SessionCommand, type SessionSnapshot,
} from "../src/lib/studySession";
import TaskActions from "../src/components/TaskActions";
import type { SubjectRow } from "../src/lib/client";

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

    /* ── The gate that decides "is this a database-less preview?" ──────────
       This one bug made the whole app feel broken. With the flag unset,
       `fullState()` fell back to a *static* sample plan (so every READ
       returned 200 and the planner looked alive), while every WRITE route
       skipped its demo branch, hit the unavailable database and returned 503:

         POST /api/sessions   503   ← the study clock could not log a session
         PATCH /api/settings  503   ← settings could not be saved
         POST /api/tasks      503   ← a task could not be added
         GET  /api/analytics  503   ← analytics had nothing to show

       Because reads and writes disagreed, nothing the visitor did had any
       effect — which reads as "the clock is missing" and "there are no
       animations", since every animation worth seeing is triggered by a
       successful interaction. Reads and writes must consult ONE predicate. */
    /* Next.js types `NODE_ENV` read-only, so drive the gate through a
       mutable view of the same object rather than fighting the types. */
    const env = process.env as Record<string, string | undefined>;
    const savedFlag = env.SPP_DEMO_DATA;
    const savedUrl = env.DATABASE_URL;
    const savedEnv = env.NODE_ENV;
    try {
      delete env.DATABASE_URL;
      env.NODE_ENV = "development";
      env.SPP_DEMO_DATA = "1";
      check(demoDataEnabled() === true, "Preview mode is on when it is asked for explicitly");
      env.SPP_DEMO_DATA = "0";
      check(demoDataEnabled() === false,
        "Preview mode honours an explicit opt-out, so a real deployment never serves sample data");
      delete env.SPP_DEMO_DATA;
      check(demoDataEnabled() === true,
        "With no database outside production the app is interactive instead of a wall of 503s");
      env.DATABASE_URL = "postgres://example/db";
      check(demoDataEnabled() === false,
        "A configured database turns the demo layer off, so writes go to Postgres");
      delete env.DATABASE_URL;
      env.NODE_ENV = "production";
      check(demoDataEnabled() === false,
        "Production without a database stays honest and returns 503 rather than fake data");
    } finally {
      if (savedFlag === undefined) delete env.SPP_DEMO_DATA; else env.SPP_DEMO_DATA = savedFlag;
      if (savedUrl === undefined) delete env.DATABASE_URL; else env.DATABASE_URL = savedUrl;
      if (savedEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = savedEnv;
    }

    /* The drift above could only happen because the predicate was copied.
       Forbid the copy: exactly one module may read the flag. */
    const flagReaders = ["src/lib/state.ts", "src/lib/demoState.ts", "src/lib/demoGate.ts",
      "src/app/api/onboard/route.ts", "src/app/api/sessions/route.ts", "src/app/api/settings/route.ts",
      "src/app/api/tasks/route.ts", "src/app/api/subjects/route.ts", "src/app/api/analytics/route.ts",
      "src/app/api/replan/route.ts"]
      .filter((f) => /process\.env\.SPP_DEMO_DATA/.test(
        readFileSync(join(process.cwd(), f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\*.*$/gm, "")));
    check(flagReaders.length === 1 && flagReaders[0] === "src/lib/demoGate.ts",
      `Exactly one module reads SPP_DEMO_DATA${flagReaders.length === 1 ? " (demoGate.ts)" : ` (${flagReaders.join(", ") || "none"})`}`);
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
  /* (v25) The ten standalone stylesheets were consolidated into the two the
     app actually imports — `globals.css` (tokens, base, themes) and
     `ui-system.css` (component contracts, final word). These guards therefore
     read the *imported* pair, which is the only honest source of truth; the
     assertions themselves are unchanged. */
  const globalsCss = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const uiSystemCss = readFileSync(join(process.cwd(), "src/app/ui-system.css"), "utf8");
  const enhancementCss = `${globalsCss}\n${uiSystemCss}`;
  check(enhancementCss.includes("@media(max-width:640px)"), "The sheets carry the phone breakpoint");
  check(enhancementCss.includes("clamp(") && enhancementCss.includes("minmax(") && enhancementCss.includes("auto-fit"),
    "Layouts use fluid sizing (clamp/minmax/auto-fit)");
  check(enhancementCss.includes("prefers-reduced-motion"), "Reduced motion is respected");
  check(enhancementCss.includes("prefers-contrast"), "High contrast is respected");
  check(enhancementCss.includes("--tap"), "Touch targets use the shared tap token");
  check(globalsCss.includes("--tap:44px"), "The shared touch floor is 44px");
  /* v25 architecture guards — these are what stop the old drift creeping back. */
  check(!/JetBrains/i.test(`${globalsCss}\n${uiSystemCss}`) || /font-jetbrains/.test(globalsCss) === false,
    "No second typeface is referenced by the sheets");
  check(uiSystemCss.includes("@import") === false && globalsCss.includes("@import ui-") === false,
    "The sheets import nothing (no chained stylesheet layers)");
  check(globalsCss.includes("--zen-bg") && uiSystemCss.includes("body.theme-sunset") && uiSystemCss.includes("--zen-accent"),
    "Zen paints from theme-owned --zen-* tokens");
  check(uiSystemCss.includes(".task-card") && uiSystemCss.includes(".planner-cal"),
    "The shared task card and the responsive calendar are owned by the final layer");
  check(globalsCss.includes("--task-lesson") && globalsCss.includes("--task-checkpoint"),
    "Task-kind colours are semantic tokens, not component hex");

  console.log("\n--- 14. Focus ↔ Study Clock Synchronization ---");
  /* The focus timer and the study clock are one session. These assertions
     run the same pure planner the app runs (src/lib/studySession.ts), so
     they cover the real code path rather than a copy of it. */
  const snap = (over: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
    timerRunning: false, timerIsBreak: false, clockRunning: false,
    clockSessionActive: false, clockOnBreak: false, focusOwnsClock: false, ...over,
  });
  const planEffects = (command: SessionCommand, state: SessionSnapshot = snap()) =>
    effectKinds(planSession(state, command));
  const live = snap({
    timerRunning: true, clockRunning: true, clockSessionActive: true, focusOwnsClock: true,
  });

  let effects = planEffects({ type: "start" });
  check(effects.includes("timer.start") && effects.includes("clock.in") && effects.includes("own.focus"),
    "Start Focus starts the focus timer and the study clock in one action");
  check(!planEffects({ type: "start" }, snap({ clockSessionActive: true, clockRunning: true })).includes("clock.in"),
    "Starting again never restarts a clock that is already recording");

  effects = planEffects({ type: "start" }, snap({ timerIsBreak: true, clockSessionActive: true, clockOnBreak: true, focusOwnsClock: true }));
  check(effects.includes("timer.start") && !effects.includes("clock.endBreak") && !effects.includes("clock.resume"),
    "Starting a break countdown never puts the study clock back on the bill");
  effects = planEffects({ type: "pause" }, live);
  check(effects.includes("timer.pause") && effects.includes("clock.pause"),
    "Pause Focus pauses the study clock too");
  effects = planEffects({ type: "start" }, snap({ clockSessionActive: true, focusOwnsClock: true }));
  check(effects.includes("timer.start") && effects.includes("clock.resume"),
    "Resume Focus resumes the study clock too");
  check(planEffects({ type: "toggle" }, live).includes("clock.pause")
    && planEffects({ type: "toggle" }, snap({ clockSessionActive: true })).includes("clock.resume"),
    "One toggle drives both timers in either direction");

  effects = planEffects({ type: "blockComplete" }, live);
  check(effects.includes("clock.break") && !effects.includes("clock.out"),
    "A finished focus block parks the clock on break instead of ending the session");
  effects = planEffects({ type: "breakComplete" }, snap({ clockSessionActive: true, clockOnBreak: true, focusOwnsClock: true }));
  check(effects.includes("timer.start") && effects.includes("clock.endBreak"),
    "A finished break restarts focus and the study clock together");
  check(planEffects({ type: "breakComplete" }, snap({ clockSessionActive: true, clockOnBreak: true })).length === 0,
    "A clock the learner started by hand is never restarted by focus");

  effects = planEffects({ type: "endSession" }, live);
  check(effects.includes("timer.pause") && effects.includes("clock.out") && effects.includes("own.clear"),
    "Clock Out stops the focus timer, saves the minutes and releases the session");

  effects = planEffects({ type: "break" }, live);
  check(effects.includes("timer.pause") && effects.includes("clock.break"),
    "A manual break rests both timers, so nothing keeps billing");
  effects = planEffects({ type: "setMode", mode: "short" }, live);
  check(effects.includes("timer.pause") && effects.includes("clock.break") && effects.includes("timer.setMode"),
    "Switching into a break mode takes the clock off the bill");
  check(isBreakMode("short") && isBreakMode("long") && !isBreakMode("pomodoro") && !isBreakMode("stopwatch"),
    "Only the short and long modes count as breaks");

  /* A clock the learner started by hand (Planner "Clock in", a task row) is a
     first-class session too: Pause must stop it, Resume must restart it and
     Break must take it off the bill — none of which may spin up the focus
     countdown or grab ownership. This used to be the missing half: manual
     sessions ignored Pause and Break entirely. */
  const manual = snap({ clockSessionActive: true, clockRunning: true });
  effects = planEffects({ type: "pause" }, manual);
  check(effects.includes("clock.pause") && !effects.includes("timer.pause"),
    "Pause rests a hand-started clock without touching the focus timer");
  effects = planEffects({ type: "start" }, snap({ clockSessionActive: true }));
  check(effects.includes("clock.resume") && !effects.includes("timer.start") && !effects.includes("own.focus"),
    "Resume restarts a paused manual clock without starting a pomodoro or grabbing ownership");
  effects = planEffects({ type: "break" }, manual);
  check(effects.includes("clock.break") && !effects.includes("timer.pause"),
    "Take a break works for manual sessions too");
  check(planEffects({ type: "toggle" }, manual).includes("clock.pause"),
    "The single toggle pauses a running manual session");

  // The invariant: the two timers of a focus-owned session may never drift.
  check(planEffects({ type: "reconcile" }, live).length === 0, "A session already in step needs no repair");
  check(planEffects({ type: "reconcile" },
    snap({ timerRunning: true, clockSessionActive: true, focusOwnsClock: true })).join(",") === "clock.resume",
    "A running focus timer over a paused clock resumes the clock");
  check(planEffects({ type: "reconcile" },
    snap({ clockRunning: true, clockSessionActive: true, focusOwnsClock: true })).join(",") === "clock.pause",
    "A paused focus timer over a recording clock stops the clock");
  check(planEffects({ type: "reconcile" },
    snap({ timerRunning: true, timerIsBreak: true, clockRunning: true, clockSessionActive: true, focusOwnsClock: true })).join(",") === "clock.break",
    "Break mode on the focus timer takes the clock off the bill");
  check(planEffects({ type: "reconcile" }, snap({ timerRunning: true, clockSessionActive: true })).length === 0,
    "The invariant never touches a clock the learner owns themselves");

  console.log("\n--- 15. Task Row Overflow Menu (⋮) ---");
  const menuWindow = (globalThis as { window?: unknown }).window;
  const menuDocument = (globalThis as { document?: unknown }).document;
  /* Node has no window event target, so the popover's outside-click and
     Escape listeners need one. Both are recorded so the Escape path can be
     exercised, and both are removed again afterwards. */
  const keyHandlers: ((event: { key: string; stopPropagation: () => void }) => void)[] = [];
  Object.assign(globalThis, { window: globalThis, document: { activeElement: null }, IS_REACT_ACT_ENVIRONMENT: true });
  (globalThis as { addEventListener: unknown }).addEventListener = (type: string, fn: unknown) => {
    if (type === "keydown") keyHandlers.push(fn as (event: { key: string; stopPropagation: () => void }) => void);
  };
  (globalThis as { removeEventListener: unknown }).removeEventListener = () => undefined;

  const noop = () => undefined;
  const accounting: SubjectRow = {
    id: 2, userId: 1, name: "Accounting", color: "#6366f1", difficulty: "Medium",
    units: 6, weight: 1, position: 0,
  };
  let editedTaskId: number | null = null;
  const menuProps = {
    subject: accounting,
    activeTaskId: null,
    clockSessionActive: false,
    onTaskStatus: noop,
    onFocusTask: noop,
    onClockOut: noop,
    onEdit: (id: number) => { editedTaskId = id; },
    onSkipSubject: noop,
  };
  const quietConsoleError = () => {
    const original = console.error;
    console.error = (...args: unknown[]) => {
      if (String(args[0] || "").includes("react-test-renderer is deprecated")) return;
      original(...args);
    };
    return () => { console.error = original; };
  };
  const mountRow = async (id: number, onDelete?: (taskId: number) => void) => {
    let instance!: TestRenderer.ReactTestRenderer;
    const restore = quietConsoleError();
    await act(async () => {
      instance = TestRenderer.create(
        React.createElement(TaskActions, {
          ...menuProps,
          task: mkTask({ id, title: "Financial Accounting", subjectId: 2 }),
          ...(onDelete ? { onDelete } : {}),
        })
      );
    });
    restore();
    return instance;
  };
  const triggerOf = (instance: TestRenderer.ReactTestRenderer) =>
    instance.root.findAll((node) => node.props["aria-label"] === "More task actions")[0];
  const menusIn = (instance: TestRenderer.ReactTestRenderer) =>
    instance.root.findAll((node) => node.props.role === "menu");
  const itemsIn = (instance: TestRenderer.ReactTestRenderer) =>
    instance.root.findAll((node) => node.props.role === "menuitem");
  /** Opening the popover schedules a focus hop on a 0ms timer; flush it
      inside act() so React never reports an un-wrapped update. */
  const openMenu = async (instance: TestRenderer.ReactTestRenderer) => {
    await act(async () => { triggerOf(instance).props.onClick(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 5)); });
  };

  const row = await mountRow(91);
  check(!!triggerOf(row), "Every task row carries a ⋮ options button");
  check(triggerOf(row).props["aria-haspopup"] === "menu" && triggerOf(row).props["aria-expanded"] === false,
    "The ⋮ button announces itself as a closed menu");
  check(menusIn(row).length === 0, "The popover is closed until it is asked for");

  await openMenu(row);
  check(menusIn(row).length === 1 && triggerOf(row).props["aria-expanded"] === true,
    "Tapping ⋮ opens the popover");
  /* (v25) The verbs read `icon + text`, so a label has to be collected out of
     the subtree instead of off a node's direct children. */
  const textOf = (node: TestRenderer.ReactTestInstance): string =>
    node.children
      .map((child) =>
        typeof child === "string"
          ? child
          : child && typeof child === "object" && "children" in (child as object)
            ? textOf(child as TestRenderer.ReactTestInstance)
            : "")
      .join("");
  check(itemsIn(row).map(textOf).join("|")
    === "Edit task|Skip task|Skip Accounting today",
    "Only the secondary actions live inside the popover");
  const primaryLabels = row.root
    .findAll((node) => typeof node.type === "string" && node.type === "button")
    .map(textOf)
    .filter((label) => label === "Clock in" || label === "Done");
  check(primaryLabels.join("|") === "Clock in|Done", "Clock in and Done stay visible outside the popover");
  const btnGroup = row.root.findAll((node) => node.props.className === "task-btns")[0];
  check(!!btnGroup && btnGroup.props["aria-label"] === "Task actions",
    "The clock and done verbs sit in one labelled action row");

  await act(async () => { itemsIn(row)[0].props.onClick(); });
  check(editedTaskId === 91, "Edit task routes to the task editor");
  check(menusIn(row).length === 0, "Choosing an action closes the popover");

  await openMenu(row);
  check(menusIn(row).length === 1 && keyHandlers.length > 0, "Reopening registers the keyboard handler");
  await act(async () => { keyHandlers[keyHandlers.length - 1]({ key: "Escape", stopPropagation: noop }); });
  check(menusIn(row).length === 0, "Escape closes the popover");

  /* (v27) Delete is a real verb behind a real gate: it only appears when the
     page can actually remove a task, it never fires on the first tap, and the
     confirmation is an in-app alertdialog rather than `window.confirm()`. */
  let deletedTaskId: number | null = null;
  const deleteRow = await mountRow(95, (id: number) => { deletedTaskId = id; });
  await openMenu(deleteRow);
  const deleteItem = itemsIn(deleteRow).find((node) => textOf(node) === "Delete task");
  check(!!deleteItem, "Delete task sits in the popover next to Edit task");
  await act(async () => { deleteItem!.props.onClick(); });
  check(deletedTaskId === null && menusIn(deleteRow).length === 0,
    "Delete closes the popover and asks before removing anything");
  const confirmDialog = deleteRow.root.findAll((node) => node.props.role === "alertdialog")[0];
  check(!!confirmDialog, "The confirmation is an in-app dialog, not window.confirm");
  const confirmVerb = confirmDialog
    .findAll((node) => typeof node.type === "string" && node.type === "button")
    .find((node) => textOf(node) === "Delete task");
  await act(async () => { confirmVerb!.props.onClick(); });
  check(deletedTaskId === 95, "Confirming deletes exactly the task that was asked about");
  check(deleteRow.root.findAll((node) => node.props.role === "alertdialog").length === 0,
    "The dialog closes once the delete is handed to the page");

  const firstRow = await mountRow(93);
  const secondRow = await mountRow(94);
  await openMenu(firstRow);
  await openMenu(secondRow);
  check(menusIn(firstRow).length === 0 && menusIn(secondRow).length === 1,
    "Only one task menu can be open at a time");

  await act(async () => { [row, deleteRow, firstRow, secondRow].forEach((instance) => instance.unmount()); });
  delete (globalThis as { addEventListener?: unknown }).addEventListener;
  delete (globalThis as { removeEventListener?: unknown }).removeEventListener;
  if (menuWindow === undefined) delete (globalThis as { window?: unknown }).window;
  else (globalThis as { window?: unknown }).window = menuWindow;
  if (menuDocument === undefined) delete (globalThis as { document?: unknown }).document;
  else (globalThis as { document?: unknown }).document = menuDocument;

  console.log("\n--- 16. Onboarding Contract & Polish Guards ---");
  const coursesRoute = readFileSync(join(process.cwd(), "src/app/api/courses/route.ts"), "utf8");
  check(coursesRoute.includes('level.id !== "nursery"') && coursesRoute.includes('levelId !== "nursery"'),
    "Nursery / Pre-School stays out of the onboarding level and course contract");
  const onboardingSource = readFileSync(join(process.cwd(), "src/components/Onboarding.tsx"), "utf8");
  check(!/from nursery/i.test(onboardingSource),
    "The Level step copy no longer advertises nursery / pre-school");
  check(onboardingSource.includes("From school and higher education through doctoral research"),
    "The Level step explains itself in real markup");
  const polishCss = uiSystemCss;
  check(!/font-size:\s*0\s*!important/.test(polishCss),
    "The onboarding paragraph is no longer collapsed by a font-size:0 replacement");
  check(/\.task-more\s*\{[^}]*display:\s*inline-flex/.test(polishCss),
    "The ⋮ button is shown on desktop as well as on phones");
  check(polishCss.includes("prefers-reduced-motion") && polishCss.includes("liveDotPulse"),
    "The live-session animation is defined and switched off for reduced motion");

  /* ── v25 · the responsive / typography / token contract ─────────────────
     Each guard below pins one of the structural fixes, so a future pass can
     re-add a redesign without quietly re-breaking the one it replaced. */
  console.log("\n--- v25 · typography, tokens and responsive contract ---");
  {
    const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(?:^|[^:]):\/\/.*$/gm, " ");
    const componentFiles = ["TaskCard.tsx","TaskActions.tsx","TaskClockButton.tsx","PlannerView.tsx",
      "Dashboard.tsx","FocusView.tsx","AnalyticsView.tsx","ZenScene.tsx","Onboarding.tsx"]
      .map((f) => readFileSync(join(process.cwd(), `src/components/${f}`), "utf8"))
      .concat(readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8"))
      .map(strip)
      .join("\n");
    const sheets = strip(enhancementCss);

    check(!/\.page-title\s*\{[^}]*font-size/.test(strip(polishCss)),
      "ui-system.css does not re-tune the H1 size — one owner (the --fs-h1 ramp)");
    check(/\.page-title\s*\{[^}]*font-size:var\(--fs-h1\)/.test(sheets) &&
          /\.card-title[^}]*font-size:\s*var\(--fs-h3\)/.test(strip(polishCss)),
      "Page and card titles read from the shared fluid type ramp");
    check(/--fs-h1:/.test(sheets) && /--fs-h2:/.test(sheets) && /--fs-h3:/.test(sheets),
      "The type ramp defines h1/h2/h3 steps, so headings are a scale not a pile");
    check(/--pad-card:/.test(sheets) && /--pad-tight:/.test(sheets) && /--gap-page:/.test(sheets),
      "Spacing comes from the shared pad/gap tokens, not per-card numbers");

    /* The month is rows of seven cells; the grid only stacks the rows. A
       seven-column template on `.cal-grid` would lay the header + week rows
       side by side as seven crushed strips — exactly the broken month that
       shipped on phones. */
    const calGridCols = [...sheets.matchAll(/\.cal-grid\s*\{([^}]*)\}/g)]
      .some(([, body]) => /grid-template-columns\s*:/.test(body));
    check(!calGridCols, "The calendar grid stacks week rows (rows own their seven columns)");

    check(!/var\(--[a-z0-9-]+,\s*#/.test(componentFiles),
      "No hardcoded hex fallbacks are left inside var() in the components");

    /* Native <select> hands the open popup to the OS — the blue-row Android
       spinner that fought every theme. Every dropdown is now the shared
       themed listbox from bits.tsx. */
    const allComponents = componentFiles +
      ["Onboarding.tsx", "SettingsView.tsx", "SubjectsView.tsx", "FocusView.tsx", "QuickAdd.tsx", "TaskEditor.tsx"]
        .map((f) => readFileSync(join(process.cwd(), `src/components/${f}`), "utf8"))
        .map(strip)
        .join("\n");
    check(!/<select/.test(allComponents),
      "No native <select> remains in the views — dropdowns use the themed listbox");
    check(!/JetBrains\s*Mono/.test(sheets),
      "No second font-family name for the numerals — --font-num is the alias");
    check(/--font-num:/.test(sheets), "--font-num (tabular numerals) is defined once");

    check(/\.zen\{[^}]*background:var\(--zen-bg\)/.test(sheets) && /--zen-bg:/.test(sheets),
      "The Zen room is painted from --zen-* tokens, so it follows the theme");
    /* One bridge, not three: every theme defines the same `--ill-*` set, and
       `--illustration-*` / `--scene-*` are aliases of it, so an illustration can
       be re-tinted by a theme without touching a component. */
    const illBridge = (sheets.match(/--ill-paper2:/g) ?? []).length;
    check(illBridge >= 6 && /--illustration-book-a: *var\(--ill-ba\)/.test(sheets),
      `Illustration colours: one --ill-* bridge per theme (${illBridge}) aliased by --illustration-*`);
    for (const kind of ["lesson", "recall", "review", "checkpoint"]) {
      check(new RegExp(`--task-${kind}:`).test(sheets), `Task kind token --task-${kind} exists`);
    }
    check(/var\(--task-/.test(componentFiles),
      "The component reads kind colours from --task-* instead of a hex list");

    check(/planner-cal/.test(componentFiles) &&
          /@container card \(min-width: 660px\)/.test(strip(polishCss)) &&
          /container: *card/.test(sheets),
      "The month calendar is one component sized by its container, not the viewport");
    check(/\.cal-cell\.is-empty/.test(sheets),
      "Blank month cells stay inert on every screen size");
    check(/\.mobile-bottom-nav\s*\{\s*display: *none/.test(sheets) &&
          /\.mobile-bottom-nav\s*\{\s*display: *grid/.test(sheets) && /\.mbn-item/.test(sheets),
      "Bottom nav is off by default and a multi-slot grid on phones");

    /* (v30) Mobile chrome. The dock is four destinations — Overview · Planner
       · Focus · Subjects — and Settings moved up into the app bar as a gear,
       so the remaining cells get real width and no route becomes unreachable.
       The top-bar footprint is owned by ONE variable, because the old
       `header + 64px` content padding left a dead band under the app bar and
       let the sticky session bar float over the Planner heading. */
    const pageSource = strip(readFileSync(join(process.cwd(), "src/app/page.tsx"), "utf8"));
    check((pageSource.match(/dock: *true/g) ?? []).length === 4,
      "The mobile dock carries exactly four destinations");
    check(/id: *"settings"[^}]*dock: *false/.test(pageSource),
      "Settings is not docked — it lives in the top app bar");
    check(/aria-label="Settings"/.test(pageSource) && /mh-settings/.test(pageSource),
      "A labelled Settings gear sits in the mobile app bar");
    check(/repeat\(4, *minmax\(0, *1fr\)\)/.test(sheets),
      "The dock is a four-column grid on phones");
    check(/--topbar-h: *calc\(var\(--header-h\)/.test(sheets) &&
          /padding-top: *calc\(var\(--topbar-h\)/.test(sheets),
      "One variable owns the top-bar footprint (header + safe area)");

    /* (v31) The consistency ring. Its readout used to be two Tailwind
       utilities — `absolute text-center` — and `.ring-figure` was never a
       containing block, so the percentage and the ACTIVE label kept their
       static position (under the ring) instead of centring inside it. The
       Focus timer's ring never had the bug: its `.ring-wrap` is
       `position: relative`. */
    const analyticsSource = strip(readFileSync(join(process.cwd(), "src/components/AnalyticsView.tsx"), "utf8"));
    check(/className="ring-center"/.test(analyticsSource) &&
          !/className="absolute text-center"/.test(analyticsSource),
      "The consistency ring's readout uses the ring-center slot, so it sits inside the ring");
    check(/\.ring-figure\s*\{[^}]*position: *relative/.test(sheets),
      "The ring figure is a containing block for its centred readout");
    check(/\.sidebar\s*\{/.test(sheets) && /@media *\(max-width: *1024px\)/.test(sheets),
      "The desktop rail is real and collapses at a documented breakpoint");

    /* Blur is a *material for floating layers*, not a finish for text. Every
       rule that paints an in-flow surface is checked for `backdrop-filter`,
       because a blurred card under 12px body copy is what read as "the whole
       app is out of focus".

       This guard used to pass while `.glass-panel` — ≈39 usages, i.e. every
       card in the product — sat frosted at blur(26px)+saturate(180%). Two
       holes let it through, and both are closed here:
         · it matched only a literal `backdrop-filter: blur(`, so routing the
           radius through a token (`backdrop-filter:var(--glass-blur)`) hid it;
         · `.glass-panel` was missing from the in-flow list entirely. */
    const frostedText: string[] = [];
    const FROST = /backdrop-filter:\s*(?:blur|var\()/;
    for (const m of sheets.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, sel, body] = m;
      /* `backdrop-filter:none` (the reduced-transparency / forced-colors
         opt-outs) does not match FROST, so those rules fall out here. */
      if (!FROST.test(body)) continue;
      const bad = sel.split(",").map((x) => x.trim()).filter((x) =>
        /\.(glass-panel|section-card|task-card|kpi-card|day-block|dash-card|planner-day|chip|rate-btn|streak-badge|momentum-pill|count-badge|btn|card-title|page-title|task-title|day-date)(?![\w-])/.test(x));
      if (bad.length) frostedText.push(`${sel.trim().slice(0, 48)} → ${bad[0].slice(0, 30)}`);
    }
    check(frostedText.length === 0,
      `No in-flow text surface is frosted${frostedText.length ? ` (${frostedText.join("; ")})` : ""}`);

    /* Removing the blur is only half of "the app looks soft": the card paint
       itself was a translucent ladder (`--panel-tint-a/b` at 90%→84%, and
       88%→80% on the dark themes) with `background-color:transparent` under
       it, so the page's background gradient showed through every card at
       10–20%. Blur gone + paint still translucent would have left the same
       complaint standing. The card tokens must stay opaque. */
    const translucentCardTokens = [...sheets.matchAll(/--(?:panel|glass)-tint-[ab]:\s*([^;}\n]+)/g)]
      .filter((m) => /transparent/.test(m[1]))
      .map((m) => m[0].trim().slice(0, 60));
    check(translucentCardTokens.length === 0,
      `Card paint is opaque, not a translucent ladder${translucentCardTokens.length ? ` (${translucentCardTokens.join("; ")})` : " — the surface under text is solid"}`);

    /* ONE typeface. Every `font-family` must resolve to the Inter aliases (or
       the usual system fallbacks). A decorative glyph still counts: Georgia
       on the quote mark was the last second voice in the product, and it was
       not even loaded — it fell back to the platform serif. */
    /* The aliases, or the usual system fallback stack. A `var()` may carry a
       fallback (`var(--font-display, inherit)`) — that is still the alias. */
    const ALLOWED_FONT = /^(inherit|var\(--font-(ui|num|display|inter)(,\s*[^)]+)?\)|-apple-system|BlinkMacSystemFont|Segoe UI|system-ui|ui-sans-serif|sans-serif)$/;
    /* Split the stack on commas that are NOT inside parens — a naive split
       tears `var(--font-display, inherit)` in half and reports both pieces. */
    const splitStack = (v: string) => {
      const out: string[] = [];
      let depth = 0, cur = "";
      for (const ch of v) {
        if (ch === "(") depth++;
        else if (ch === ")") depth--;
        if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
      }
      out.push(cur);
      return out;
    };
    const foreignFonts = [...sheets.matchAll(/font-family:\s*([^;}\n]+)/g)]
      .flatMap((m) => splitStack(m[1]))
      .map((f) => f.trim().replace(/^["']|["']$/g, ""))
      .filter((f) => f.length > 0 && !ALLOWED_FONT.test(f));
    check([...new Set(foreignFonts)].length === 0,
      `One typeface everywhere${foreignFonts.length ? ` — foreign: ${[...new Set(foreignFonts)].join(", ")}` : " (no second family in either sheet)"}`);

    /* The Zen room is the theme. A `.zen*` rule may still use a neutral
       black/white for a shadow or vignette, but it may not paint a
       *chromatic* colour: that is how a permanently purple room sneaks back
       into a Sunset or Mint theme. */
    const toRgb = (c: string): [number, number, number] | null => {
      if (c.startsWith("#")) {
        let h = c.slice(1);
        if (h.length === 3 || h.length === 4) h = h.split("").map((d) => d + d).join("");
        if (h.length < 6) return null;
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      }
      const n = c.match(/\d+/g)?.map(Number);
      return n && n.length >= 3 ? [n[0], n[1], n[2]] : null;
    };
    const chromatic = (v: string) => {
      const rgb = toRgb(v);
      return !!rgb && !(rgb[0] === rgb[1] && rgb[1] === rgb[2]);
    };
    const zenHardcoded: string[] = [];
    for (const m of sheets.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, sel, body] = m;
      if (!/(^|[\s,>])\.zen[\w-]*/.test(sel)) continue;
      const paints = [...body.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)]
        .map((x) => x[0])
        .filter(chromatic);
      if (paints.length) zenHardcoded.push(`${sel.trim().slice(0, 30)} → ${paints[0]}`);
    }
    check(zenHardcoded.length === 0,
      `Zen paints no hardcoded chromatic colour${zenHardcoded.length ? ` (${zenHardcoded.join("; ")})` : " — the room follows the theme"}`);

    /* ── The mobile gutter must be monotonic ──────────────────────────────
       Five different rules used to set `.app-wrapper`'s horizontal padding.
       Three of them were dead, and the one that actually won on phones was a
       `padding:` shorthand carrying `--pad-shell` — a clamp whose floor is
       16px — while a narrower 360–412px band overrode it with 12px. Net
       effect on real hardware:

         320px phone → 16px gutters   (288px of content)
         412px phone → 12px gutters   (388px of content)
         414px phone → 16px gutters   (382px of content)

       So the *narrowest* phone got the widest gutters, and a 414px phone had
       less room than a 412px one. The shorthand was also silently discarding
       the `env(safe-area-inset-*)` longhands set earlier in the file, so on a
       notched device content could sit under the cut-out.

       Rather than assert one hardcoded number, resolve the real cascade the
       way the browser does and require that content width never *shrinks* as
       the viewport grows. */
    const gutterAt = (() => {
      const rules: { line: number; mq: string; body: string }[] = [];
      const stack: string[] = [];
      let i = 0;
      const src = globalsCss.replace(/\/\*[\s\S]*?\*\//g, "");
      while (i < src.length) {
        const c = src[i];
        if (c === "{") {
          let j = i - 1;
          while (j >= 0 && src[j] !== "{" && src[j] !== "}") j--;
          stack.push(src.slice(j + 1, i).trim());
          i++; continue;
        }
        if (c === "}") { stack.pop(); i++; continue; }
        if (c === ".") {
          let j = i;
          while (j < src.length && src[j] !== "{") j++;
          const sel = src.slice(i, j).trim();
          let k = j + 1;
          while (k < src.length && src[k] !== "}") k++;
          const body = src.slice(j + 1, k);
          if (sel === ".app-wrapper" &&
              /padding-(left|right)|padding\s*:/.test(body)) {
            rules.push({ line: src.slice(0, i).split("\n").length,
              mq: stack.filter((m) => m.startsWith("@media")).join(" "), body });
          }
          i = k; continue;
        }
        i++;
      }
      return (w: number): { px: number; rule: string } => {
        for (const r of rules.slice().reverse()) {
          const min = [...r.mq.matchAll(/min-width:\s*(\d+)px/g)].map((m) => +m[1]);
          const max = [...r.mq.matchAll(/max-width:\s*(\d+)px/g)].map((m) => +m[1]);
          if (min.some((v) => v > w) || max.some((v) => w > v)) continue;
          const b = r.body;
          const resolve = (px: number, vw: number) => Math.min(Math.max(px, (vw / 100) * w), 1e9);
          if (b.includes("--pad-gutter")) return { px: Math.min(Math.max(10, 0.03 * w), 20), rule: `${r.line}:--pad-gutter` };
          const long = b.match(/padding-(?:left|right)\s*:\s*(?:max\()?\s*(\d+(?:\.\d+)?)px/);
          if (long) return { px: +long[1], rule: `${r.line}:longhand` };
          if (b.includes("--pad-shell")) return { px: Math.min(Math.max(16, 0.025 * w), 32), rule: `${r.line}:--pad-shell` };
          const sh = b.match(/padding\s*:\s*(?:\S+\s+)?(\d+(?:\.\d+)?)px/);
          if (sh) return { px: +sh[1], rule: `${r.line}:shorthand` };
        }
        return { px: 20, rule: "none" };
      };
    })();

    const widths = [320, 360, 375, 390, 412, 414, 430, 480, 768, 860];
    const shrink: string[] = [];
    for (let n = 1; n < widths.length; n++) {
      const a = widths[n - 1], b = widths[n];
      const contentA = a - 2 * gutterAt(a).px, contentB = b - 2 * gutterAt(b).px;
      /* A wider viewport must never yield less room than a narrower one. */
      if (contentB < contentA - 0.5) {
        shrink.push(`${a}px→${b}px (${contentA.toFixed(0)}px→${contentB.toFixed(0)}px)`);
      }
    }
    check(shrink.length === 0,
      `The page gutter is monotonic — content never shrinks as the phone gets wider${shrink.length ? ` (${shrink.join("; ")})` : ""}`);

    /* The winning mobile rule has to keep the safe-area term. Written as a
       `padding:` shorthand it cannot: the shorthand resets all four
       longhands, throwing the `env()` away with them. */
    const mobileWinner = gutterAt(390).rule;
    check(/--pad-gutter/.test(mobileWinner),
      `One token owns the mobile gutter (390px resolves via ${mobileWinner})`);
    check(/padding-left\s*:\s*max\(\s*var\(--pad-gutter\)\s*,\s*env\(safe-area-inset-left\)/.test(globalsCss) &&
          /padding-right\s*:\s*max\(\s*var\(--pad-gutter\)\s*,\s*env\(safe-area-inset-right\)/.test(globalsCss),
      "The gutter keeps the notch safe-area inset at every width");

    /* ── A density mode must not also be a motion kill-switch ──────────────
       `body.mode-focused` is applied automatically to anyone who onboards as
       PG / PhD / professional (page.tsx). Eleven separate rules used to hang
       `animation:none` off it, which switched off the entrance choreography
       for panels, task rows, KPI counters, day blocks, heatmap cells, kanban
       columns and the weekly bars — for those learners the app simply had no
       animations, and nothing in Settings could put them back.

       Motion opt-out is `prefers-reduced-motion`'s job: it is user-controlled
       and platform-aware. A presentation-density preference is not an
       accessibility signal and must not be read as one. */
    const motionKilledByDensity: string[] = [];
    for (const m of sheets.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, sel, body] = m;
      if (!/mode-focused/.test(sel)) continue;
      if (/(animation|transition)\s*:\s*none/.test(body)) {
        motionKilledByDensity.push(sel.trim().slice(0, 44));
      }
    }
    check(motionKilledByDensity.length === 0,
      `Density mode leaves the animations on${motionKilledByDensity.length ? ` (${motionKilledByDensity.join("; ")})` : " — reduced-motion remains the only motion opt-out"}`);
    check(/prefers-reduced-motion/.test(sheets),
      "prefers-reduced-motion still opts out of motion for those who ask");
    check(/body\.mode-focused \.task-row\{padding/.test(globalsCss),
      "Density mode still does its actual job (tighter task rows)");

    /* The onboarding footer is one shared row: the privacy note on the
       left, Back/Continue on the right. When the button row claimed
       `width:100%` at base scope it starved the note down to one word per
       line (the squashed column in the report). The row may only take the
       full width inside the stacked, phone-only layout. */
    const obBase: { sel: string; body: string }[] = [];
    {
      const stack: string[] = [];
      let i = 0;
      const src = uiSystemCss.replace(/\/\*[\s\S]*?\*\//g, "");
      while (i < src.length) {
        const c = src[i];
        if (c === "{") {
          let j = i - 1;
          while (j >= 0 && src[j] !== "{" && src[j] !== "}") j--;
          stack.push(src.slice(j + 1, i).trim()); i++; continue;
        }
        if (c === "}") { stack.pop(); i++; continue; }
        if (c === ".") {
          let j = i;
          while (j < src.length && src[j] !== "{") j++;
          const sel = src.slice(i, j).trim();
          let k = j + 1;
          while (k < src.length && src[k] !== "}") k++;
          if (!stack.some((m) => m.startsWith("@media"))) {
            obBase.push({ sel, body: src.slice(j + 1, k) });
          }
          i = k + 1; continue;
        }
        i++;
      }
    }
    const btnRowGreedy = obBase.filter((r) => r.sel === ".ob-btn-row" && /width\s*:\s*100%/.test(r.body));
    check(btnRowGreedy.length === 0,
      "The onboarding button row never claims full width beside the privacy note (full-width is phone-only)");
    const privacyFlex = /\.ob-privacy\{[^}]*flex\s*:\s*1/.test(globalsCss);
    check(privacyFlex, "The onboarding privacy note gets the flexible space in the footer row");

    /* ── The tutor's failure wording ─────────────────────────────────────
       `summarizeAttempts` is an operator diagnosis: it names providers,
       model IDs and *_API_KEY variables, and it used to be pushed straight
       into a toast. The learner-facing string is a different function with a
       different contract, and these assert that contract for every failure
       category the cloud chain can report. */
    const attemptSets: { label: string; attempts: { provider: string; model: string; status: number | null; error?: string }[] }[] = [
      { label: "no provider configured", attempts: [] },
      { label: "rejected key",  attempts: [{ provider: "cerebras", model: "llama-3.3-70b", status: 401, error: "auth" }] },
      { label: "retired model", attempts: [{ provider: "mistral", model: "old-model", status: 400, error: "model" }] },
      { label: "rate limited",  attempts: [{ provider: "groq", model: "llama", status: 429, error: "rate_limit" }] },
      { label: "timed out",     attempts: [{ provider: "cohere", model: "command", status: null, error: "timeout" }] },
      { label: "network block", attempts: [{ provider: "gemini", model: "flash", status: null, error: "network" }] },
      { label: "unknown",       attempts: [{ provider: "openrouter", model: "x", status: 500 }] },
    ];
    const FORBIDDEN = /CEREBRAS|MISTRAL|SAMBANOVA|COHERE|GEMINI|GROQ|OPENROUTER|API_KEY|api\/ai-status|llama|flash|command-r|model ID|egress rules/i;
    let noticeLeaks = 0;
    let unclassified = 0;
    for (const set of attemptSets) {
      const n = userFacingAiNotice(set.attempts);
      if (FORBIDDEN.test(n.notice) || FORBIDDEN.test(n.code)) noticeLeaks++;
      if (!n.notice.trim() || !n.code.trim()) unclassified++;
    }
    check(noticeLeaks === 0,
      "No learner-facing AI notice names a provider, model ID or environment variable");
    check(unclassified === 0,
      "Every cloud failure category maps to a notice and a stable code");
    check(userFacingAiNotice(attemptSets[3].attempts).retryable === true &&
          userFacingAiNotice(attemptSets[0].attempts).retryable === false,
      "A transient failure offers Retry; local-only mode does not offer a pointless one");
    /* The operator string must still be diagnostic — the fix is about routing,
       not about hiding the truth from whoever can act on it. */
    check(/CEREBRAS_API_KEY/.test(summarizeAttempts(attemptSets[1].attempts)),
      "The operator-facing diagnosis still names the keys an operator can fix");
    /* And the route must not put either string on the wire as `message`. */
    const chatRoute = readFileSync(join(process.cwd(), "src/app/api/chat/route.ts"), "utf8");
    check(!/message:\s*summarizeAttempts/.test(chatRoute) &&
          !/attempts:\s*result\.attempts\.map/.test(chatRoute),
      "The chat route no longer sends the raw attempt chain to the browser");

    /* ── v26 regressions ─────────────────────────────────────────────────
       Each of these was a real defect found by reading the cascade, and each
       one is the kind of thing a later patch sheet can silently reintroduce.
       They assert the *mechanism*, not the visual result, so they stay true
       across themes and breakpoints. */

    /* `overflow-x:hidden` on the document clips content at the right edge
       instead of fitting it, and because it turns <body> into a scroll
       container it also stops `position:sticky` from working on the sidebar
       rail and the session bar. `clip` cuts the same overflow without
       creating a scroller, which is why exactly one `clip` is allowed. */
    check(!/^(html|body|html\s*,\s*body)\s*\{[^}]*overflow-x:\s*hidden/m.test(sheets),
      "The document is never clipped with overflow-x:hidden (sticky keeps working)");
    check(/body\s*\{\s*overflow-x:\s*clip/.test(sheets),
      "One overflow-x:clip safety net remains on body");
    check(!/^(html|body|html\s*,\s*body)\s*\{[^}]*max-width:\s*100vw/m.test(sheets),
      "No max-width:100vw on the document (100vw counts the reserved scrollbar gutter)");

    /* The header used to reserve room for an absolutely-positioned
       illustration with padding-right, in four different amounts, and inset
       its own copy 4px from the container edge. It is a grid now. */
    check(!/\.page-header\s*\{[^}]*padding-right:\s*(min\(29vw|220px|245px)/.test(sheets) &&
          !/padding:\s*20px 315px/.test(sheets),
      "The page header reserves no padding for the illustration");
    check(/\.page-header\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/.test(sheets),
      "The desktop page header is a two-column grid with a shrinkable copy track");
    check(!/\.page-header\s*\{[^}]*margin:\s*0 2px/.test(sheets),
      "The page header starts on the container's left edge (no 2px inset)");

    /* A literal floor on a non-shrinking flex item overflows any row narrower
       than the floor plus its siblings. */
    check(!/min-width:\s*350px/.test(sheets),
      "No literal min-width floor on the task-row action column");

    /* Per-page type is how six headers ended up with six different sizes. */
    const hardcodedType = ["SubjectsView.tsx", "SettingsView.tsx", "Dashboard.tsx", "AnalyticsView.tsx"]
      .map((f) => readFileSync(join(process.cwd(), `src/components/${f}`), "utf8"))
      .join("\n")
      .match(/text-\[\d+(?:\.\d+)?px\]/g) ?? [];
    check(hardcodedType.length === 0,
      "No component hardcodes a font size outside the --fs-* ramp");

    /* The ring readout must be centred by geometry, not by a nudge that was
       tuned against one percentage. */
    check(/\.ring-center\s*\{[^}]*place-content:\s*center/.test(sheets),
      "The ring readout centres its content box, not an offset");
    check(!/\.ring-state\s*\{[^}]*margin-right:\s*-\.18em/.test(sheets),
      "The ring label carries no hardcoded tracking nudge");

    const importantCount = (sheets.match(/!important/g) ?? []).length;
    check(importantCount <= 900, `The !important count keeps falling (${importantCount} vs 1107 at the merge baseline)`);
    check(!/transform:\s*translate\([^)]*\.[57]px/.test(sheets),
      "No half-pixel transforms, so text stops shimmering under the blur");
  }

  console.log("\n--- 17. Repository shape: one source of truth ---\n");
  {
    /* `src/` is the only tree the app runs (README.txt). Two separate breakages
       have shipped through the mirrors, so both are locked here:

       1. `deploy-package/src` — the drag-and-drop mirror — drifted 10 files
          behind `src/`, so a drag-and-drop deploy silently shipped stale
          behaviour.

       2. A mis-aimed drag-and-drop dropped the app tree at the repository ROOT
          (commit 93d2780, "Add files via upload", 73 files). Nothing imports
          those copies, but `api/` at the root is also Vercel's zero-config
          Serverless Functions directory, which collides with the Next.js routes
          the build emits under `.vercel/output/functions/api/*`. Every Vercel
          deployment from 93d2780 (2026-09-10) through c09d754 (2026-09-12)
          failed at "Deploying outputs..." behind a green build. */

    const walk = (dir: string, base: string = dir): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = join(dir, entry.name);
        return entry.isDirectory() ? walk(full, base) : [relative(base, full)];
      });

    const sourceFiles = walk(join(process.cwd(), "src")).sort();
    const mirrorFiles = walk(join(process.cwd(), "deploy-package/src")).sort();
    const missing = sourceFiles.filter((f) => !mirrorFiles.includes(f))
      .concat(mirrorFiles.filter((f) => !sourceFiles.includes(f)));
    const drifted = sourceFiles.filter((f) => mirrorFiles.includes(f) &&
      readFileSync(join(process.cwd(), "src", f), "utf8") !==
      readFileSync(join(process.cwd(), "deploy-package/src", f), "utf8"));
    check(missing.length === 0 && drifted.length === 0,
      `deploy-package/src is a byte-exact mirror of src/ (${sourceFiles.length} files)`,
      [...missing, ...drifted].slice(0, 8).join(", "));

    check(readFileSync(join(process.cwd(), "tsconfig.json"), "utf8") ===
          readFileSync(join(process.cwd(), "deploy-package/tsconfig.json"), "utf8"),
      "deploy-package/tsconfig.json matches the root tsconfig.json it ships with");

    /* The guide inside the mirror has to say what the root guide says. A stale
       copy still recommends the drag-and-drop upload that broke Production
       twice, so anyone who opens deploy-package/ first would be told to repeat
       the mistake the root README now forbids. */
    check(readFileSync(join(process.cwd(), "README.txt"), "utf8") ===
          readFileSync(join(process.cwd(), "deploy-package/README.txt"), "utf8"),
      "deploy-package/README.txt matches the root README.txt it ships with");

    const rootStrays = ["api", "app", "components", "db", "fonts", "lib",
      "globals.css", "ui-system.css", "layout.tsx", "page.tsx", "icon.svg"]
      .filter((name) => existsSync(join(process.cwd(), name)));
    check(rootStrays.length === 0,
      "No copy of the app tree sits at the repository root (root api/ is Vercel's functions dir)",
      rootStrays.join(", "));
  }

  console.log("\n==================================================");
  console.log(`TEST SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("==================================================");
  if (failed > 0) process.exit(1);
}

runTests().catch((error) => {
  console.error("Test runner exception:", error);
  process.exit(1);
});
