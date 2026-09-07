import { NextResponse } from "next/server";
import { COURSE_DB, LEVELS, LEVEL_COURSES } from "@/lib/curriculum";
import { activeProvider } from "@/lib/ai";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    levels: LEVELS,
    levelCourses: LEVEL_COURSES,
    courses: Object.values(COURSE_DB).map((c) => ({
      id: c.id,
      name: c.name,
      level: c.level,
      subjects: c.subjects,
    })),
    aiProvider: activeProvider(),
  });
}
