import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/session";
import { getFlashcardJob } from "@/lib/ai/flashcard-jobs";

export const dynamic = "force-dynamic";

/**
 * Polling endpoint for background generation jobs.
 *
 * The client only ever sees its own jobs. When a job is complete the response
 * includes the generated cards so the UI can display the deck immediately.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const job = await getFlashcardJob(userId, id);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job, {
    headers: { "Cache-Control": "no-store" },
  });
}
