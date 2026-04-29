import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import TasksClient from "./TasksClient";

export default async function TasksPage() {
  const user = getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell user={user}>
      <TasksClient user={user} />
    </AppShell>
  );
}
