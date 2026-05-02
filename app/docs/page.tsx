import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import DocsClient from "./DocsClient";

export default async function DocsPage() {
  const user = getCurrentUser();
  if (!user) redirect("/login");
  return <DocsClient user={user} />;
}
