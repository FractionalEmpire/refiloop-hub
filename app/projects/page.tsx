import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import ProjectsClient from "./ProjectsClient";

export default async function ProjectsPage() {
  const user = getCurrentUser();
  if (!user) redirect("/login");
  return <ProjectsClient />;
}
