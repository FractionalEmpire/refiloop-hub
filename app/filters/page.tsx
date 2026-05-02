import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import FiltersClient from "./FiltersClient";

export default async function FiltersPage() {
  const user = getCurrentUser();
  if (!user) redirect("/login");
  return <FiltersClient />;
}
