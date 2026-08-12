import { NextResponse } from "next/server";
import { aiSuggestSubjects } from "@/lib/ai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const { courseName, level } = (await req.json()) as { courseName: string; level: string };
  const name = (courseName || "").trim();
  if (!name) return NextResponse.json({ error: "courseName required" }, { status: 400 });
  const result = await aiSuggestSubjects(name, level || "ug");
  return NextResponse.json(result);
}
