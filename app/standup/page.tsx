import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import StandupClient from "./StandupClient";

export default async function StandupPage() {
  const user = getCurrentUser();
  if (!user) redirect("/login");
  return <StandupClient user={user} />;
}
