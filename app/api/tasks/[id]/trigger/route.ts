import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  const { data: task, error } = await supabase
    .from("collab_tasks")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (task.assignee !== "claude") {
    return NextResponse.json({ error: "Task is not assigned to Claude" }, { status: 400 });
  }

  await supabase
    .from("collab_tasks")
    .update({
      status: "in_progress",
      triggered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  // Fire executor — don't await (fire and forget)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://refiloop-hub.vercel.app";
  fetch(`${appUrl}/api/tasks/${id}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-key": process.env.INTERNAL_API_KEY || "",
    },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    message: "Claude is on it. Evidence will appear in task notes when done.",
  });
}
