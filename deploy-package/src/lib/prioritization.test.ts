import assert from "node:assert/strict";
import { prioritizeTasks, nextAction, weakestSubjectIds } from "./prioritization";
import type { TaskRow } from "./client";

const task = (patch: Partial<TaskRow>): TaskRow => ({
  id: 1, userId: 1, date: "2026-08-29", subjectId: null, topicId: null,
  kind: "learn", title: "Task", detail: "", plannedMinutes: 30,
  actualMinutes: 0, status: "pending", position: 0, ...patch,
});

const result = prioritizeTasks([
  task({ id: 1, title: "Today lesson", date: "2026-08-29" }),
  task({ id: 2, title: "Overdue lesson", date: "2026-08-27" }),
  task({ id: 3, title: "Revision", date: "2026-08-29", kind: "revise", plannedMinutes: 20 }),
], "2026-08-29");

assert.equal(result[0].id, 2);
assert.equal(result[0].reason, "overdue");
assert.equal(result[0].priorityLabel, "Start here");
assert.equal(result.some((item) => item.id === 3 && (item.reason === "due-soon" || item.reason === "revision")), true);
assert.equal(result.length, 3);

// Completed and skipped tasks are excluded from the queue.
assert.equal(prioritizeTasks([
  task({ id: 1, status: "done", date: "2026-08-27" }),
  task({ id: 2, status: "skipped", date: "2026-08-27" }),
], "2026-08-29").length, 0);

// Today outranks a normal future task.
const todayFirst = prioritizeTasks([
  task({ id: 10, date: "2026-09-10", title: "Future" }),
  task({ id: 11, date: "2026-08-29", title: "Today" }),
], "2026-08-29");
assert.equal(todayFirst[0].id, 11);
assert.equal(todayFirst[0].reason, "due-today");

// Revision due today ranks above a normal lesson due today.
const reviseFirst = prioritizeTasks([
  task({ id: 20, kind: "learn", date: "2026-08-29" }),
  task({ id: 21, kind: "revise", date: "2026-08-29" }),
], "2026-08-29");
assert.equal(reviseFirst[0].id, 21);

// Weak-subject tasks outrank same-day siblings from stronger subjects.
const weakFirst = prioritizeTasks([
  task({ id: 30, subjectId: 1, date: "2026-09-12" }),
  task({ id: 31, subjectId: 2, date: "2026-09-12" }),
], "2026-08-29", { weakSubjectIds: [2] });
assert.equal(weakFirst[0].id, 31);
assert.equal(weakFirst[0].reason, "weak-subject");

// Deterministic: identical inputs always yield identical order; near-equal
// tasks settle by id, so the order never flickers between renders.
const a = prioritizeTasks([
  task({ id: 1, date: "2026-08-29" }),
  task({ id: 2, date: "2026-08-29" }),
], "2026-08-29");
const b = prioritizeTasks([
  task({ id: 2, date: "2026-08-29" }),
  task({ id: 1, date: "2026-08-29" }),
], "2026-08-29");
assert.deepEqual(a.map((x) => x.id), b.map((x) => x.id));
assert.equal(a[0].id, 1);

// A partially completed task reads as "continue", not "start".
const partial = prioritizeTasks([
  task({ id: 40, date: "2026-08-29", actualMinutes: 12 }),
], "2026-08-29");
assert.equal(partial[0].priorityLabel, "Continue with this");

// nextAction exposes the NOW/NEXT pair for the hero and the AI.
const pair = nextAction([
  task({ id: 1, date: "2026-08-29" }),
  task({ id: 2, date: "2026-08-29" }),
], "2026-08-29");
assert.equal(pair.now?.id, 1);
assert.equal(pair.next?.id, 2);

// Weakest subjects are the ones with the lowest completion ratio.
assert.deepEqual(weakestSubjectIds([
  { id: 1, done: 2, total: 4 },
  { id: 2, done: 0, total: 4 },
  { id: 3, done: 0, total: 0 },
]), [2]);

console.log("prioritization.test.ts: all assertions passed");
