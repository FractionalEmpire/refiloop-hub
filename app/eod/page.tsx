import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import AppShell from "@/components/AppShell";
import EODClient from "./EODClient";

export default async function EODPage() {
  const user = getCurrentUser();
  if (!user) redirect("/login");
  return (
    <AppShell user={user}>
      <EODClient user={user} />
    </AppShell>
  );
}
