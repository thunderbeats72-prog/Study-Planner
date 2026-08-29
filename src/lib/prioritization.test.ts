import assert from "node:assert/strict";
import { prioritizeTasks } from "./prioritization";
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
