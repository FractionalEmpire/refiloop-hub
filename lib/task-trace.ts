import { supabase } from "@/lib/supabase";

export async function appendTaskTrace(taskId: string, message: string) {
  const stamped = `[${new Date().toISOString()}] ${message}`;
  const { data } = await supabase.from("collab_tasks").select("notes").eq("id", taskId).single();
  const prev = data?.notes || "";
  const updated = prev ? `${prev}\n\n${stamped}` : stamped;

  await supabase
    .from("collab_tasks")
    .update({ notes: updated, updated_at: new Date().toISOString() })
    .eq("id", taskId);

  console.log(`[task:${taskId}] ${message}`);
  return updated;
}

export function envStatus() {
  return {
    anthropic: Boolean(process.env.BUILDER_HUB_ANTHROPIC_KEY || process.env.ANTHROPIC_API_KEY),
    github: Boolean(process.env.GITHUB_TOKEN),
    internalApiKey: Boolean(process.env.INTERNAL_API_KEY),
    supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabaseServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}
