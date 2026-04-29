import { cookies } from "next/headers";

export type User = "david" | "gorjan";

export function getCurrentUser(): User | null {
  const cookieStore = cookies();
  const user = cookieStore.get("rl_user")?.value;
  if (user === "david" || user === "gorjan") return user;
  return null;
}

export function validatePassword(username: string, password: string): boolean {
  if (username === "david") {
    return password === process.env.DAVID_PASSWORD;
  }
  if (username === "gorjan") {
    return password === process.env.GORJAN_PASSWORD;
  }
  return false;
}

export const USER_DISPLAY = {
  david: { name: "David", color: "#58a6ff", initials: "D" },
  gorjan: { name: "Gorjan", color: "#3fb950", initials: "G" },
};
