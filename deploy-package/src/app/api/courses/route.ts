import { NextResponse } from "next/server";
import { COURSE_DB, LEVELS, LEVEL_COURSES } from "@/lib/curriculum";
import { activeProvider } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  // Study Planner Pro starts at school level and above. Keep the nursery/
  // pre-school catalog out of the onboarding contract rather than merely
  // hiding the card in the UI.
  const levels = LEVELS.filter((level) => level.id !== "nursery");
  const levelCourses = Object.fromEntries(
    Object.entries(LEVEL_COURSES).filter(([levelId]) => levelId !== "nursery")
  );

  return NextResponse.json({
    levels,
    levelCourses,
    courses: Object.values(COURSE_DB).map((c) => ({
      id: c.id,
      name: c.name,
      level: c.level,
      subjects: c.subjects,
    })),
    aiProvider: activeProvider(),
  });
}
