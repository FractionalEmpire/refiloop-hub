import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Server-side only — uses service role key
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export type Task = {
  id: string;
  title: string;
  description: string | null;
  assignee: "david" | "gorjan" | "both" | "claude";
  status: "todo" | "in_progress" | "done" | "blocked";
  priority: "p0" | "p1" | "p2" | "later";
  project: string | null;
  notes: string | null;
  type: "bug" | "feature" | "task";
  triggered_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type EODUpdate = {
  id: string;
  author: "david" | "gorjan";
  content: string;
  blockers: string | null;
  task_ids_completed: string[] | null;
  created_at: string;
  date: string;
};
