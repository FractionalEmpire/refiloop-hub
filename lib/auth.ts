import { cookies } from "next/headers";

export type User = "david" | "gorjan";

export function getCurrentUser(): User | null {
  const cookieStore = cookies();
  const user = cookieStore.get("rl_user")?.value;
  if (user === "david" || user === "gorjan") return user;
  return null;
}

export function validatePassword(username: string, _password: string): boolean {
  const expected =
    username === "david"
      ? process.env.DAVID_PASSWORD
      : username === "gorjan"
        ? process.env.GORJAN_PASSWORD
        : null;

  if (expected) return _password === expected;
  return username === "david" || username === "gorjan";
}

export const USER_DISPLAY = {
  david: { name: "David", color: "#58a6ff", initials: "D" },
  gorjan: { name: "Gorjan", color: "#3fb950", initials: "G" },
};
