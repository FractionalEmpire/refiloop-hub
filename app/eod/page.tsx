import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import EODClient from "./EODClient";

export default async function EODPage() {
  const user = getCurrentUser();
  if (!user) redirect("/login");
  return <EODClient user={user} />;
}
