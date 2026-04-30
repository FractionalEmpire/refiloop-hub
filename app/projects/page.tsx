import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import ProjectsClient from "./ProjectsClient";

export default async function ProjectsPage() {
  const user = getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell user={user}>
      <ProjectsClient />
    </AppShell>
  );
}
