import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  real,
  index,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  userKey: text("user_key").notNull().unique(),
  name: text("name").notNull().default("Learner"),
  level: text("level").notNull().default("ug"),
  course: text("course").notNull().default("custom"),
  courseName: text("course_name").notNull().default("Custom Course"),
  year: text("year").notNull().default("1"),
  onboarded: boolean("onboarded").notNull().default(false),
  streak: integer("streak").notNull().default(0),
  lastStudyDate: text("last_study_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const settings = pgTable(
  "settings",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
  startDate: text("start_date").notNull(),
  examDate: text("exam_date").notNull(),
  dailyHours: real("daily_hours").notNull().default(2),
  subjectsPerDay: integer("subjects_per_day").notNull().default(2),
  studyDays: text("study_days").notNull().default("all"),
  bufferDays: integer("buffer_days").notNull().default(5),
  planMode: text("plan_mode").notNull().default("syllabus"),
  studyStyle: text("study_style").notNull().default("balanced"),
  weakSubject: text("weak_subject").notNull().default("none"),
  revisionWeeks: integer("revision_weeks").notNull().default(1),
  theme: text("theme").notNull().default("silver-lavender"),
  pomodoro: integer("pomodoro").notNull().default(25),
  shortBreak: integer("short_break").notNull().default(5),
  longBreak: integer("long_break").notNull().default(15),
  confetti: boolean("confetti").notNull().default(true),
    sounds: boolean("sounds").notNull().default(true),
  },
  (t) => [index("settings_user_id_idx").on(t.userId)]
);

export const subjects = pgTable(
  "subjects",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull().default("#6366f1"),
    difficulty: text("difficulty").notNull().default("Medium"),
    units: integer("units").notNull().default(6),
    weight: real("weight").notNull().default(1),
    position: integer("position").notNull().default(0),
  },
  (t) => [index("subjects_user_id_idx").on(t.userId)]
);

export const topics = pgTable(
  "topics",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    subjectId: integer("subject_id").notNull(),
  unit: text("unit").notNull().default("Unit 1"),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  objectives: jsonb("objectives").$type<string[]>().notNull().default([]),
  prerequisites: jsonb("prerequisites").$type<string[]>().notNull().default([]),
  keyConcepts: jsonb("key_concepts").$type<string[]>().notNull().default([]),
  practice: text("practice").notNull().default(""),
  depth: text("depth").notNull().default("Core"),
  sources: jsonb("source_details").$type<Array<{
    title: string;
    publisher: string;
    type: "Official syllabus" | "Primary text" | "Reference";
    url?: string;
    note?: string;
    section?: string;
  }>>().notNull().default([]),
  difficulty: text("difficulty").notNull().default("Medium"),
  estMinutes: integer("est_minutes").notNull().default(45),
  position: integer("position").notNull().default(0),
  mastery: integer("mastery").notNull().default(0),
  status: text("status").notNull().default("pending"),
  // FSRS-lite spaced-repetition state
    stability: real("stability").notNull().default(0),
    lastReview: text("last_review").notNull().default(""),
  },
  (t) => [
    index("topics_user_id_idx").on(t.userId),
    index("topics_subject_id_idx").on(t.subjectId),
  ]
);

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    date: text("date").notNull(),
  subjectId: integer("subject_id"),
  topicId: integer("topic_id"),
  kind: text("kind").notNull().default("learn"),
  title: text("title").notNull(),
  detail: text("detail").notNull().default(""),
  plannedMinutes: integer("planned_minutes").notNull().default(45),
  actualMinutes: integer("actual_minutes").notNull().default(0),
    status: text("status").notNull().default("pending"),
    position: integer("position").notNull().default(0),
  },
  (t) => [
    index("tasks_user_id_idx").on(t.userId),
    index("tasks_date_idx").on(t.date),
    index("tasks_subject_id_idx").on(t.subjectId),
    index("tasks_topic_id_idx").on(t.topicId),
    index("tasks_user_date_idx").on(t.userId, t.date),
  ]
);

export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    subjectId: integer("subject_id"),
    taskId: integer("task_id"),
    date: text("date").notNull(),
    minutes: real("minutes").notNull().default(0),
    mode: text("mode").notNull().default("focus"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_date_idx").on(t.date),
    index("sessions_task_id_idx").on(t.taskId),
    index("sessions_user_created_idx").on(t.userId, t.createdAt),
    index("sessions_user_date_idx").on(t.userId, t.date),
  ]
);

/**
 * Coverage telemetry: every course-suggestion query is logged with the
 * resolution source, so we know exactly which courses users search for
 * that only get generic/LLM fallbacks — a ranked to-do list for adding
 * verified catalog entries where they matter most.
 */
export const courseQueries = pgTable("course_queries", {
  id: serial("id").primaryKey(),
  query: text("query").notNull(),
  level: text("level").notNull().default(""),
  source: text("source").notNull().default("unknown"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull(),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("messages_user_id_idx").on(t.userId)]
);

export type User = typeof users.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type Subject = typeof subjects.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type StudySession = typeof sessions.$inferSelect;
export type Message = typeof messages.$inferSelect;
