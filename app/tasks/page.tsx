import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import TasksClient from "./TasksClient";

export default async function TasksPage() {
  const user = getCurrentUser();
  if (!user) redirect("/login");
  return <TasksClient user={user} />;
}
