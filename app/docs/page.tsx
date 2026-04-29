import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import DocsClient from "./DocsClient";

export default async function DocsPage() {
  const user = getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell user={user}>
      <DocsClient user={user} />
    </AppShell>
  );
}
