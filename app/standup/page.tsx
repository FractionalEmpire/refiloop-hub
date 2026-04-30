import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import StandupClient from "./StandupClient";

export default async function StandupPage() {
  const user = getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell user={user}>
      <StandupClient user={user} />
    </AppShell>
  );
}
